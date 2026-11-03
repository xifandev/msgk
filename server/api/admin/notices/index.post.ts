export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'notices:edit')
  const body = await readBody(event)
  const kind = String(body?.kind ?? '')
  if (!['public', 'internal'].includes(kind)) throw createError({ statusCode: 400, message: '公告类型必须是 public 或 internal' })
  const title = text(body?.title, '标题')
  const coverUrl = text(body?.coverUrl, '封面地址', 500, false)
  const authorName = text(body?.authorName, '作者', 50, false)
  const content = cleanRichText(body?.content)
  if (!content.trim()) throw createError({ statusCode: 400, message: '请填写正文内容' })
  const result = await execute(
    'INSERT INTO notices (title, kind, cover_url, content, author_name, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, kind, coverUrl || null, content, authorName || null, admin.id, admin.id]
  )
  await logAction(admin, 'notices', `公告#${result.insertId}`, `新建公告《${title}》`, event)
  return { id: result.insertId }
})
