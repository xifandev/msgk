export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  // 防止遍历 venueId 批量抓取全镇管理员联系方式
  checkRateLimit(`contacts:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`, 30, 60 * 1000)
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
    list: rows.map((row) => {
      const nameChars = [...row.name]
      const mobile = /^1[3-9]\d{9}$/.test(row.phone)
      return {
        name: `${nameChars[0] ?? '*'}${'*'.repeat(Math.max(1, nameChars.length - 1))}`,
        // 仅标准 11 位手机号才显示尾号，异常数据整体掩码，避免完整泄露
        phone: mobile ? `****${row.phone.slice(-4)}` : '****',
        roleName: row.role_name
      }
    })
  }
})
