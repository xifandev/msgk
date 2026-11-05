export default defineEventHandler(async (event) => {
  await requirePermission(event, 'system:admins')
  const search = String(getQuery(event).search ?? '').trim()
  const admins = await query(
    `SELECT a.id, a.phone, a.name, a.role_id, a.organization, a.note, a.status,
            a.all_venues, a.venue_ids, a.last_login_at, r.name AS role_name, r.code AS role_code,
            o.last_action_at
     FROM admins a JOIN roles r ON r.id = a.role_id
     LEFT JOIN (SELECT admin_id, MAX(created_at) AS last_action_at FROM operation_logs GROUP BY admin_id) o ON o.admin_id = a.id
     ${search ? 'WHERE a.phone LIKE ? OR a.name LIKE ?' : ''} ORDER BY a.id`,
    search ? [`%${search}%`, `%${search}%`] : []
  )
  const venues = await query(
    `SELECT id, name, township FROM venues ORDER BY ${townshipOrderSql('township')} ASC, sort_order ASC, id ASC`
  )
  const roles = await query('SELECT id, code, name FROM roles ORDER BY id')
  const list = admins.map((item) => ({ ...item, venue_ids: parseJson<number[]>(item.venue_ids, []) }))
  return { list, venues, roles }
})
