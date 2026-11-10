export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:edit')
  const billId = positiveId(getRouterParam(event, 'id'), '账单ID')
  const body = await readBody(event)
  const kind = String(body.kind ?? '')
  if (!['income', 'expense', 'opening'].includes(kind)) throw createError({ statusCode: 400, message: '收支类型不正确' })
  const occurredOn = String(body.occurredOn ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) throw createError({ statusCode: 400, message: '日期格式不正确' })
  const amount = money(body.amount)
  if (Number(amount) <= 0) throw createError({ statusCode: 400, message: '金额必须大于0' })
  const summary = text(body.summary, '摘要', 100)
  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT venue_id, bill_month, state FROM bills WHERE id = ? FOR UPDATE', [billId])
    const bill = (rows as { venue_id: number, bill_month: string, state: string }[])[0]
    if (!bill) throw createError({ statusCode: 404, message: '账单不存在' })
    requireVenueScope(admin, bill.venue_id)
    if (!['draft', 'rejected'].includes(bill.state)) throw createError({ statusCode: 409, message: '当前状态不能新增明细' })
    if (occurredOn.slice(0, 7) !== bill.bill_month) throw createError({ statusCode: 400, message: '明细日期必须属于账单月份' })
    if (kind === 'opening') {
      // 期初结余只能出现在场所的第一张账单，且每个场所只保留一条
      const [first] = await conn.query('SELECT MIN(bill_month) AS m FROM bills WHERE venue_id = ?', [bill.venue_id])
      if ((first as { m: string }[])[0]?.m !== bill.bill_month) {
        throw createError({ statusCode: 409, message: '期初结余只能录入该场所的第一张账单' })
      }
      const [exist] = await conn.query("SELECT id FROM bill_items WHERE venue_id = ? AND kind = 'opening' LIMIT 1", [bill.venue_id])
      if ((exist as unknown[]).length) throw createError({ statusCode: 409, message: '该场所已录入期初结余，请直接编辑原记录' })
    }
    await conn.query(
      'INSERT INTO bill_items (bill_id, venue_id, occurred_on, kind, summary, amount, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [billId, bill.venue_id, occurredOn, kind, summary, amount, admin.id]
    )
  })
  await logAction(admin, '财务公开', String(billId), kind === 'opening' ? '新增期初结余' : '新增收支明细', event)
  return { ok: true }
})
