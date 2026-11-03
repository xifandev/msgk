import { requirePermission } from '../../../utils/auth'
import { execute } from '../../../utils/db'
import { positiveId } from '../../../utils/http'
import { logAction } from '../../../utils/log'
import { requireScopedVenue } from './-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:delete')
  const id = positiveId(getRouterParam(event, 'id'), '场所ID')
  const venue = await requireScopedVenue(admin, id)

  await execute('DELETE FROM venues WHERE id = ?', [id])
  await logAction(admin, 'venues', `场所#${id}`, `删除场所「${venue.name}」`, event)
  return { id, deleted: true }
})
