import { requirePermission } from '../../../../utils/auth'
import { execute, parseJson, queryOne } from '../../../../utils/db'
import { positiveId } from '../../../../utils/http'
import { logAction } from '../../../../utils/log'
import { requireScopedVenue } from '../../venues/-helpers'
import type { PersonnelMember } from '../../venues/-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'personnel:publish')
  const venueId = positiveId(getRouterParam(event, 'venueId'), '场所ID')
  await requireScopedVenue(admin, venueId)
  const body = await readBody<Record<string, unknown>>(event)
  const published = body?.published === true || body?.published === 1 ? 1 : 0

  const row = await queryOne<{ id: number; state: string }>(
    'SELECT id, state FROM personnel WHERE venue_id = ?',
    [venueId]
  )
  if (!row) throw createError({ statusCode: 404, message: '人员名册不存在' })
  if (published === 1 && row.state !== 'approved') {
    throw createError({ statusCode: 409, message: '只有审核通过的内容才能公开' })
  }
  await execute('UPDATE personnel SET published = ?, updated_by = ? WHERE id = ?', [published, admin.id, row.id])
  await logAction(admin, 'personnel', `场所#${venueId} 人员名册`, published ? '设置人员名册为公开' : '取消人员名册公开', event)
  const updated = await queryOne<Record<string, unknown>>('SELECT * FROM personnel WHERE id = ?', [row.id])
  return { ...updated, members: parseJson<PersonnelMember[]>(updated?.members, []) }
})
