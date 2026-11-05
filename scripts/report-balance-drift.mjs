// 结余差额报告（只读，不写库）：月结余改为"全部明细净额实时累计"后，
// 各场所最新月份的实时结余与切换前账面结余的差额清单。
//
// 差额即该场所需要调平的金额：在最早月份的账单里补一笔"期初结转"
// （差额为正补收入、为负补支出）后，对外展示的结余即与切换前一致。
// 差额为 0 的场所无需任何处理。
//
// 用法（在项目根目录执行）：
//   node --env-file=.env scripts/report-balance-drift.mjs

import mysql from 'mysql2/promise'

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

const [rows] = await db.query(
  `SELECT v.id, v.name,
          (SELECT b.bill_month FROM bills b WHERE b.venue_id = v.id ORDER BY b.bill_month ASC LIMIT 1) AS first_month,
          (SELECT b.current_balance FROM bills b WHERE b.venue_id = v.id ORDER BY b.bill_month DESC LIMIT 1) AS stored_latest,
          (SELECT COALESCE(SUM(CASE WHEN i.kind = 'income' THEN i.amount ELSE -i.amount END), 0)
           FROM bill_items i WHERE i.venue_id = v.id) AS net
   FROM venues v ORDER BY v.id`
)

const round2 = (value) => Math.round(value * 100) / 100
let changed = 0
console.log('场所 | 最早账单 | 实时最新结余 | 切换前账面 | 差额（需调平金额）')
for (const row of rows) {
  if (row.first_month === null) continue
  const net = round2(Number(row.net))
  const stored = round2(Number(row.stored_latest))
  const drift = round2(stored - net)
  if (drift !== 0) changed += 1
  const action = drift > 0 ? `补收入 ${drift.toFixed(2)}` : drift < 0 ? `补支出 ${(-drift).toFixed(2)}` : '无需处理'
  console.log(`${row.name} | ${row.first_month} | ${net.toFixed(2)} | ${stored.toFixed(2)} | ${action}`)
}
console.log(`\n共 ${rows.length} 个场所，其中 ${changed} 个需要在最早月份补一笔"期初结转"调平。`)
await db.end()
