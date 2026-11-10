export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:view')
  const id = positiveId(getRouterParam(event, 'id'), '账单ID')
  const bill = await queryOne<{ venue_id: number, bill_month: string }>('SELECT b.*, v.name AS venue_name FROM bills b JOIN venues v ON v.id = b.venue_id WHERE b.id = ?', [id])
  if (!bill) throw createError({ statusCode: 404, message: '账单不存在' })
  requireVenueScope(admin, bill.venue_id)
  const [items, balance, first] = await Promise.all([
    query<{ kind: string, amount: number | string }>('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY occurred_on DESC, id DESC', [id]),
    getBillBalance(bill.venue_id, bill.bill_month),
    queryOne<{ m: string }>('SELECT MIN(bill_month) AS m FROM bills WHERE venue_id = ?', [bill.venue_id])
  ])
  // 收入/支出与期末结余一样由明细实时得出，不读取 bills 里的落库快照
  const totals = totalsFromItems(items)
  // 期初结余只允许录在场所第一张账单上，且每个场所仅一条
  const isFirstBill = first?.m === bill.bill_month
  const hasOpening = items.some(item => item.kind === 'opening')
  return { bill: { ...bill, income: totals.income, expense: totals.expense, balance, isFirstBill, hasOpening }, items }
})
