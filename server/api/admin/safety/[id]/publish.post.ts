export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:publish')
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const body = await readBody(event)
  if (typeof body?.published !== 'boolean') throw createError({ statusCode: 400, message: '请指定发布状态' })
  const article = await queryOne<{ id: number, title: string, state: string, creatorRole: string | null }>(
    `SELECT a.id, a.title, a.state, cr.code AS creatorRole
     FROM safety_articles a
     LEFT JOIN admins cb ON cb.id = a.created_by
     LEFT JOIN roles cr ON cr.id = cb.role_id
     WHERE a.id = ?`, [id]
  )
  if (!article) throw createError({ statusCode: 404, message: '文章不存在' })
  if (admin.roleCode === 'venue' && article.creatorRole !== 'venue') {
    throw createError({ statusCode: 403, message: '县级发布的文章仅有阅读权限' })
  }
  const venueIds = (await query<{ venue_id: number }>(
    'SELECT venue_id FROM safety_article_venues WHERE article_id = ?', [id]
  )).map((row) => row.venue_id)
  if (!admin.allVenues && (!venueIds.length || venueIds.some((venueId) => !admin.venueIds.includes(venueId)))) {
    throw createError({ statusCode: 403, message: '该文章关联的场所不在你的数据权限范围内' })
  }
  if (body.published && article.state !== 'approved') {
    throw createError({ statusCode: 409, message: '只有审核通过的文章才能发布' })
  }
  const published = body.published ? 1 : 0
  await execute('UPDATE safety_articles SET published = ?, updated_by = ? WHERE id = ?', [published, admin.id, id])
  await logAction(admin, 'safety', `安全文章#${id}`, published ? `发布安全文章《${article.title}》` : `取消发布安全文章《${article.title}》`, event)
  return { id, published: body.published }
})
