export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'news:edit')
  const body = await readBody(event)
  const name = text(body?.name, '分类名称', 50)
  const sortOrder = body?.sortOrder === undefined || body?.sortOrder === null || body?.sortOrder === ''
    ? 0
    : Number(body.sortOrder)
  if (!Number.isSafeInteger(sortOrder)) throw createError({ statusCode: 400, message: '排序值必须是整数' })
  const existing = await queryOne('SELECT id FROM news_categories WHERE name = ?', [name])
  if (existing) throw createError({ statusCode: 409, message: '分类名称已存在' })
  const result = await execute('INSERT INTO news_categories (name, sort_order) VALUES (?, ?)', [name, sortOrder])
  await logAction(admin, 'news', `分类#${result.insertId}`, `新建分类「${name}」`, event)
  return { id: result.insertId }
})
