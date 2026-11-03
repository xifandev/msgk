export default defineEventHandler((event) => {
  assertSameOrigin(event)
  clearAuthCookie(event)
  return { ok: true }
})
