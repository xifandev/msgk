import type { ResultSetHeader } from 'mysql2/promise'
import { requirePermission } from '../../../utils/auth'
import { queryOne, withTransaction } from '../../../utils/db'
import { text } from '../../../utils/http'
import { logAction } from '../../../utils/log'
import { intOrDefault, optionalUrl } from './-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:edit')
  if (!admin.allVenues) throw createError({ statusCode: 403, message: '只有全域管理员可以新增场所' })
  const body = await readBody<Record<string, unknown>>(event)
  const name = text(body?.name, '场所名称', 100)
  const township = text(body?.township, '所属乡镇', 50)
  const sortOrder = intOrDefault(body?.sort_order, '排序值')
  const imageUrl = optionalUrl(body?.image_url, '场所图片')
  const qrCodeUrl = optionalUrl(body?.qr_code_url, '二维码图片')
  const safetyNote = text(body?.safety_note, '安全提示', 2000, false) || null

  const venueId = await withTransaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      'INSERT INTO venues (name, township, sort_order, image_url, qr_code_url, safety_note) VALUES (?, ?, ?, ?, ?, ?)',
      [name, township, sortOrder, imageUrl, qrCodeUrl, safetyNote]
    )
    const id = result.insertId
    await conn.execute(
      "INSERT INTO venue_profiles (venue_id, extra, state, created_by, updated_by) VALUES (?, '{}', 'draft', ?, ?)",
      [id, admin.id, admin.id]
    )
    await conn.execute(
      "INSERT INTO personnel (venue_id, members, state, created_by, updated_by) VALUES (?, '[]', 'draft', ?, ?)",
      [id, admin.id, admin.id]
    )
    return id
  })

  await logAction(admin, 'venues', `场所#${venueId}`, `新增场所「${name}」`, event)
  return await queryOne('SELECT * FROM venues WHERE id = ?', [venueId])
})
