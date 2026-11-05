import { hasPermission, requirePermission, venueScope } from '../../utils/auth'
import { queryOne } from '../../utils/db'
import { myReviewState } from '~~/shared/review'

export interface ReviewCounts {
  finance: number
  profiles: number
  personnel: number
}

/**
 * 导航红点数据：统计当前账号「待我审核」的条数。
 * 只统计有对应审核权限的栏目，并且始终受场所数据范围限制。
 */
export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'dashboard:view')
  const stage = myReviewState(admin.roleCode)
  const counts: ReviewCounts = { finance: 0, profiles: 0, personnel: 0 }
  if (!stage) return { stage: '', counts, total: 0 }

  const jobs: Promise<void>[] = []

  if (hasPermission(admin, 'finance:review')) {
    const scope = venueScope(admin, 'b.venue_id')
    jobs.push(
      queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM bills b WHERE b.state = ? AND ${scope.sql}`,
        [stage, ...scope.params]
      ).then((row) => { counts.finance = Number(row?.count ?? 0) })
    )
  }

  if (hasPermission(admin, 'venues:review')) {
    const scope = venueScope(admin, 'p.venue_id')
    jobs.push(
      queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM venue_profiles p WHERE p.state = ? AND ${scope.sql}`,
        [stage, ...scope.params]
      ).then((row) => { counts.profiles = Number(row?.count ?? 0) })
    )
  }

  if (hasPermission(admin, 'personnel:review')) {
    const scope = venueScope(admin, 'p.venue_id')
    jobs.push(
      queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM personnel p WHERE p.state = ? AND ${scope.sql}`,
        [stage, ...scope.params]
      ).then((row) => { counts.personnel = Number(row?.count ?? 0) })
    )
  }

  await Promise.all(jobs)
  return { stage, counts, total: counts.finance + counts.profiles + counts.personnel }
})
