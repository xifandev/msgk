import { requirePermission } from '../../../utils/auth'
import { parseJson, queryOne } from '../../../utils/db'
import { positiveId } from '../../../utils/http'
import { requireScopedVenue } from '../venues/-helpers'
import type { PersonnelMember } from '../venues/-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'personnel:view')
  const venueId = positiveId(getRouterParam(event, 'venueId'), '场所ID')
  await requireScopedVenue(admin, venueId)
  const row = await queryOne<Record<string, unknown>>('SELECT * FROM personnel WHERE venue_id = ?', [venueId])
  if (!row) throw createError({ statusCode: 404, message: '人员名册不存在' })
  return { ...row, members: parseJson<PersonnelMember[]>(row.members, []) }
})
