export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:view')
  const id = positiveId(getRouterParam(event, 'id'), '文章ID')
  const article = await queryOne<{ id: number }>('SELECT id FROM safety_articles WHERE id = ?', [id])
  if (!article) throw createError({ statusCode: 404, message: '文章不存在' })
  const venueRows = await query<{ venue_id: number }>(
    `SELECT sv.venue_id
     FROM safety_article_venues sv
     WHERE sv.article_id = ? ORDER BY sv.venue_id`,
    [id]
  )
  if (!admin.allVenues && !venueRows.some((row) => admin.venueIds.includes(row.venue_id))) {
    throw createError({ statusCode: 404, message: '文章不存在' })
  }
  const row = await queryOne(
    `SELECT a.id, a.title, a.cover_url AS coverUrl, a.content, a.author_name AS authorName, a.author_role AS authorRole,
            a.publish_unit AS publishUnit, cr.code AS publisherRole,
            a.state, a.published, a.submitted_at AS submittedAt,
            a.town_note AS townNote, a.town_reviewed_at AS townReviewedAt,
            a.county_note AS countyNote, a.county_reviewed_at AS countyReviewedAt,
            a.created_at AS createdAt, a.updated_at AS updatedAt
     FROM safety_articles a
     LEFT JOIN admins cb ON cb.id = a.created_by
     LEFT JOIN roles cr ON cr.id = cb.role_id
     WHERE a.id = ?`,
    [id]
  )
  return {
    ...row,
    venueIds: venueRows.map((venue) => venue.venue_id)
  }
})
