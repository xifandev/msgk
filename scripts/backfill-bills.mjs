// 财务公开月度账单补齐：为每个场所补齐缺失月份（截至当月）的 draft 账单，并按月链式结转结余。
//
// 用法（在项目根目录执行）：
//   干跑（默认，只统计将创建的账单，不写库）：
//     node --env-file=.env scripts/backfill-bills.mjs
//   实际执行：
//     node --env-file=.env scripts/backfill-bills.mjs --apply
//
// 说明：
// - 每个场所从其最早一张账单的月份开始，一直补到当月；已存在的月份跳过。
// - 从未建过账单的场所只创建当月一张，不虚构历史。
// - 新补账单的 previous_balance / current_balance 取上一月份（已有或新补）的 current_balance，逐月链式结转。
// - 已有账单一律不修改；全部插入在一个事务内完成，重复执行幂等。

import mysql from 'mysql2/promise'

const APPLY = process.argv.includes('--apply')

const env = (key) => process.env[key] || ''
const required = ['NITRO_DB_HOST', 'NITRO_DB_NAME', 'NITRO_DB_USER']
const missing = required.filter((k) => !env(k))
if (missing.length) {
  console.error(`环境变量缺失：${missing.join('、')}（请确认 .env 已填写并用 --env-file=.env 运行）`)
  process.exit(1)
}

function nextMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const now = new Date()
const CURRENT_MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

const db = await mysql.createConnection({
  host: env('NITRO_DB_HOST'),
  port: Number(env('NITRO_DB_PORT') || 3306),
  user: env('NITRO_DB_USER'),
  password: env('NITRO_DB_PASSWORD'),
  database: env('NITRO_DB_NAME'),
  charset: 'utf8mb4',
  decimalNumbers: true
})

const [venues] = await db.query('SELECT id, name, township FROM venues ORDER BY township, sort_order, id')
const [billRows] = await db.query('SELECT venue_id, bill_month, current_balance FROM bills ORDER BY bill_month')

const billsByVenue = new Map()
for (const row of billRows) {
  if (!billsByVenue.has(row.venue_id)) billsByVenue.set(row.venue_id, new Map())
  billsByVenue.get(row.venue_id).set(row.bill_month, Number(row.current_balance))
}

const plan = []
for (const venue of venues) {
  const existing = billsByVenue.get(venue.id) ?? new Map()
  const months = [...existing.keys()].sort()
  let month = months[0] ?? CURRENT_MONTH
  if (month > CURRENT_MONTH) continue
  let balance = 0
  const toCreate = []
  while (month <= CURRENT_MONTH) {
    if (existing.has(month)) {
      balance = existing.get(month)
    } else {
      toCreate.push({ month, balance })
    }
    month = nextMonth(month)
  }
  if (toCreate.length) plan.push({ venue, toCreate })
}

const total = plan.reduce((sum, p) => sum + p.toCreate.length, 0)
console.log(`目标月份：截至 ${CURRENT_MONTH}，共 ${plan.length} 个场所需要补齐 ${total} 张账单`)
for (const { venue, toCreate } of plan) {
  console.log(`- [${venue.township}] ${venue.name}：${toCreate.map((t) => t.month).join('、')}`)
}

if (!APPLY) {
  console.log('\n干跑结束，未写入数据库。确认无误后加 --apply 实际执行。')
} else if (total > 0) {
  await db.beginTransaction()
  try {
    for (const { venue, toCreate } of plan) {
      for (const { month, balance } of toCreate) {
        await db.query(
          'INSERT INTO bills (venue_id, bill_month, previous_balance, current_balance) VALUES (?, ?, ?, ?)',
          [venue.id, month, balance, balance]
        )
      }
    }
    await db.commit()
    console.log(`\n已写入 ${total} 张账单。`)
  } catch (error) {
    await db.rollback()
    console.error('写入失败，已回滚：', error.message)
    process.exitCode = 1
  }
}

await db.end()
