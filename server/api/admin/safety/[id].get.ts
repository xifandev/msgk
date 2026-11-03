export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:view')
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const article = await queryOne<{ id: number }>('SELECT id FROM safety_articles WHERE id = ?', [id])
  if (!article) throw createError({ statusCode: 404, message: '文章不存在' })
  const venueRows = await query<{ venue_id: number, venue_name: string }>(
    `SELECT sv.venue_id, v.name AS venue_name
     FROM safety_article_venues sv JOIN venues v ON v.id = sv.venue_id
     WHERE sv.article_id = ? ORDER BY sv.venue_id`,
    [id]
  )
  if (!admin.allVenues && !venueRows.some((row) => admin.venueIds.includes(row.venue_id))) {
    throw createError({ statusCode: 404, message: '文章不存在' })
  }
  const row = await queryOne(
    `SELECT id, title, cover_url AS coverUrl, content, author_name AS authorName, author_role AS authorRole,
            state, published, submitted_at AS submittedAt,
            town_note AS townNote, town_reviewed_at AS townReviewedAt,
            county_note AS countyNote, county_reviewed_at AS countyReviewedAt,
            created_at AS createdAt, updated_at AS updatedAt
     FROM safety_articles WHERE id = ?`,
    [id]
  )
  return {
    ...row,
    venueIds: venueRows.map((venue) => venue.venue_id),
    venueNames: venueRows.map((venue) => venue.venue_name).join('、')
  }
})
