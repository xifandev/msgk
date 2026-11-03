export default defineEventHandler(async (event) => {
  const admin = await requireAuth(event)
  const scope = venueScope(admin, 'id')
  const venues = await query(
    `SELECT id, name, township FROM venues WHERE ${scope.sql} ORDER BY sort_order DESC, id`,
    scope.params
  )
  return { admin, venues }
})
