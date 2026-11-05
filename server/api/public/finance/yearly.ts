interface BillRow {
  bill_month: string
  income: number
  expense: number
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = positiveId(input.venueId, '场所ID')
  const year = String(input.year ?? '').trim()
  if (!/^(19|20)\d{2}$/.test(year)) {
    throw createError({ statusCode: 400, message: '年份格式必须为 YYYY' })
  }

  const rows = await query<BillRow>(
    `SELECT bill_month, income, expense
     FROM bills
     WHERE venue_id = ? AND bill_month BETWEEN ? AND ? AND state = 'approved' AND published = 1
     ORDER BY bill_month ASC`,
    [venueId, `${year}-01`, `${year}-12`]
  )
  // 月结余实时计算：期初结余 + 截至当月末的明细净额，逐月滚动（含未公开月份的净额，保证链条连续）
  const [venue, nets] = await Promise.all([
    queryOne<{ opening_balance: number | string }>('SELECT opening_balance FROM venues WHERE id = ?', [venueId]),
    query<{ ym: string, net: number | string }>(
      `SELECT DATE_FORMAT(occurred_on, '%Y-%m') AS ym,
              SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END) AS net
       FROM bill_items WHERE venue_id = ? AND occurred_on < ? GROUP BY ym`,
      [venueId, `${Number(year) + 1}-01-01`]
    )
  ])
  const netByMonth = new Map(nets.map(row => [row.ym, Number(row.net)]))
  let running = Math.round(Number(venue?.opening_balance ?? 0) * 100) / 100
  for (const [ym, net] of netByMonth) {
    if (ym < `${year}-01`) running = Math.round((running + net) * 100) / 100
  }
  const rowByMonth = new Map(rows.map(row => [row.bill_month, row]))
  const months: { month: string, income: number, expense: number, currentBalance: number }[] = []
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    running = Math.round((running + (netByMonth.get(ym) ?? 0)) * 100) / 100
    const row = rowByMonth.get(ym)
    if (row) {
      months.push({ month: ym, income: Number(row.income), expense: Number(row.expense), currentBalance: running })
    }
  }
  const totals = months.reduce(
    (acc, month) => ({
      income: Math.round((acc.income + month.income) * 100) / 100,
      expense: Math.round((acc.expense + month.expense) * 100) / 100
    }),
    { income: 0, expense: 0 }
  )
  return { venueId, year, months, totals }
})
