import { requirePermission } from '../../../../utils/auth'
import { execute, parseJson, queryOne } from '../../../../utils/db'
import { positiveId } from '../../../../utils/http'
import { logAction } from '../../../../utils/log'
import { requireScopedVenue } from '../../venues/-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:publish')
  const venueId = positiveId(getRouterParam(event, 'venueId'), '场所ID')
  await requireScopedVenue(admin, venueId)
  const body = await readBody<Record<string, unknown>>(event)
  const published = body?.published === true || body?.published === 1 ? 1 : 0

  const row = await queryOne<{ id: number; state: string }>(
    'SELECT id, state FROM venue_profiles WHERE venue_id = ?',
    [venueId]
  )
  if (!row) throw createError({ statusCode: 404, message: '场所介绍不存在' })
  if (published === 1 && row.state !== 'approved') {
    throw createError({ statusCode: 409, message: '只有审核通过的内容才能公开' })
  }
  await execute('UPDATE venue_profiles SET published = ?, updated_by = ? WHERE id = ?', [published, admin.id, row.id])
  await logAction(admin, 'venues', `场所介绍#${venueId}`, published ? '设置场所介绍为公开' : '取消场所介绍公开', event)
  const updated = await queryOne<Record<string, unknown>>('SELECT * FROM venue_profiles WHERE id = ?', [row.id])
  return { ...updated, extra: parseJson(updated?.extra, {}) }
})
