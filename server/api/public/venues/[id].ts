interface VenueRow {
  id: number
  name: string
  township: string
  sort_order: number
  image_url: string | null
}

interface ProfileRow {
  registration_date: string | null
  religion: string | null
  category: string | null
  manager: string | null
  phone: string | null
  approval_authority: string | null
  credit_code: string | null
  address: string | null
  summary: string | null
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const id = positiveId(getRouterParam(event, 'id'), '场所ID')
  const venue = await queryOne<VenueRow>(
    'SELECT id, name, township, sort_order, image_url FROM venues WHERE id = ?',
    [id]
  )
  if (!venue) throw createError({ statusCode: 404, message: '场所不存在' })
  const profile = await queryOne<ProfileRow>(
    `SELECT registration_date, religion, category, manager, phone, approval_authority, credit_code, address, summary
     FROM venue_profiles WHERE venue_id = ? AND state = 'approved' AND published = 1`,
    [id]
  )
  return {
    id: venue.id,
    name: venue.name,
    township: venue.township,
    sortOrder: venue.sort_order,
    imageUrl: venue.image_url,
    profile: profile
      ? {
          registrationDate: profile.registration_date,
          religion: profile.religion,
          category: profile.category,
          manager: profile.manager,
          phone: profile.phone,
          approvalAuthority: profile.approval_authority,
          creditCode: profile.credit_code,
          address: profile.address,
          summary: profile.summary
        }
      : null
  }
})
