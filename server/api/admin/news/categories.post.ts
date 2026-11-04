export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'news:edit')
  const body = await readBody(event)
  const name = text(body?.name, '分类名称', 50)
  const existing = await queryOne('SELECT id FROM news_categories WHERE name = ?', [name])
  if (existing) throw createError({ statusCode: 409, message: '分类名称已存在' })
  const lastCategory = await queryOne<{ nextOrder: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextOrder FROM news_categories')
  const result = await execute('INSERT INTO news_categories (name, sort_order) VALUES (?, ?)', [name, lastCategory?.nextOrder ?? 1])
  await logAction(admin, 'news', `分类#${result.insertId}`, `新建分类「${name}」`, event)
  return { id: result.insertId }
})
