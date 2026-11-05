// 场所安全：仅县级可删除。
export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:delete')
  if (!['county', 'super'].includes(admin.roleCode)) {
    throw createError({ statusCode: 403, message: '仅县级可以删除场所安全信息' })
  }
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const existing = await queryOne<{ id: number, title: string }>(
    'SELECT id, title FROM safety_articles WHERE id = ?', [id]
  )
  if (!existing) throw createError({ statusCode: 404, message: '文章不存在' })
  await execute('DELETE FROM safety_articles WHERE id = ?', [id])
  await logAction(admin, 'safety', `安全文章#${id}`, `删除安全文章《${existing.title}》`, event)
  return { ok: true }
})
