export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const payload = await readAuthPayload(event)
  if (!payload?.imp) throw createError({ statusCode: 400, message: '当前不是代登录状态' })
  const origin = await loadAdmin(payload.imp)
  if (!origin) {
    clearAuthCookie(event)
    throw createError({ statusCode: 401, message: '原账号已不可用，请重新登录' })
  }
  const current = await loadAdmin(payload.aid)
  setAuthCookie(event, await signAuthToken(origin.id))
  if (current) await logAction(origin, '管理员', current.phone, `切回本人账号（结束代登录 ${current.name}）`, event)
  return { admin: origin, redirect: '/dashboard' }
})
