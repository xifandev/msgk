export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const admin = await requireAuth(event)
  const payload = await readAuthPayload(event)
  const body = await readBody(event)
  const name = text(body.name, '新管理员姓名', 50)
  const phone = text(body.phone, '新管理员手机号', 20)
  if (!/^1[3-9]\d{9}$/.test(phone)) throw createError({ statusCode: 400, message: '手机号格式不正确' })
  if (phone === admin.phone) throw createError({ statusCode: 400, message: '新管理员手机号不能与当前账号相同' })
  if (await queryOne('SELECT id FROM admins WHERE phone = ?', [phone])) {
    throw createError({ statusCode: 409, message: '该手机号已有管理员账号，如需调整请联系系统管理员' })
  }
  const current = await queryOne<{ organization: string | null, all_venues: number, venue_ids: unknown }>(
    'SELECT organization, all_venues, venue_ids FROM admins WHERE id = ?',
    [admin.id]
  )
  if (!current) throw createError({ statusCode: 404, message: '当前账号不存在' })
  await withTransaction(async (conn) => {
    await conn.execute(
      'INSERT INTO admins (phone, name, role_id, organization, note, all_venues, venue_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [phone, name, admin.roleId, current.organization, `账号交接自 ${admin.name}（${admin.phone}）`, current.all_venues, JSON.stringify(admin.venueIds)]
    )
    await conn.execute('UPDATE admins SET status = 0 WHERE id = ?', [admin.id])
  })
  await logAction(admin, '账号交接', phone, `交接给 ${name}，原账号停用`, event)
  if (payload?.imp) {
    // 代交接：被切换账号已停用，自动切回系统管理员自己的账号
    setAuthCookie(event, await signAuthToken(payload.imp))
    return { ok: true, switchedBack: true }
  }
  clearAuthCookie(event)
  return { ok: true, switchedBack: false }
})
