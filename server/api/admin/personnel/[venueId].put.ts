import { requirePermission } from '../../../utils/auth'
import { execute, parseJson, queryOne } from '../../../utils/db'
import { positiveId } from '../../../utils/http'
import { logAction } from '../../../utils/log'
import { requireScopedVenue, sanitizeMembers } from '../venues/-helpers'
import type { PersonnelMember } from '../venues/-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'personnel:edit')
  const venueId = positiveId(getRouterParam(event, 'venueId'), '场所ID')
  await requireScopedVenue(admin, venueId)
  const existing = await queryOne<{ id: number; state: string }>(
    'SELECT id, state FROM personnel WHERE venue_id = ?',
    [venueId]
  )
  if (existing && !['draft', 'rejected'].includes(existing.state)) {
    throw createError({ statusCode: 409, message: '当前状态不能编辑，请先退回为编辑中' })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const members = sanitizeMembers(body?.members)
  members.forEach((member, index) => {
    if (!member.position) throw createError({ statusCode: 400, message: `第${index + 1}位成员的职务不能为空` })
  })
  const membersJson = JSON.stringify(members)

  if (existing) {
    await execute('UPDATE personnel SET members = ?, updated_by = ? WHERE id = ?', [membersJson, admin.id, existing.id])
  } else {
    await execute(
      "INSERT INTO personnel (venue_id, members, state, created_by, updated_by) VALUES (?, ?, 'draft', ?, ?)",
      [venueId, membersJson, admin.id, admin.id]
    )
  }
  await logAction(admin, 'personnel', `场所#${venueId} 人员名册`, `更新人员名册（${members.length}人）`, event)
  const row = await queryOne<Record<string, unknown>>('SELECT * FROM personnel WHERE venue_id = ?', [venueId])
  return { ...row, members: parseJson<PersonnelMember[]>(row?.members, []) }
})
