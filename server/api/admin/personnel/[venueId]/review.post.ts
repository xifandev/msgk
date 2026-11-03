import { requirePermission } from '../../../../utils/auth'
import { execute, parseJson, queryOne } from '../../../../utils/db'
import { positiveId, text } from '../../../../utils/http'
import { logAction } from '../../../../utils/log'
import { nextReviewState, reviewUpdate } from '../../../../utils/review'
import type { ReviewAction } from '../../../../utils/review'
import { requireScopedVenue } from '../../venues/-helpers'
import type { PersonnelMember } from '../../venues/-helpers'

const ACTIONS: ReviewAction[] = ['submit', 'approve', 'reject', 'reopen']

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const action = String(body?.action ?? '') as ReviewAction
  if (!ACTIONS.includes(action)) throw createError({ statusCode: 400, message: '不支持的审核操作' })
  const admin = await requirePermission(event, ['approve', 'reject'].includes(action) ? 'personnel:review' : 'personnel:edit')
  const venueId = positiveId(getRouterParam(event, 'venueId'), '场所ID')
  await requireScopedVenue(admin, venueId)
  const reason = text(body?.reason, '审核意见', 500, false)
  if (action === 'reject' && !reason) throw createError({ statusCode: 400, message: '驳回时必须填写审核意见' })

  const row = await queryOne<{ id: number; state: string }>(
    'SELECT id, state FROM personnel WHERE venue_id = ?',
    [venueId]
  )
  if (!row) throw createError({ statusCode: 404, message: '人员名册不存在' })
  const nextState = nextReviewState(row.state, admin.roleCode, action)
  const data = reviewUpdate(action, nextState, reason, admin.roleCode, row.state)
  const keys = Object.keys(data)
  const result = await execute(
    `UPDATE personnel SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_by = ? WHERE id = ? AND state = ?`,
    [...keys.map((key) => data[key]), admin.id, row.id, row.state]
  )
  if (result.affectedRows !== 1) throw createError({ statusCode: 409, message: '人员名册状态已变化，请刷新后重试' })
  await logAction(admin, 'personnel', `场所#${venueId} 人员名册`, `审核操作 ${action}，状态变为 ${nextState}`, event)
  const updated = await queryOne<Record<string, unknown>>('SELECT * FROM personnel WHERE id = ?', [row.id])
  return { ...updated, members: parseJson<PersonnelMember[]>(updated?.members, []) }
})
