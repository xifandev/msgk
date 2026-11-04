export default defineEventHandler(async (event) => {
  const admin = await requireAuth(event)
  const scope = venueScope(admin, 'id')
  const venues = await query(
    `SELECT id, name, township FROM venues WHERE ${scope.sql} ORDER BY sort_order DESC, id`,
    scope.params
  )
  const payload = await readAuthPayload(event)
  let impersonator: { id: number, name: string } | null = null
  if (payload?.imp) {
    const origin = await loadAdmin(payload.imp)
    if (origin) impersonator = { id: origin.id, name: origin.name }
  }
  return { admin, venues, impersonator }
})
