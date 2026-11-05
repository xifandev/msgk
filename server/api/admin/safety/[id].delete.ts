export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:delete')
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const existing = await queryOne<{ id: number, title: string, state: string, creatorRole: string | null }>(
    `SELECT a.id, a.title, a.state, cr.code AS creatorRole
     FROM safety_articles a
     LEFT JOIN admins cb ON cb.id = a.created_by
     LEFT JOIN roles cr ON cr.id = cb.role_id
     WHERE a.id = ?`,
    [id]
  )
  if (!existing) throw createError({ statusCode: 404, message: '文章不存在' })
  if (admin.roleCode === 'venue' && existing.creatorRole !== 'venue') {
    throw createError({ statusCode: 403, message: '县级发布的文章仅有阅读权限' })
  }
  if (!['draft', 'rejected'].includes(existing.state)) {
    throw createError({ statusCode: 409, message: '只有编辑中或审核失败的文章可以删除，请先“重新编辑”退回后再删除' })
  }
  const venueIds = (await query<{ venue_id: number }>(
    'SELECT venue_id FROM safety_article_venues WHERE article_id = ?', [id]
  )).map((row) => row.venue_id)
  if (!admin.allVenues && (!venueIds.length || venueIds.some((venueId) => !admin.venueIds.includes(venueId)))) {
    throw createError({ statusCode: 403, message: '该文章关联的场所不在你的数据权限范围内' })
  }
  await execute('DELETE FROM safety_articles WHERE id = ?', [id])
  await logAction(admin, 'safety', `安全文章#${id}`, `删除安全文章《${existing.title}》`, event)
  return { ok: true }
})
