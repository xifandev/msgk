import type { ResultSetHeader } from 'mysql2/promise'

function parseVenueIds(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length) throw createError({ statusCode: 400, message: '请选择关联场所' })
  const ids = [...new Set(value.map(Number))]
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw createError({ statusCode: 400, message: '关联场所格式不正确' })
  }
  return ids
}

/** 发布单位：管理员的所属单位；场所管理员未填单位时回退其场所名。 */
function resolvePublishUnit(admin: { organization: string | null, roleCode: string }, venueNames: string[]) {
  const organization = (admin.organization ?? '').trim()
  if (organization) return organization
  if (admin.roleCode === 'venue' && venueNames.length) return venueNames.join('、')
  return null
}

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'safety:edit')
  const body = await readBody(event)
  const title = text(body?.title, '标题')
  const coverUrl = text(body?.coverUrl, '封面地址', 500, false)
  const content = cleanRichText(body?.content)
  if (!content.trim()) throw createError({ statusCode: 400, message: '请填写正文内容' })
  const venueIds = parseVenueIds(body?.venueIds)
  for (const venueId of venueIds) requireVenueScope(admin, venueId)
  const placeholders = venueIds.map(() => '?').join(',')
  const venues = await query<{ id: number, name: string }>(`SELECT id, name FROM venues WHERE id IN (${placeholders})`, venueIds)
  if (venues.length !== venueIds.length) throw createError({ statusCode: 400, message: '包含不存在的场所' })
  const publishUnit = resolvePublishUnit(admin, venues.map((venue) => venue.name))
  const id = await withTransaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      'INSERT INTO safety_articles (title, cover_url, content, author_name, author_role, publish_unit, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [title, coverUrl || null, content, admin.name, admin.roleCode, publishUnit, admin.id, admin.id]
    )
    const articleId = result.insertId
    await conn.execute(
      `INSERT INTO safety_article_venues (article_id, venue_id) VALUES ${venueIds.map(() => '(?, ?)').join(',')}`,
      venueIds.flatMap((venueId) => [articleId, venueId])
    )
    return articleId
  })
  await logAction(admin, 'safety', `安全文章#${id}`, `新建安全文章《${title}》`, event)
  return { id }
})
