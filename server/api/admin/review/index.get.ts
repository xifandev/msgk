import { hasPermission, requireAuth, venueScope } from '../../../utils/auth'
import { query, queryOne } from '../../../utils/db'
import { pageParams } from '../../../utils/http'
import { REVIEW_STATES } from '../../../../shared/permissions'

interface Scope { sql: string, params: number[] }

export default defineEventHandler(async (event) => {
  const admin = await requireAuth(event)
  const canProfiles = hasPermission(admin, 'venues:review')
  const canPersonnel = hasPermission(admin, 'personnel:review')
  if (!canProfiles && !canPersonnel) throw createError({ statusCode: 403, message: '没有该操作的权限' })

  const { page, pageSize, offset, search } = pageParams(event)
  const state = String(getQuery(event).state ?? '').trim()
  if (state && !(REVIEW_STATES as readonly string[]).includes(state)) {
    throw createError({ statusCode: 400, message: '审核状态不正确' })
  }

  const profileScope = venueScope(admin, 'v.id')
  const personnelScope = venueScope(admin, 'p.venue_id')

  // 无对应审核权限时该分支直接置空（1 = 0），不暴露另一类数据
  function branchWhere(enabled: boolean, scope: Scope, withState: boolean) {
    if (!enabled) return { sql: '1 = 0', params: [] as unknown[] }
    const conditions = [scope.sql]
    const params: unknown[] = [...scope.params]
    if (search) {
      conditions.push('(v.name LIKE ? OR v.township LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    if (withState && state) {
      conditions.push('p.state = ?')
      params.push(state)
    }
    return { sql: conditions.join(' AND '), params }
  }

  const profileList = branchWhere(canProfiles, profileScope, true)
  const personnelList = branchWhere(canPersonnel, personnelScope, true)
  const profileCount = branchWhere(canProfiles, profileScope, false)
  const personnelCount = branchWhere(canPersonnel, personnelScope, false)

  // 场所介绍与人员名册合并为统一审核队列，待办优先，再按更新时间倒序
  const unionBody = `
    (SELECT 'profiles' AS type, p.venue_id, v.name AS venue_name, v.township, p.state, p.published,
            p.submitted_at, p.town_note, p.town_reviewed_at, p.county_note, p.county_reviewed_at,
            p.updated_at, p.category, NULL AS member_count, NULL AS first_member, p.id AS sort_id
     FROM venue_profiles p JOIN venues v ON v.id = p.venue_id
     WHERE ${profileList.sql})
    UNION ALL
    (SELECT 'personnel' AS type, p.venue_id, v.name, v.township, p.state, p.published,
            p.submitted_at, p.town_note, p.town_reviewed_at, p.county_note, p.county_reviewed_at,
            p.updated_at, NULL, JSON_LENGTH(p.members), JSON_UNQUOTE(JSON_EXTRACT(p.members, '$[0].name')), p.id
     FROM personnel p JOIN venues v ON v.id = p.venue_id
     WHERE ${personnelList.sql})`

  const unionParams = [...profileList.params, ...personnelList.params]
  const totalRow = await queryOne<{ total: number | string }>(
    `SELECT COUNT(*) AS total FROM (${unionBody}) u`,
    unionParams
  )
  const list = await query(
    `SELECT u.type, u.venue_id, u.venue_name, u.township, u.state, u.published,
            u.submitted_at, u.town_note, u.town_reviewed_at, u.county_note, u.county_reviewed_at,
            u.updated_at, u.category, u.member_count, u.first_member
     FROM (${unionBody}) u
     ORDER BY (u.state IN ('pending_county', 'pending_town')) DESC, u.updated_at DESC, u.sort_id DESC
     LIMIT ? OFFSET ?`,
    [...unionParams, pageSize, offset]
  )

  // 分类统计：只受数据权限、搜索词与类型权限影响，不受当前状态筛选影响
  const countRows = await query<{ state: string, total: number | string }>(
    `SELECT u.state, SUM(u.total) AS total FROM (
       (SELECT p.state, COUNT(*) AS total FROM venue_profiles p JOIN venues v ON v.id = p.venue_id
        WHERE ${profileCount.sql} GROUP BY p.state)
       UNION ALL
       (SELECT p.state, COUNT(*) AS total FROM personnel p JOIN venues v ON v.id = p.venue_id
        WHERE ${personnelCount.sql} GROUP BY p.state)
     ) u GROUP BY u.state`,
    [...profileCount.params, ...personnelCount.params]
  )
  const counts: Record<string, number> = { all: 0 }
  for (const value of REVIEW_STATES) counts[value] = 0
  for (const row of countRows) {
    counts[row.state] = Number(row.total)
    counts.all = (counts.all ?? 0) + Number(row.total)
  }
  return { list, total: Number(totalRow?.total ?? 0), counts, page, pageSize }
})
