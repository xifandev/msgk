import { requirePermission, venueScope } from '../../../utils/auth'
import { query, queryOne } from '../../../utils/db'
import { pageParams } from '../../../utils/http'
import { REVIEW_STATES } from '../../../../shared/permissions'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:view')
  const { page, pageSize, offset, search } = pageParams(event)
  const state = String(getQuery(event).state ?? '').trim()
  const scope = venueScope(admin, 'v.id')
  const conditions = [scope.sql]
  const params: unknown[] = [...scope.params]
  if (search) {
    conditions.push('(v.name LIKE ? OR v.township LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }
  if (state) {
    if (!(REVIEW_STATES as readonly string[]).includes(state)) {
      throw createError({ statusCode: 400, message: '审核状态不正确' })
    }
    conditions.push(`COALESCE(p.state, 'draft') = ?`)
    params.push(state)
  }
  const where = conditions.join(' AND ')
  // 从未填报的场所没有 venue_profiles 记录，按 draft（正在填报）纳入列表与统计
  const totalRow = await queryOne<{ total: number | string }>(
    `SELECT COUNT(*) AS total FROM venues v LEFT JOIN venue_profiles p ON p.venue_id = v.id WHERE ${where}`,
    params
  )
  const list = await query(
    `SELECT v.id AS venue_id, v.name AS venue_name, v.township, p.category,
            COALESCE(p.state, 'draft') AS state, COALESCE(p.published, 0) AS published,
            p.submitted_at, p.town_note, p.town_reviewed_at,
            p.county_note, p.county_reviewed_at, p.updated_at
     FROM venues v
     LEFT JOIN venue_profiles p ON p.venue_id = v.id
     WHERE ${where}
     ORDER BY (COALESCE(p.state, 'draft') IN ('pending_county', 'pending_town')) DESC,
              p.updated_at IS NULL, p.updated_at DESC, v.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  // 状态计数只受数据权限影响，与搜索等查询条件无关：胶囊上的数字始终反映全局
  const rows = await query<{ state: string; total: number | string }>(
    `SELECT COALESCE(p.state, 'draft') AS state, COUNT(*) AS total
     FROM venues v LEFT JOIN venue_profiles p ON p.venue_id = v.id
     WHERE ${scope.sql} GROUP BY COALESCE(p.state, 'draft')`,
    scope.params
  )
  const counts: Record<string, number> = { all: 0 }
  for (const value of REVIEW_STATES) counts[value] = 0
  for (const row of rows) {
    counts[row.state] = Number(row.total)
    counts.all = (counts.all ?? 0) + Number(row.total)
  }
  return { list, total: Number(totalRow?.total ?? 0), counts, page, pageSize }
})
