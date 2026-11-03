interface PersonnelRow {
  members: unknown
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const venueId = positiveId(getQuery(event).venueId, '场所ID')
  const row = await queryOne<PersonnelRow>(
    "SELECT members FROM personnel WHERE venue_id = ? AND state = 'approved' AND published = 1",
    [venueId]
  )
  const members = row ? parseJson<unknown[]>(row.members, []) : []
  return { venueId, members: Array.isArray(members) ? members : [] }
})
