function parseVenueIds(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length) throw createError({ statusCode: 400, message: '请选择关联场所' })
  const ids = [...new Set(value.map(Number))]
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw createError({ statusCode: 400, message: '关联场所格式不正确' })
  }
  return ids
}

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:edit')
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const existing = await queryOne<{ id: number, state: string }>('SELECT id, state FROM safety_articles WHERE id = ?', [id])
  if (!existing) throw createError({ statusCode: 404, message: '文章不存在' })
  const currentVenueIds = (await query<{ venue_id: number }>(
    'SELECT venue_id FROM safety_article_venues WHERE article_id = ?', [id]
  )).map((row) => row.venue_id)
  if (!admin.allVenues && (!currentVenueIds.length || currentVenueIds.some((venueId) => !admin.venueIds.includes(venueId)))) {
    throw createError({ statusCode: 403, message: '该文章关联的场所不在你的数据权限范围内' })
  }
  if (!['draft', 'rejected'].includes(existing.state)) {
    throw createError({ statusCode: 409, message: '当前状态不能直接修改，请先撤回重新编辑' })
  }
  const body = await readBody(event)
  const title = text(body?.title, '标题')
  const coverUrl = text(body?.coverUrl, '封面地址', 500, false)
  const authorName = text(body?.authorName, '作者', 50, false)
  const authorRole = text(body?.authorRole, '作者身份', 32, false)
  const content = cleanRichText(body?.content)
  if (!content.trim()) throw createError({ statusCode: 400, message: '请填写正文内容' })
  const venueIds = parseVenueIds(body?.venueIds)
  for (const venueId of venueIds) requireVenueScope(admin, venueId)
  const placeholders = venueIds.map(() => '?').join(',')
  const venues = await query(`SELECT id FROM venues WHERE id IN (${placeholders})`, venueIds)
  if (venues.length !== venueIds.length) throw createError({ statusCode: 400, message: '包含不存在的场所' })
  await withTransaction(async (conn) => {
    await conn.execute(
      'UPDATE safety_articles SET title = ?, cover_url = ?, content = ?, author_name = ?, author_role = ?, updated_by = ? WHERE id = ?',
      [title, coverUrl || null, content, authorName || null, authorRole || null, admin.id, id]
    )
    await conn.execute('DELETE FROM safety_article_venues WHERE article_id = ?', [id])
    await conn.execute(
      `INSERT INTO safety_article_venues (article_id, venue_id) VALUES ${venueIds.map(() => '(?, ?)').join(',')}`,
      venueIds.flatMap((venueId) => [id, venueId])
    )
  })
  await logAction(admin, 'safety', `安全文章#${id}`, `修改安全文章《${title}》`, event)
  return { id }
})
