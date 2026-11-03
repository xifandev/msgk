import { requirePermission, venueScope } from '../../../utils/auth'
import { query, queryOne } from '../../../utils/db'
import { pageParams } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:view')
  const { page, pageSize, offset, search } = pageParams(event)
  const scope = venueScope(admin, 'v.id')
  const conditions = [scope.sql]
  const params: unknown[] = [...scope.params]
  if (search) {
    conditions.push('(v.name LIKE ? OR v.township LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }
  const where = conditions.join(' AND ')
  const totalRow = await queryOne<{ total: number | string }>(
    `SELECT COUNT(*) AS total FROM venues v WHERE ${where}`,
    params
  )
  const list = await query(
    `SELECT v.id, v.name, v.township, v.sort_order, v.image_url, v.qr_code_url, v.safety_note,
            v.created_at, v.updated_at,
            p.state AS profile_state, p.published AS profile_published,
            m.state AS personnel_state, m.published AS personnel_published
     FROM venues v
     LEFT JOIN venue_profiles p ON p.venue_id = v.id
     LEFT JOIN personnel m ON m.venue_id = v.id
     WHERE ${where}
     ORDER BY v.township ASC, v.sort_order ASC, v.id ASC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  return { list, total: Number(totalRow?.total ?? 0), page, pageSize }
})
