// 历史期初结余补录（一次性数据修复，可重复执行且幂等）
//
// 背景：老系统 zhangdan 表用 shangyue_jieyu（上月结余）/ benyue_jieyu（本月结余）人工维护账面，
// 新系统改为按 bill_items 实时累计后，期初结余与历史上的手工账面差全部丢失，导致大量场所期末结余为负。
//
// 本脚本按 database/opening-balance-2026-11.csv 补两类明细（kind = 'opening'，只进结余、不进收支合计）：
//   1. 期初结余：老库第一张账单填写的"上月结余"，即该场所启用系统时的期初资金；
//   2. 历史结余调整：老库账面与明细累计在该月的差额，用于逐月对齐老系统已公开的数字。
// 直接写库，不改变账单审核状态，明细落在对应月份的账单下。
//
// 用法（项目根目录）：
//   node --env-file=.env scripts/fix-opening-balance.mjs            # 只预演，不写库
//   node --env-file=.env scripts/fix-opening-balance.mjs --apply    # 实际写入
//   node --env-file=.env scripts/fix-opening-balance.mjs --file=xxx.csv

import mysql from 'mysql2/promise'
import { readFileSync } from 'node:fs'

const env = key => process.env[key] || ''
const required = ['NITRO_DB_HOST', 'NITRO_DB_NAME', 'NITRO_DB_USER']
const missing = required.filter(key => !env(key))
if (missing.length) {
  console.error(`环境变量缺失：${missing.join('、')}（请确认 .env 已填写并用 --env-file=.env 运行）`)
  process.exit(1)
}
const apply = process.argv.includes('--apply')
const fileArg = process.argv.find(arg => arg.startsWith('--file='))
const file = fileArg ? fileArg.slice('--file='.length) : 'database/opening-balance-2026-11.csv'

const rows = readFileSync(file, 'utf8')
  .split('\n')
  .slice(1)
  .map(line => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [venueId, billMonth, kind, summary, amount] = line.split(',')
    return { venueId: Number(venueId), billMonth, kind, summary, amount: Number(amount) }
  })
  .filter(row => Number.isFinite(row.venueId) && /^\d{4}-\d{2}$/.test(row.billMonth) && row.kind === 'opening')
if (!rows.length) {
  console.error(`补录清单为空：${file}`)
  process.exit(1)
}

const db = await mysql.createConnection({
  host: env('NITRO_DB_HOST'),
  port: Number(env('NITRO_DB_PORT') || 3306),
  user: env('NITRO_DB_USER'),
  password: env('NITRO_DB_PASSWORD'),
  database: env('NITRO_DB_NAME'),
  charset: 'utf8mb4',
  decimalNumbers: true
})

const [venues] = await db.query('SELECT id, name FROM venues')
const venueName = new Map(venues.map(row => [Number(row.id), row.name]))
const [bills] = await db.query('SELECT id, venue_id, bill_month, state, published FROM bills')
const billOf = new Map(bills.map(row => [`${row.venue_id}|${row.bill_month}`, row]))
// 幂等判重：同一场所、同月、同摘要的期初类明细已存在则跳过
const [existing] = await db.query(
  `SELECT i.venue_id, b.bill_month, i.summary
   FROM bill_items i JOIN bills b ON b.id = i.bill_id WHERE i.kind = 'opening'`
)
const done = new Set(existing.map(row => `${row.venue_id}|${row.bill_month}|${row.summary}`))

let insert = 0
let skip = 0
const problems = []
const perVenue = new Map()
const pending = []
for (const row of rows) {
  const bill = billOf.get(`${row.venueId}|${row.billMonth}`)
  if (!bill) { problems.push(`缺少账单：${venueName.get(row.venueId) ?? row.venueId} ${row.billMonth}`); continue }
  if (done.has(`${row.venueId}|${row.billMonth}|${row.summary}`)) { skip += 1; continue }
  insert += 1
  pending.push({ ...row, billId: Number(bill.id) })
  if (!perVenue.has(row.venueId)) perVenue.set(row.venueId, [])
  perVenue.get(row.venueId).push(row)
}
if (problems.length) {
  console.error('清单与数据库不匹配，已终止：')
  for (const p of problems) console.error('  ', p)
  await db.end()
  process.exit(1)
}

console.log(`清单：${rows.length} 条，待写入 ${insert} 条，因场所已有期初结余跳过 ${skip} 条，涉及场所 ${perVenue.size} 个`)
for (const [venueId, list] of [...perVenue.entries()].sort((a, b) => a[0] - b[0])) {
  const total = list.reduce((sum, item) => sum + item.amount, 0)
  console.log(`  ${venueName.get(venueId) ?? venueId}：${list.map(item => `${item.billMonth} ${item.summary} ${item.amount.toFixed(2)}`).join('；')}（合计 ${total.toFixed(2)}）`)
}

if (!apply) {
  console.log('\n预演结束，未写入。确认后加 --apply 执行。')
  await db.end()
  process.exit(0)
}

const conn = db
try {
  await conn.beginTransaction()
  for (const row of pending) {
    await conn.query(
      `INSERT INTO bill_items (bill_id, venue_id, occurred_on, kind, summary, amount, created_by, created_at)
       VALUES (?, ?, ?, 'opening', ?, ?, NULL, ?)`,
      [row.billId, row.venueId, `${row.billMonth}-01`, row.summary, row.amount, `${row.billMonth}-01 00:00:00`]
    )
  }
  await conn.commit()
  console.log(`\n已写入 ${insert} 条期初结余明细。`)
} catch (error) {
  await conn.rollback()
  console.error('写入失败，已回滚：', error.message)
  process.exitCode = 1
} finally {
  await db.end()
}
