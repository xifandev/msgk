import { requirePermission } from '../../../utils/auth'
import { execute, parseJson, queryOne } from '../../../utils/db'
import { cleanRichText, positiveId, text } from '../../../utils/http'
import { logAction } from '../../../utils/log'
import { optionalDate, requireScopedVenue } from '../venues/-helpers'

function extraJson(value: unknown): string {
  if (value === undefined || value === null || value === '') return '{}'
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, message: '扩展信息必须是对象' })
  }
  const json = JSON.stringify(value)
  if (json.length > 8000) throw createError({ statusCode: 400, message: '扩展信息内容过长' })
  return json
}

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:edit')
  const venueId = positiveId(getRouterParam(event, 'venueId'), '场所ID')
  await requireScopedVenue(admin, venueId)
  const existing = await queryOne<{ id: number; state: string }>(
    'SELECT id, state FROM venue_profiles WHERE venue_id = ?',
    [venueId]
  )
  if (existing && !['draft', 'rejected'].includes(existing.state)) {
    throw createError({ statusCode: 409, message: '当前状态不能编辑，请先退回为编辑中' })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const registrationDate = optionalDate(body?.registration_date, '登记日期')
  const religion = text(body?.religion, '宗教类别', 50, false) || null
  const category = text(body?.category, '场所类别', 50, false) || null
  const manager = text(body?.manager, '负责人', 50, false) || null
  const phone = text(body?.phone, '联系电话', 30, false) || null
  const approvalAuthority = text(body?.approval_authority, '批准登记机关', 150, false) || null
  const creditCode = text(body?.credit_code, '统一社会信用代码', 50, false) || null
  const address = text(body?.address, '地址', 255, false) || null
  const summary = cleanRichText(body?.summary) || null
  const extra = extraJson(body?.extra)

  if (existing) {
    await execute(
      `UPDATE venue_profiles SET registration_date = ?, religion = ?, category = ?, manager = ?, phone = ?,
              approval_authority = ?, credit_code = ?, address = ?, summary = ?, extra = ?, updated_by = ?
       WHERE id = ?`,
      [registrationDate, religion, category, manager, phone, approvalAuthority, creditCode, address, summary, extra, admin.id, existing.id]
    )
  } else {
    await execute(
      `INSERT INTO venue_profiles (venue_id, registration_date, religion, category, manager, phone,
              approval_authority, credit_code, address, summary, extra, state, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [venueId, registrationDate, religion, category, manager, phone, approvalAuthority, creditCode, address, summary, extra, admin.id, admin.id]
    )
  }
  await logAction(admin, 'venues', `场所介绍#${venueId}`, '更新场所介绍', event)
  const row = await queryOne<Record<string, unknown>>('SELECT * FROM venue_profiles WHERE venue_id = ?', [venueId])
  return { ...row, extra: parseJson(row?.extra, {}) }
})
