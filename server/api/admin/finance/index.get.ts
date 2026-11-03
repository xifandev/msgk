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
  if (input.state) {
    if (!REVIEW_STATES.includes(String(input.state) as ReviewState)) throw createError({ statusCode: 400, message: '审核状态不正确' })
    where.push('b.state = ?')
    params.push(input.state)
  }
  if (search) {
    where.push('v.name LIKE ?')
    params.push(`%${search}%`)
  }
  const condition = where.join(' AND ')
  const total = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM bills b JOIN venues v ON v.id = b.venue_id WHERE ${condition}`, params)
  const list = await query(
    `SELECT b.*, v.name AS venue_name, v.township FROM bills b JOIN venues v ON v.id = b.venue_id
     WHERE ${condition} ORDER BY b.bill_month DESC, b.id DESC LIMIT ${pageSize} OFFSET ${offset}`,
    params
  )
  return { list, total: Number(total?.count ?? 0), page, pageSize }
})
