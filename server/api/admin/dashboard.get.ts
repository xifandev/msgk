export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'dashboard:view')
  const scope = venueScope(admin, 'venue_id')
  const stage = ['town', 'venue'].includes(admin.roleCode) ? 'pending_town' : 'pending_county'
  const stats: Record<string, number> = {}
  const tables = { profiles: 'venue_profiles', personnel: 'personnel', finance: 'bills' }
  for (const [key, table] of Object.entries(tables)) {
    const row = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${scope.sql} AND state = ?`, [...scope.params, stage])
    stats[key] = Number(row?.count ?? 0)
  }
  const safety = await queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT a.id) AS count FROM safety_articles a
     JOIN safety_article_venues av ON av.article_id = a.id
     WHERE ${venueScope(admin, 'av.venue_id').sql} AND a.state = ?`,
    [...venueScope(admin, 'av.venue_id').params, stage]
  )
  stats.safety = Number(safety?.count ?? 0)
  const venueCount = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM venues WHERE ${venueScope(admin, 'id').sql}`, venueScope(admin, 'id').params)
  stats.venues = Number(venueCount?.count ?? 0)
  const unread = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM notices n LEFT JOIN notice_reads nr
       ON nr.notice_id = n.id AND nr.admin_id = ?
     WHERE n.kind = 'internal' AND n.published = 1 AND nr.notice_id IS NULL`,
    [admin.id]
  )
  stats.unread = Number(unread?.count ?? 0)

  const months: string[] = []
  const now = new Date()
  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  const trends = await query(
    `SELECT b.venue_id, v.name AS venue_name, b.bill_month, b.income, b.expense, b.current_balance
     FROM bills b JOIN venues v ON v.id = b.venue_id
     WHERE ${venueScope(admin, 'b.venue_id').sql} AND b.state = 'approved' AND b.published = 1
       AND b.bill_month IN (${months.map(() => '?').join(',')})
     ORDER BY v.id, b.bill_month`,
    [...venueScope(admin, 'b.venue_id').params, ...months]
  )
  return { stats, months, trends, roleCode: admin.roleCode }
})
