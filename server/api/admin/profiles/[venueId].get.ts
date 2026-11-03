import { requirePermission } from '../../../utils/auth'
import { parseJson, queryOne } from '../../../utils/db'
import { positiveId } from '../../../utils/http'
import { requireScopedVenue } from '../venues/-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:view')
  const venueId = positiveId(getRouterParam(event, 'venueId'), '场所ID')
  await requireScopedVenue(admin, venueId)
  const row = await queryOne<Record<string, unknown>>('SELECT * FROM venue_profiles WHERE venue_id = ?', [venueId])
  if (!row) throw createError({ statusCode: 404, message: '场所介绍不存在' })
  return { ...row, extra: parseJson(row.extra, {}) }
})
