interface VenueRow {
  id: number
  name: string
  township: string
  sort_order: number
  image_url: string | null
}

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const rows = await query<VenueRow>(
    'SELECT id, name, township, sort_order, image_url FROM venues ORDER BY township ASC, sort_order ASC, id ASC'
  )
  const list = rows.map(row => ({
    id: row.id,
    name: row.name,
    township: row.township,
    sortOrder: row.sort_order,
    imageUrl: row.image_url
  }))
  const groups = new Map<string, { text: string, children: { id: number, text: string, sortOrder: number }[] }>()
  for (const venue of list) {
    let group = groups.get(venue.township)
    if (!group) {
      group = { text: venue.township, children: [] }
      groups.set(venue.township, group)
    }
    group.children.push({ id: venue.id, text: venue.name, sortOrder: venue.sortOrder })
  }
  return { list, tree: [...groups.values()] }
})
