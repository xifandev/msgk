import { REVIEW_STATES, type ReviewState } from '~~/shared/permissions'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'finance:view')
  const { page, pageSize, offset, search } = pageParams(event)
  const input = getQuery(event)
  const scope = venueScope(admin, 'b.venue_id')
  const where = [scope.sql]
  const params: unknown[] = [...scope.params]
  if (input.venueId) {
    const venueId = positiveId(input.venueId, '场所ID')
    requireVenueScope(admin, venueId)
    where.push('b.venue_id = ?')
    params.push(venueId)
  }
  if (input.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(input.month))) throw createError({ statusCode: 400, message: '月份格式不正确' })
    where.push('b.bill_month = ?')
    params.push(input.month)
  }
  if (search) {
    where.push('v.name LIKE ?')
    params.push(`%${search}%`)
  }
  if (input.state) {
    if (!REVIEW_STATES.includes(String(input.state) as ReviewState)) throw createError({ statusCode: 400, message: '审核状态不正确' })
    where.push('b.state = ?')
    params.push(input.state)
  }
  const condition = where.join(' AND ')
  const total = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM bills b JOIN venues v ON v.id = b.venue_id WHERE ${condition}`, params)
  const list = await query<{ id: number, income: number, expense: number, [key: string]: unknown }>(
    `SELECT b.*, v.name AS venue_name, v.township,
       (SELECT COALESCE(SUM(${balanceExpr('i.')}), 0)
        FROM bill_items i
        WHERE i.venue_id = b.venue_id
          AND i.occurred_on < DATE_ADD(STR_TO_DATE(CONCAT(b.bill_month, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH)
       ) AS balance
     FROM bills b JOIN venues v ON v.id = b.venue_id
     WHERE ${condition} ORDER BY b.bill_month DESC, b.id DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params
  )
  // 收入/支出按明细现算，不依赖 bills 表里的汇总列
  const totals = await getBillTotals(list.map(row => Number(row.id)))
  for (const row of list) {
    const item = totals.get(Number(row.id))
    row.income = item?.income ?? 0
    row.expense = item?.expense ?? 0
  }
  // 状态计数只受数据权限影响，与场所/月份/搜索等查询条件无关：胶囊上的数字始终反映全局
  const rows = await query<{ state: string, total: number | string }>(
    `SELECT b.state, COUNT(*) AS total FROM bills b JOIN venues v ON v.id = b.venue_id
     WHERE ${scope.sql} GROUP BY b.state`,
    scope.params
  )
  const counts: Record<string, number> = { all: 0 }
  for (const value of REVIEW_STATES) counts[value] = 0
  for (const row of rows) {
    counts[row.state] = Number(row.total)
    counts.all = (counts.all ?? 0) + Number(row.total)
  }
  return { list, total: Number(total?.count ?? 0), counts, page, pageSize }
})
