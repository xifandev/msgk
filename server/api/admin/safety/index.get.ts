interface SafetyListRow {
  id: number
  title: string
  authorName: string | null
  publishUnit: string | null
  published: number
  createdAt: string
  updatedAt: string
}

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:view')
  const { page, pageSize, offset, search } = pageParams(event)
  const input = getQuery(event)
  const where: string[] = []
  const params: unknown[] = []
  if (!admin.allVenues) {
    if (!admin.venueIds.length) return { list: [], total: 0, page, pageSize }
    where.push(`EXISTS (SELECT 1 FROM safety_article_venues sv WHERE sv.article_id = a.id AND sv.venue_id IN (${admin.venueIds.map(() => '?').join(',')}))`)
    params.push(...admin.venueIds)
  }
  if (search) {
    where.push('a.title LIKE ?')
    params.push(`%${search}%`)
  }
  const venueId = Number(input.venueId)
  if (Number.isSafeInteger(venueId) && venueId > 0) {
    where.push('EXISTS (SELECT 1 FROM safety_article_venues sv WHERE sv.article_id = a.id AND sv.venue_id = ?)')
    params.push(venueId)
  }
  if (input.published === '0' || input.published === '1') {
    where.push('a.published = ?')
    params.push(Number(input.published))
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM safety_articles a ${whereSql}`, params)
  const rows = await query<SafetyListRow>(
    `SELECT a.id, a.title, a.author_name AS authorName, a.publish_unit AS publishUnit,
            a.published, a.created_at AS createdAt, a.updated_at AS updatedAt
     FROM safety_articles a
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  return { list: rows, total: totalRow?.total ?? 0, page, pageSize }
})
