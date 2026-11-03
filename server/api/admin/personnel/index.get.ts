import { requirePermission, venueScope } from '../../../utils/auth'
import { query, queryOne } from '../../../utils/db'
import { pageParams } from '../../../utils/http'
import { REVIEW_STATES } from '../../../../shared/permissions'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'personnel:view')
  const { page, pageSize, offset, search } = pageParams(event)
  const state = String(getQuery(event).state ?? '').trim()
  const scope = venueScope(admin, 'p.venue_id')
  const conditions = [scope.sql]
  const params: unknown[] = [...scope.params]
  if (search) {
    conditions.push('(v.name LIKE ? OR v.township LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }
  if (state) {
    if (!(REVIEW_STATES as readonly string[]).includes(state)) {
      throw createError({ statusCode: 400, message: '审核状态不正确' })
    }
    conditions.push('p.state = ?')
    params.push(state)
  }
  const where = conditions.join(' AND ')
  const totalRow = await queryOne<{ total: number | string }>(
    `SELECT COUNT(*) AS total FROM personnel p JOIN venues v ON v.id = p.venue_id WHERE ${where}`,
    params
  )
  const list = await query(
    `SELECT p.id, p.venue_id, v.name AS venue_name, v.township,
            p.state, p.published, p.submitted_at, p.town_note, p.town_reviewed_at,
            p.county_note, p.county_reviewed_at, p.updated_at,
            JSON_LENGTH(p.members) AS member_count
     FROM personnel p
     JOIN venues v ON v.id = p.venue_id
     WHERE ${where}
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  return { list, total: Number(totalRow?.total ?? 0), page, pageSize }
})
