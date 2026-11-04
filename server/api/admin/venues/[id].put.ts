import { requirePermission } from '../../../utils/auth'
import { execute, queryOne } from '../../../utils/db'
import { positiveId, text } from '../../../utils/http'
import { logAction } from '../../../utils/log'
import { intOrDefault, optionalUrl, requireScopedVenue } from './-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:edit')
  const id = positiveId(getRouterParam(event, 'id'), '场所ID')
  await requireScopedVenue(admin, id)
  const body = await readBody<Record<string, unknown>>(event)
  const name = text(body?.name, '场所名称', 100)
  const township = text(body?.township, '所属乡镇', 50)
  const sortOrder = intOrDefault(body?.sort_order, '排序值')
  const imageUrl = optionalUrl(body?.image_url, '场所图片')
  const safetyNote = text(body?.safety_note, '安全提示', 2000, false) || null

  await execute(
    'UPDATE venues SET name = ?, township = ?, sort_order = ?, image_url = ?, safety_note = ? WHERE id = ?',
    [name, township, sortOrder, imageUrl, safetyNote, id]
  )
  await logAction(admin, 'venues', `场所#${id}`, `更新场所「${name}」`, event)
  return await queryOne('SELECT * FROM venues WHERE id = ?', [id])
})
