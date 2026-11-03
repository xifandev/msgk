export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'notices:view')
  const id = positiveId(getRouterParam(event, 'id'), '公告ID')
  const notice = await queryOne("SELECT id FROM notices WHERE id = ? AND kind = 'internal' AND published = 1", [id])
  if (!notice) throw createError({ statusCode: 404, message: '公告不存在或未发布' })
  await execute('INSERT IGNORE INTO notice_reads (notice_id, admin_id) VALUES (?, ?)', [id, admin.id])
  const row = await queryOne<{ read_at: string }>(
    'SELECT read_at FROM notice_reads WHERE notice_id = ? AND admin_id = ?',
    [id, admin.id]
  )
  return { id, readAt: row?.read_at ?? null }
})
