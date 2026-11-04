interface PersonnelRow {
  members: unknown
}

function maskPhone(phone: unknown): string {
  const value = String(phone ?? '').trim()
  if (!value) return ''
  if (value.length <= 7) return `${value[0]}****`
  return `${value.slice(0, 3)}****${value.slice(-4)}`
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const venueId = positiveId(getQuery(event).venueId, '场所ID')
  const row = await queryOne<PersonnelRow>(
    "SELECT members FROM personnel WHERE venue_id = ? AND state = 'approved' AND published = 1",
    [venueId]
  )
  const members = row ? parseJson<Record<string, unknown>[]>(row.members, []) : []
  return {
    venueId,
    members: (Array.isArray(members) ? members : []).map((member) => ({
      ...member,
      phone: maskPhone(member.phone)
    }))
  }
})
