export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const venueId = positiveId(getQuery(event).venueId, '场所ID')
  const rows = await query<{ name: string, phone: string, role_name: string }>(
    `SELECT a.name, a.phone, r.name AS role_name FROM admins a
     JOIN roles r ON r.id = a.role_id
     WHERE a.status = 1 AND r.code IN ('town', 'venue')
       AND (a.all_venues = 1 OR JSON_CONTAINS(a.venue_ids, CAST(? AS JSON)))
     ORDER BY r.id, a.id`,
    [String(venueId)]
  )
  return {
    list: rows.map((row) => ({
      name: `${row.name.slice(0, 1)}${'*'.repeat(Math.max(1, [...row.name].length - 1))}`,
      phone: row.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
      roleName: row.role_name
    }))
  }
})
