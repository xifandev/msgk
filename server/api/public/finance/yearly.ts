interface BillRow {
  bill_month: string
  income: number
  expense: number
  previous_balance: number
  current_balance: number
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
    `SELECT bill_month, income, expense, previous_balance, current_balance
     FROM bills
     WHERE venue_id = ? AND bill_month BETWEEN ? AND ? AND state = 'approved' AND published = 1
     ORDER BY bill_month ASC`,
    [venueId, `${year}-01`, `${year}-12`]
  )
  const months = rows.map(row => ({
    month: row.bill_month,
    income: Number(row.income),
    expense: Number(row.expense),
    previousBalance: Number(row.previous_balance),
    currentBalance: Number(row.current_balance)
  }))
  const totals = months.reduce(
    (acc, month) => ({
      income: Math.round((acc.income + month.income) * 100) / 100,
      expense: Math.round((acc.expense + month.expense) * 100) / 100
    }),
    { income: 0, expense: 0 }
  )
  return { venueId, year, months, totals }
})
