const NOTICE_KINDS = ['public', 'internal']

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'notices:view')
  const { page, pageSize, offset, search } = pageParams(event)
  const input = getQuery(event)
  const where: string[] = []
  const params: unknown[] = []
  if (search) {
    where.push('title LIKE ?')
    params.push(`%${search}%`)
  }
  const kind = String(input.kind ?? '')
  if (kind) {
    if (!NOTICE_KINDS.includes(kind)) throw createError({ statusCode: 400, message: '公告类型必须是 public 或 internal' })
    where.push('kind = ?')
    params.push(kind)
  }
  if (input.published === '0' || input.published === '1') {
    where.push('published = ?')
    params.push(Number(input.published))
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM notices ${whereSql}`, params)
  const list = await query(
    `SELECT id, title, kind, cover_url AS coverUrl, author_name AS authorName, published,
            created_at AS createdAt, updated_at AS updatedAt
     FROM notices
     ${whereSql}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  return { list, total: totalRow?.total ?? 0, page, pageSize }
})
