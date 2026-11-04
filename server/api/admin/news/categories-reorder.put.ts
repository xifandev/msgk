export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'news:edit')
  const body = await readBody<{ ids?: unknown }>(event)
  if (!Array.isArray(body?.ids) || body.ids.length > 1000) {
    throw createError({ statusCode: 400, message: '分类排序数据不正确' })
  }
  const ids = body.ids.map(id => Number(id))
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw createError({ statusCode: 400, message: '分类排序数据不正确' })
  }

  await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM news_categories')
    const existingIds = new Set((rows as { id: number }[]).map(row => Number(row.id)))
    if (existingIds.size !== ids.length || ids.some(id => !existingIds.has(id))) {
      throw createError({ statusCode: 409, message: '分类列表已变化，请刷新后重试' })
    }
    for (const [index, id] of ids.entries()) {
      await conn.execute('UPDATE news_categories SET sort_order = ? WHERE id = ?', [index + 1, id])
    }
  })
  await logAction(admin, 'news', '文章分类', `调整分类顺序（${ids.length}个）`, event)
  return { ids }
})
