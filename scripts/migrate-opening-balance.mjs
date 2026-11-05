// 期初结余迁移：为 venues 增加 opening_balance 字段，并反推每个场所的期初结余。
//
// 背景：账单的“上月结余 / 本月结余”改为实时计算（期初结余 + 截至当月末的明细净额），不再落库。
// 本脚本负责让实时计算的结果与历史账面保持一致：
//   期初结余 = 最新一张账单的 current_balance − 截至该月末的全部明细净额
// 这样最近一次人工校准之后的所有月份，实时计算值与原账面分毫不差；更早的月份若存在
// 多次人工修改结余造成的断链，会在校验报告中逐月列出差异，供人工核对。
//
// 用法（在项目根目录执行）：
//   干跑（默认，只输出每个场所的期初值和校验报告，不写库）：
//     node --env-file=.env scripts/migrate-opening-balance.mjs
//   实际执行（加字段并写入期初结余）：
//     node --env-file=.env scripts/migrate-opening-balance.mjs --apply

import mysql from 'mysql2/promise'

const APPLY = process.argv.includes('--apply')

const env = (key) => process.env[key] || ''
const required = ['NITRO_DB_HOST', 'NITRO_DB_NAME', 'NITRO_DB_USER']
const missing = required.filter((k) => !env(k))
if (missing.length) {
  console.error(`环境变量缺失：${missing.join('、')}（请确认 .env 已填写并用 --env-file=.env 运行）`)
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

const round2 = (value) => Math.round(value * 100) / 100

function nextMonthStart(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 10)
}

// 1. 确保 venues.opening_balance 字段存在
const [columns] = await db.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'venues' AND COLUMN_NAME = 'opening_balance'`,
  [env('NITRO_DB_NAME')]
)
if (columns.length === 0) {
  if (APPLY) {
    await db.query('ALTER TABLE venues ADD COLUMN opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER sort_order')
    console.log('已为 venues 表添加 opening_balance 字段')
  } else {
    console.log('[干跑] venues 表缺少 opening_balance 字段，--apply 时将自动添加')
  }
}

// 2. 逐场所反推期初结余并校验链条
const [venues] = await db.query('SELECT id, name FROM venues ORDER BY id')
const [bills] = await db.query(
  'SELECT id, venue_id, bill_month, income, expense, previous_balance, current_balance FROM bills ORDER BY venue_id, bill_month'
)
const billsByVenue = new Map()
for (const bill of bills) {
  if (!billsByVenue.has(bill.venue_id)) billsByVenue.set(bill.venue_id, [])
  billsByVenue.get(bill.venue_id).push(bill)
}

const openings = new Map()
let mismatchVenues = 0
for (const venue of venues) {
  const venueBills = billsByVenue.get(venue.id) ?? []
  if (!venueBills.length) {
    openings.set(venue.id, 0)
    continue
  }
  const latest = venueBills[venueBills.length - 1]
  const [nets] = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END), 0) AS net
     FROM bill_items WHERE venue_id = ? AND occurred_on < ?`,
    [venue.id, nextMonthStart(latest.bill_month)]
  )
  const opening = round2(Number(latest.current_balance) - Number(nets[0].net))
  openings.set(venue.id, opening)

  // 用期初值重放整条链，与原账面逐月对比
  let running = opening
  const diffs = []
  for (const bill of venueBills) {
    running = round2(running + Number(bill.income) - Number(bill.expense))
    if (Math.abs(running - Number(bill.current_balance)) > 0.005) {
      diffs.push(`${bill.bill_month}（账面 ${Number(bill.current_balance).toFixed(2)} → 实时 ${running.toFixed(2)}）`)
    }
  }
  if (diffs.length) {
    mismatchVenues += 1
    console.log(`\n场所「${venue.name}」(#${venue.id}) 期初结余 ${opening.toFixed(2)}，以下月份改用实时值后将变化：`)
    for (const diff of diffs) console.log(`  - ${diff}`)
  } else {
    console.log(`场所「${venue.name}」(#${venue.id}) 期初结余 ${opening.toFixed(2)}，全链条一致`)
  }
}

// 3. 写库
if (APPLY) {
  for (const [venueId, opening] of openings) {
    await db.query('UPDATE venues SET opening_balance = ? WHERE id = ?', [opening.toFixed(2), venueId])
  }
  console.log(`\n已写入 ${openings.size} 个场所的期初结余。`)
} else {
  console.log(`\n[干跑] 共 ${venues.length} 个场所，其中 ${mismatchVenues} 个存在历史断链（见上方明细）。确认无误后用 --apply 执行。`)
}

await db.end()
