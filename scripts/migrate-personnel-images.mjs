// 场所人员照片迁移：旧图床（imgs.getweb.cn 等非 OSS 地址）→ 阿里云 OSS，并回写新库。
//
// 用法（在项目根目录执行）：
//   干跑（默认，只检查和统计，不写 OSS、不改库）：
//     node --env-file=.env scripts/migrate-personnel-images.mjs
//   实际执行（下载旧图 → 上传 OSS → 更新 personnel.members）：
//     node --env-file=.env scripts/migrate-personnel-images.mjs --apply
//
// 说明：
// - OSS 对象键为 msgk/images/legacy/<url-sha1前20位>.<ext>，按源地址确定性生成，
//   重复执行不会重复上传（已存在则跳过上传，仅补齐数据库回写）。
// - 已是本 bucket OSS 地址的 imageUrl 直接跳过；空值/相对路径跳过并计数。
// - 下载失败的老图不会回写数据库，最后在失败清单中列出，可人工处理。
// - 仅修改 personnel 表的 members JSON，不动其他字段；全部更新在一个事务内完成。

import mysql from 'mysql2/promise'
import OSS from 'ali-oss'
import crypto from 'node:crypto'

const APPLY = process.argv.includes('--apply')
const CONCURRENCY = 4
const FETCH_TIMEOUT_MS = 30_000

const env = (key) => process.env[key] || ''
const required = [
  'NITRO_DB_HOST', 'NITRO_DB_NAME', 'NITRO_DB_USER',
  'NITRO_OSS_BUCKET', 'NITRO_OSS_REGION',
  'NITRO_ALIYUN_ACCESS_KEY_ID', 'NITRO_ALIYUN_ACCESS_KEY_SECRET'
]
const missing = required.filter((k) => !env(k))
if (missing.length) {
  console.error(`环境变量缺失：${missing.join('、')}（请确认 .env 已填写并用 --env-file=.env 运行）`)
  process.exit(1)
}

const bucket = env('NITRO_OSS_BUCKET')
const region = env('NITRO_OSS_REGION')
const ossHost = `${bucket}.${region}.aliyuncs.com`

const oss = new OSS({
  bucket,
  region,
  accessKeyId: env('NITRO_ALIYUN_ACCESS_KEY_ID'),
  accessKeySecret: env('NITRO_ALIYUN_ACCESS_KEY_SECRET'),
  secure: true
})

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp'
}

function extFromUrl(url) {
  const m = new URL(url).pathname.match(/\.(jpe?g|png|gif|webp|bmp)$/i)
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : ''
}

function ossKeyFor(url, contentType) {
  const ext = extFromUrl(url) || EXT_BY_TYPE[contentType] || '.jpg'
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)
  return `msgk/images/legacy/${hash}${ext}`
}

async function fetchImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!contentType.startsWith('image/')) throw new Error(`非图片内容：${contentType || '未知类型'}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length) throw new Error('空文件')
    return { buffer, contentType }
  } finally {
    clearTimeout(timer)
  }
}

async function ossExists(key) {
  try {
    await oss.head(key)
    return true
  } catch {
    return false
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }))
  return results
}

const db = await mysql.createConnection({
  host: env('NITRO_DB_HOST'),
  port: Number(env('NITRO_DB_PORT') || 3306),
  user: env('NITRO_DB_USER'),
  password: env('NITRO_DB_PASSWORD'),
  database: env('NITRO_DB_NAME'),
  charset: 'utf8mb4'
})

const [rows] = await db.query('SELECT id, venue_id, members FROM personnel')
console.log(`personnel 记录：${rows.length} 条`)

// 收集所有需要迁移的 imageUrl
const tasks = new Map() // url -> [{ row, memberIndex }]
const stats = { members: 0, empty: 0, alreadyOss: 0, other: 0 }
for (const row of rows) {
  const members = Array.isArray(row.members) ? row.members : []
  members.forEach((member, idx) => {
    stats.members++
    const url = member && typeof member.imageUrl === 'string' ? member.imageUrl.trim() : ''
    if (!url) { stats.empty++; return }
    let host = ''
    try { host = new URL(url).host } catch { stats.other++; return }
    if (host === ossHost) { stats.alreadyOss++; return }
    if (!/^https?:$/.test(new URL(url).protocol)) { stats.other++; return }
    if (!tasks.has(url)) tasks.set(url, [])
    tasks.get(url).push({ row, memberIndex: idx })
  })
}
console.log(`成员总数：${stats.members}；无照片 ${stats.empty}；已是 OSS ${stats.alreadyOss}；异常地址 ${stats.other}`)
console.log(`待迁移唯一图片：${tasks.size} 张`)

const failures = []
const mapping = new Map() // oldUrl -> newUrl

await mapLimit([...tasks.keys()], CONCURRENCY, async (url) => {
  try {
    const { buffer, contentType } = await fetchImage(url)
    const key = ossKeyFor(url, contentType)
    const newUrl = `https://${ossHost}/${key}`
    if (APPLY) {
      if (!(await ossExists(key))) {
        await oss.put(key, buffer, { headers: { 'Content-Type': contentType } })
      }
    }
    mapping.set(url, newUrl)
    console.log(`${APPLY ? '已迁移' : '可迁移'}  ${url}  ->  ${newUrl}  (${(buffer.length / 1024).toFixed(1)} KB)`)
  } catch (error) {
    failures.push({ url, error: String(error.message || error) })
    console.error(`失败      ${url}  ${error.message || error}`)
  }
})

console.log(`\n成功 ${mapping.size} / ${tasks.size}，失败 ${failures.length}`)

if (APPLY && mapping.size) {
  await db.beginTransaction()
  try {
    let touched = 0
    for (const row of rows) {
      const members = Array.isArray(row.members) ? row.members : []
      let changed = false
      for (const member of members) {
        const url = member && typeof member.imageUrl === 'string' ? member.imageUrl.trim() : ''
        if (url && mapping.has(url)) {
          member.imageUrl = mapping.get(url)
          changed = true
        }
      }
      if (changed) {
        await db.query('UPDATE personnel SET members = ? WHERE id = ?', [JSON.stringify(members), row.id])
        touched++
      }
    }
    await db.commit()
    console.log(`数据库已更新：${touched} 条 personnel 记录`)
  } catch (error) {
    await db.rollback()
    console.error('数据库回写失败，已回滚：', error.message || error)
    process.exitCode = 1
  }
} else if (!APPLY) {
  console.log('\n干跑模式：未上传 OSS、未修改数据库。确认无误后加 --apply 执行。')
}

if (failures.length) {
  console.log('\n失败清单（数据库中仍保留旧地址）：')
  for (const f of failures) console.log(`- ${f.url}：${f.error}`)
}

await db.end()
