export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'notices:edit')
  const id = positiveId(getRouterParam(event, 'id'), '公告ID')
  const existing = await queryOne('SELECT id FROM notices WHERE id = ?', [id])
  if (!existing) throw createError({ statusCode: 404, message: '公告不存在' })
  const body = await readBody(event)
  const kind = String(body?.kind ?? '')
  if (!['public', 'internal'].includes(kind)) throw createError({ statusCode: 400, message: '公告类型必须是 public 或 internal' })
  const title = text(body?.title, '标题')
  const coverUrl = text(body?.coverUrl, '封面地址', 500, false)
  const authorName = text(body?.authorName, '作者', 50, false)
  const content = cleanRichText(body?.content)
  if (!content.trim()) throw createError({ statusCode: 400, message: '请填写正文内容' })
  await execute(
    'UPDATE notices SET title = ?, kind = ?, cover_url = ?, content = ?, author_name = ?, updated_by = ? WHERE id = ?',
    [title, kind, coverUrl || null, content, authorName || null, admin.id, id]
  )
  await logAction(admin, 'notices', `公告#${id}`, `修改公告《${title}》`, event)
  return { id }
})
