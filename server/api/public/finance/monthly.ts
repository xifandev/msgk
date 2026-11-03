interface BillRow {
  id: number
  venue_id: number
  bill_month: string
  income: number
  expense: number
  previous_balance: number
  current_balance: number
}

interface BillItemRow {
  id: number
  occurred_on: string
  kind: string
  summary: string
  amount: number
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = positiveId(input.venueId, '场所ID')
  const month = String(input.month ?? '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw createError({ statusCode: 400, message: '月份格式必须为 YYYY-MM' })
  }

  const bill = await queryOne<BillRow>(
    `SELECT id, venue_id, bill_month, income, expense, previous_balance, current_balance
     FROM bills WHERE venue_id = ? AND bill_month = ? AND state = 'approved' AND published = 1`,
    [venueId, month]
  )
  if (!bill) return { bill: null, items: [] }

  const items = await query<BillItemRow>(
    'SELECT id, occurred_on, kind, summary, amount FROM bill_items WHERE bill_id = ? ORDER BY occurred_on ASC, id ASC',
    [bill.id]
  )
  return {
    bill: {
      id: bill.id,
      venueId: bill.venue_id,
      month: bill.bill_month,
      income: Number(bill.income),
      expense: Number(bill.expense),
      previousBalance: Number(bill.previous_balance),
      currentBalance: Number(bill.current_balance)
    },
    items: items.map(item => ({
      id: item.id,
      occurredOn: item.occurred_on,
      kind: item.kind,
      summary: item.summary,
      amount: Number(item.amount)
    }))
  }
})
