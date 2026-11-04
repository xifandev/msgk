export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'notices:view')
  const { page, pageSize, offset } = pageParams(event)
  const totalRow = await queryOne<{ total: number | string }>(
    "SELECT COUNT(*) AS total FROM notices WHERE kind = 'internal' AND published = 1"
  )
  const list = await query(
    `SELECT n.id, n.title, n.cover_url AS coverUrl, n.content, n.author_name AS authorName,
            n.created_at AS createdAt, r.read_at AS readAt
     FROM notices n
     LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.admin_id = ?
     WHERE n.kind = 'internal' AND n.published = 1
     ORDER BY n.id DESC
     LIMIT ? OFFSET ?`,
    [admin.id, pageSize, offset]
  )
  return { list, total: Number(totalRow?.total ?? 0), page, pageSize }
})
