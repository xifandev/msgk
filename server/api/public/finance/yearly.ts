interface BillRow {
  bill_month: string
}

interface AggregateRow {
  ym: string
  income: number | string
  expense: number | string
  net: number | string
}

const round2 = (value: number) => Math.round(value * 100) / 100

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = positiveId(input.venueId, '场所ID')
  const year = String(input.year ?? '').trim()
  if (!/^(19|20)\d{2}$/.test(year)) {
    throw createError({ statusCode: 400, message: '年份格式必须为 YYYY' })
  }

  // 只列出已审核通过且对外公开的月份
  const rows = await query<BillRow>(
    `SELECT bill_month
     FROM bills
     WHERE venue_id = ? AND bill_month BETWEEN ? AND ? AND state = 'approved' AND published = 1
     ORDER BY bill_month ASC`,
    [venueId, `${year}-01`, `${year}-12`]
  )
  const published = new Set(rows.map(row => row.bill_month))

  // 收入、支出、期末结余全部按明细现算；结余按截至当月末的明细净额滚动
  const aggregates = await query<AggregateRow>(
    `SELECT DATE_FORMAT(occurred_on, '%Y-%m') AS ym,
            COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0) AS expense,
            COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END), 0) AS net
     FROM bill_items WHERE venue_id = ? AND occurred_on < ? GROUP BY ym ORDER BY ym`,
    [venueId, `${Number(year) + 1}-01-01`]
  )
  const byMonth = new Map(aggregates.map(row => [row.ym, row]))
  let running = 0
  for (const row of aggregates) {
    if (row.ym < `${year}-01`) running = round2(running + Number(row.net))
  }
  // 年初结转 = 本年度之前的全部明细净额，用于让"结转 + 本年净额 = 期末结余"可对得上
  const openingBalance = running

  const months: { month: string, income: number, expense: number, currentBalance: number }[] = []
  for (let month = 1; month <= 12; month += 1) {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    const aggregate = byMonth.get(ym)
    if (aggregate) running = round2(running + Number(aggregate.net))
    if (!published.has(ym)) continue
    months.push({
      month: ym,
      income: round2(Number(aggregate?.income ?? 0)),
      expense: round2(Number(aggregate?.expense ?? 0)),
      currentBalance: running
    })
  }
  const totals = months.reduce(
    (acc, month) => ({
      income: round2(acc.income + month.income),
      expense: round2(acc.expense + month.expense)
    }),
    { income: 0, expense: 0 }
  )
  return { venueId, year, months, totals, openingBalance }
})
