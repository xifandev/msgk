const REVIEW_STATE_SET = ['draft', 'pending_town', 'pending_county', 'approved', 'rejected']

interface SafetyListRow {
  id: number
  title: string
  coverUrl: string | null
  authorName: string | null
  authorRole: string | null
  state: string
  published: number
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  venueIdsRaw: string | null
  venueNames: string | null
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
  const state = String(input.state ?? '')
  if (state) {
    if (!REVIEW_STATE_SET.includes(state)) throw createError({ statusCode: 400, message: '审核状态不正确' })
    where.push('a.state = ?')
    params.push(state)
  }
  if (input.published === '0' || input.published === '1') {
    where.push('a.published = ?')
    params.push(Number(input.published))
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const totalRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM safety_articles a ${whereSql}`, params)
  const rows = await query<SafetyListRow>(
    `SELECT a.id, a.title, a.cover_url AS coverUrl, a.author_name AS authorName, a.author_role AS authorRole,
            a.state, a.published, a.submitted_at AS submittedAt, a.created_at AS createdAt, a.updated_at AS updatedAt,
            (SELECT GROUP_CONCAT(sv.venue_id ORDER BY sv.venue_id) FROM safety_article_venues sv WHERE sv.article_id = a.id) AS venueIdsRaw,
            (SELECT GROUP_CONCAT(v.name ORDER BY v.id SEPARATOR '、') FROM safety_article_venues sv JOIN venues v ON v.id = sv.venue_id WHERE sv.article_id = a.id) AS venueNames
     FROM safety_articles a
     ${whereSql}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  const list = rows.map(({ venueIdsRaw, ...row }) => ({
    ...row,
    venueIds: venueIdsRaw ? venueIdsRaw.split(',').map(Number) : []
  }))
  return { list, total: totalRow?.total ?? 0, page, pageSize }
})
