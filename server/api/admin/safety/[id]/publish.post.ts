// 场所安全：仅县级可设置公开状态；无审核流程，公开时直接置为已通过。
export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:publish')
  if (!['county', 'super'].includes(admin.roleCode)) {
    throw createError({ statusCode: 403, message: '仅县级可以设置公开状态' })
  }
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const body = await readBody(event)
  if (typeof body?.published !== 'boolean') throw createError({ statusCode: 400, message: '请指定发布状态' })
  const article = await queryOne<{ id: number, title: string }>(
    'SELECT id, title FROM safety_articles WHERE id = ?', [id]
  )
  if (!article) throw createError({ statusCode: 404, message: '文章不存在' })
  const published = body.published ? 1 : 0
  await execute(`UPDATE safety_articles SET published = ?, state = 'approved', updated_by = ? WHERE id = ?`, [published, admin.id, id])
  await logAction(admin, 'safety', `安全文章#${id}`, published ? `公开安全文章《${article.title}》` : `取消公开安全文章《${article.title}》`, event)
  return { id, published: body.published }
})
