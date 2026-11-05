export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:view')
  const id = positiveId(getRouterParam(event, 'id'), '账单ID')
  const bill = await queryOne<{ venue_id: number, bill_month: string }>('SELECT b.*, v.name AS venue_name FROM bills b JOIN venues v ON v.id = b.venue_id WHERE b.id = ?', [id])
  if (!bill) throw createError({ statusCode: 404, message: '账单不存在' })
  requireVenueScope(admin, bill.venue_id)
  const [items, balance] = await Promise.all([
    query<{ kind: string, amount: number | string }>('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY occurred_on DESC, id DESC', [id]),
    getBillBalance(bill.venue_id, bill.bill_month)
  ])
  // 收入/支出与期末结余一样由明细实时得出，不读取 bills 里的落库快照
  const totals = totalsFromItems(items)
  return { bill: { ...bill, income: totals.income, expense: totals.expense, balance }, items }
})
