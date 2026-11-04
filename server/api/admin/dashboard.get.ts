const MONTH_COUNT = 12

type VenueRow = { id: number, name: string, township: string }
type BillRow = { venue_id: number, bill_month: string, state: string, published: number, submitted_at: string | null }

type PeriodState = 'published' | 'approved' | 'pending' | 'rejected' | 'draft' | 'missing'

interface PeriodBucket {
  month: string
  total: number
  published: number
  approved: number
  pending: number
  rejected: number
  draft: number
  missing: number
  coverage: number
}

function monthList(now: Date): string[] {
  const months: string[] = []
  for (let offset = MONTH_COUNT - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function stateOf(row: BillRow | undefined): PeriodState {
  if (!row) return 'missing'
  if (row.state === 'approved') return row.published === 1 ? 'published' : 'approved'
  if (row.state === 'pending_town' || row.state === 'pending_county') return 'pending'
  if (row.state === 'rejected') return 'rejected'
  return 'draft'
}

function emptyBucket(month: string, total: number): PeriodBucket {
  return { month, total, published: 0, approved: 0, pending: 0, rejected: 0, draft: 0, missing: total, coverage: 0 }
}

function countInto(bucket: PeriodBucket, state: PeriodState) {
  bucket[state] += 1
  bucket.missing = bucket.total - bucket.published - bucket.approved - bucket.pending - bucket.rejected - bucket.draft
  bucket.coverage = bucket.total ? bucket.published / bucket.total : 0
}

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'dashboard:view')
  const scope = venueScope(admin, 'id')
  const venues = await query<VenueRow>(
    `SELECT id, name, township FROM venues WHERE ${scope.sql} ORDER BY township ASC, sort_order ASC, id ASC`,
    scope.params
  )
  const months = monthList(new Date())
  const firstMonth = months[0]!
  const lastMonth = months[months.length - 1]!

  const billScope = venueScope(admin, 'venue_id')
  const bills = await query<BillRow>(
    `SELECT venue_id, bill_month, state, published, submitted_at FROM bills
     WHERE ${billScope.sql} AND bill_month >= ? AND bill_month <= ?`,
    [...billScope.params, firstMonth, lastMonth]
  )

  const billMap = new Map<string, BillRow>()
  for (const row of bills) billMap.set(`${row.venue_id}|${row.bill_month}`, row)

  const monthly: PeriodBucket[] = months.map((month) => {
    const bucket = emptyBucket(month, venues.length)
    for (const venue of venues) countInto(bucket, stateOf(billMap.get(`${venue.id}|${month}`)))
    return bucket
  })

  const requested = String(getQuery(event).month ?? '')
  const fallback = months[months.length - 2] ?? lastMonth
  const month = months.includes(requested) ? requested : fallback

  const townshipMap = new Map<string, { township: string, total: number, venues: VenueRow[] }>()
  for (const venue of venues) {
    const entry = townshipMap.get(venue.township) ?? { township: venue.township, total: 0, venues: [] }
    entry.total += 1
    entry.venues.push(venue)
    townshipMap.set(venue.township, entry)
  }

  const townships = [...townshipMap.values()].map((entry) => {
    const bucket = emptyBucket(month, entry.total)
    for (const venue of entry.venues) countInto(bucket, stateOf(billMap.get(`${venue.id}|${month}`)))
    const history = months.map((point) => {
      const cell = emptyBucket(point, entry.total)
      for (const venue of entry.venues) countInto(cell, stateOf(billMap.get(`${venue.id}|${point}`)))
      return {
        month: point,
        published: cell.published,
        pending: cell.pending,
        rejected: cell.rejected,
        missing: cell.missing,
        coverage: cell.coverage
      }
    })
    return { ...bucket, township: entry.township, history }
  }).sort((a, b) => a.coverage - b.coverage || b.total - a.total || a.township.localeCompare(b.township, 'zh-Hans-CN'))

  const rows = venues.map((venue) => {
    const bill = billMap.get(`${venue.id}|${month}`)
    return {
      id: venue.id,
      name: venue.name,
      township: venue.township,
      state: stateOf(bill),
      rawState: bill?.state ?? null,
      submittedAt: bill?.submitted_at ?? null
    }
  })

  const bucket = monthly.find((item) => item.month === month) ?? emptyBucket(month, venues.length)
  const previous = monthly[months.indexOf(month) - 1]

  const venueIds = venues.map((venue) => venue.id)
  const inScope = venueIds.length ? `(${venueIds.map(() => '?').join(',')})` : '(NULL)'
  const profileScope = venueScope(admin, 'venue_id')
  const modules = await Promise.all([
    queryOne<{ published: number, pending: number, filled: number }>(
      `SELECT COALESCE(SUM(published = 1 AND state = 'approved'), 0) AS published,
              COALESCE(SUM(state IN ('pending_town','pending_county')), 0) AS pending,
              COUNT(*) AS filled
       FROM venue_profiles WHERE ${profileScope.sql}`,
      profileScope.params
    ),
    queryOne<{ published: number, pending: number, filled: number }>(
      `SELECT COALESCE(SUM(published = 1 AND state = 'approved'), 0) AS published,
              COALESCE(SUM(state IN ('pending_town','pending_county')), 0) AS pending,
              COUNT(*) AS filled
       FROM personnel WHERE ${profileScope.sql}`,
      profileScope.params
    ),
    queryOne<{ published: number }>(
      `SELECT COUNT(DISTINCT av.venue_id) AS published
       FROM safety_articles a JOIN safety_article_venues av ON av.article_id = a.id
       WHERE av.venue_id IN ${inScope} AND a.state = 'approved' AND a.published = 1`,
      venueIds
    ),
    queryOne<{ pending: number }>(
      `SELECT COUNT(DISTINCT a.id) AS pending
       FROM safety_articles a JOIN safety_article_venues av ON av.article_id = a.id
       WHERE av.venue_id IN ${inScope} AND a.state IN ('pending_town','pending_county')`,
      venueIds
    )
  ])

  const unread = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM notices n LEFT JOIN notice_reads nr
       ON nr.notice_id = n.id AND nr.admin_id = ?
     WHERE n.kind = 'internal' AND n.published = 1 AND nr.notice_id IS NULL`,
    [admin.id]
  )

  const single = venues.length === 1 ? venues[0]! : null
  const selfHistory = single
    ? months.map((point) => ({ month: point, state: stateOf(billMap.get(`${single.id}|${point}`)) }))
    : null

  return {
    months,
    month,
    roleCode: admin.roleCode,
    venueTotal: venues.length,
    townshipTotal: townshipMap.size,
    period: bucket,
    previous: previous && previous.month !== month ? previous : null,
    monthly,
    townships,
    rows,
    selfHistory,
    unread: Number(unread?.count ?? 0),
    info: {
      profiles: {
        published: Number(modules[0]?.published ?? 0),
        pending: Number(modules[0]?.pending ?? 0),
        filled: Number(modules[0]?.filled ?? 0)
      },
      personnel: {
        published: Number(modules[1]?.published ?? 0),
        pending: Number(modules[1]?.pending ?? 0),
        filled: Number(modules[1]?.filled ?? 0)
      },
      safety: {
        published: Number(modules[2]?.published ?? 0),
        pending: Number(modules[3]?.pending ?? 0),
        filled: Number(modules[2]?.published ?? 0)
      }
    }
  }
})
