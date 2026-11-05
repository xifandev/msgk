// 修复旧系统迁移过来的审核时间：
//   1) 结构与状态不一致的占位时间/备注清空（幂等，11-06 已人工清过一轮，这里兜底
//      并补上占位备注与 venue_profiles/safety_articles）；
//   2) 用旧系统操作日志（operation_logs 中迁移来的 log）把 date-only（00:00:00）
//      的提交/审核时间升级为精确时间戳。
//
// 旧系统的缺陷（msgk-old Bill.php 等）：提交审核时同时预填 zhenji_time、镇级通过
// 时同时预填 xianji_time，且一律 date('Y-m-d')，所以迁移数据时间列全是当天 00:00:00，
// 待审核阶段还带着未来才发生的"审核时间"。日志 log.time 是完整时间戳，是唯一可靠来源。
//
// 匹配规则（宁缺毋滥，匹配不上就保留原值并列入报告）：
//   - 只处理 2026-11-05 20:01:33（旧系统关停、最终同步时刻）之前的日志；
//   - 只替换当前为 date-only（TIME=00:00:00）的值，新系统写入的精确时间不动；
//   - 提交日志：操作管理员必须只管辖 1 个场所，按月（财务）定位记录；
//   - 镇级日志：操作管理员管辖场所集合 + 月份 + 现有日期与日志日期一致，候选唯一才回填；
//   - 县级日志：操作管理员为全县账号（all_venues=1），月份 + 日期一致且候选唯一才回填；
//   - 驳回日志同理，只作用于 state='rejected' 的记录；
//   - 日志日期与现有日期不一致的一律不改，列入冲突报告人工核对。
//
// 用法（项目根目录）：
//   干跑：node --env-file=.env scripts/fix-review-times.mjs
//   执行：node --env-file=.env scripts/fix-review-times.mjs --apply

import mysql from 'mysql2/promise'

const APPLY = process.argv.includes('--apply')
const LEGACY_CUTOFF = '2026-11-05 20:01:33' // 旧系统关停、sync-legacy 最终同步时刻

const nenv = (key) => process.env[key] || ''
for (const key of ['NITRO_DB_HOST', 'NITRO_DB_NAME', 'NITRO_DB_USER']) {
  if (!nenv(key)) {
    console.error(`环境变量缺失：${key}（请用 --env-file=.env 运行）`)
    process.exit(1)
  }
}

const db = await mysql.createConnection({
  host: nenv('NITRO_DB_HOST'),
  port: Number(nenv('NITRO_DB_PORT') || 3306),
  user: nenv('NITRO_DB_USER'),
  password: nenv('NITRO_DB_PASSWORD'),
  database: nenv('NITRO_DB_NAME'),
  charset: 'utf8mb4',
  dateStrings: true
})

const dateOf = (dt) => (dt ? dt.slice(0, 10) : null)
const isDateOnly = (dt) => typeof dt === 'string' && dt.length >= 19 && dt.slice(11) === '00:00:00'
const monthOf = (target) => {
  const m = String(target || '').match(/^(\d{4}-\d{2})/)
  return m ? m[1] : null
}

// ---------- 读取现状 ----------
const [admins] = await db.query('SELECT id, name, role_id, all_venues, venue_ids FROM admins')
const adminById = new Map(admins.map((a) => [a.id, {
  ...a,
  venue_ids: Array.isArray(a.venue_ids) ? a.venue_ids.map(Number) : []
}]))
const [venues] = await db.query('SELECT id, name FROM venues')
const venueName = new Map(venues.map((v) => [v.id, v.name]))
const [bills] = await db.query('SELECT id, venue_id, bill_month, state, submitted_at, town_note, town_reviewed_at, county_note, county_reviewed_at FROM bills')
const billByVM = new Map(bills.map((b) => [`${b.venue_id}|${b.bill_month}`, b]))
const [personnel] = await db.query('SELECT id, venue_id, state, submitted_at, town_note, town_reviewed_at, county_note, county_reviewed_at FROM personnel')
const personnelByVenue = new Map(personnel.map((p) => [p.venue_id, p]))
const [logs] = await db.query(
  `SELECT id, admin_id, module, action, target, created_at FROM operation_logs
   WHERE created_at <= ? AND module IN ('财务公开','人员公开')
     AND (action IN ('提交审核','镇级审核通过','县级审核通过')
          OR action LIKE '镇级审核失败%' OR action LIKE '县级审核失败%')
   ORDER BY created_at, id`,
  [LEGACY_CUTOFF]
)
console.log(`日志 ${logs.length} 条，账单 ${bills.length} 条，人员 ${personnel.length} 条`)

// ---------- 第 1 阶段：状态一致性清理 ----------
const cleanups = []
const PLACEHOLDER_TOWN = '待镇级审核'
const PLACEHOLDER_COUNTY = '待县级审核'
function planCleanup(table, row) {
  const set = {}
  if (row.state === 'draft' || row.state === 'pending_town') {
    if (row.town_reviewed_at !== null) set.town_reviewed_at = null
    if (row.county_reviewed_at !== null) set.county_reviewed_at = null
    if (row.town_note === PLACEHOLDER_TOWN) set.town_note = null
    if (row.county_note === PLACEHOLDER_COUNTY) set.county_note = null
    if (row.state === 'draft' && row.submitted_at !== null) set.submitted_at = null
  } else if (row.state === 'pending_county') {
    if (row.county_reviewed_at !== null) set.county_reviewed_at = null
    if (row.county_note === PLACEHOLDER_COUNTY) set.county_note = null
  }
  if (Object.keys(set).length) cleanups.push({ table, id: row.id, set })
}
for (const b of bills) planCleanup('bills', b)
for (const p of personnel) planCleanup('personnel', p)
const [profiles] = await db.query('SELECT id, state, submitted_at, town_note, town_reviewed_at, county_note, county_reviewed_at FROM venue_profiles')
for (const p of profiles) planCleanup('venue_profiles', p)
const [safety] = await db.query('SELECT id, state, submitted_at, town_note, town_reviewed_at, county_note, county_reviewed_at FROM safety_articles')
for (const s of safety) planCleanup('safety_articles', s)

// ---------- 第 2 阶段：日志回填精确时间 ----------
// proposals: Map<`${table}:${id}`, {row, set:{col: {value, logId}}, labels:Set}>
const proposals = new Map()
const ambiguous = []
const conflicts = []
let logsUsed = 0

function propose(table, row, col, log, label) {
  const key = `${table}:${row.id}`
  if (!proposals.has(key)) proposals.set(key, { row, set: {}, labels: new Set() })
  const p = proposals.get(key)
  const prev = p.set[col]
  if (!prev || log.created_at > prev.value) p.set[col] = { value: log.created_at, logId: log.id }
  p.labels.add(label)
}

// 为一张表建立候选匹配：scopeVenues(null=全县) + month(null=不限) + 目标列 + 状态要求
function enrich({ table, rows, log, col, requireRejected = false }) {
  const admin = adminById.get(log.admin_id)
  if (!admin) return 'no-admin'
  const isCountyLevel = col === 'county_reviewed_at'
  let scope
  if (isCountyLevel) {
    if (!admin.all_venues) return 'not-county-admin'
    scope = null
  } else {
    scope = admin.venue_ids
    if (!scope.length) return 'empty-scope'
  }
  const month = table === 'bills' ? monthOf(log.target) : null
  if (table === 'bills' && !month) return 'no-month'
  const logDate = dateOf(log.created_at)
  const candidates = rows.filter((r) => {
    if (scope && !scope.includes(Number(r.venue_id))) return false
    if (month && r.bill_month !== month) return false
    if (requireRejected && r.state !== 'rejected') return false
    if (!requireRejected && r[col] === null) return false
    // 驳回时间必须落在被驳回那一级；通过/提交要求该级已有 date-only 时间
    if (!isDateOnly(r[col])) return false
    return dateOf(r[col]) === logDate
  })
  if (candidates.length === 1) {
    propose(table, candidates[0], col, log, log.action)
    return 'ok'
  }
  if (candidates.length > 1) {
    ambiguous.push({ log, table, col, candidates: candidates.map((c) => `${venueName.get(c.venue_id) || c.venue_id}${c.bill_month ? ' ' + c.bill_month : ''}`) })
    return 'ambiguous'
  }
  // 无候选：可能是日期不一致，做一次宽松匹配用于冲突报告
  const loose = rows.filter((r) => {
    if (scope && !scope.includes(Number(r.venue_id))) return false
    if (month && r.bill_month !== month) return false
    if (requireRejected && r.state !== 'rejected') return false
    return r[col] !== null
  })
  if (loose.length) conflicts.push({ log, table, col, rows: loose.map((c) => `#${c.id} ${venueName.get(c.venue_id) || ''} ${c.bill_month || ''} ${c[col]}`) })
  return 'no-candidate'
}

const stats = {}
for (const log of logs) {
  const rows = log.module === '财务公开' ? bills : personnel
  const table = log.module === '财务公开' ? 'bills' : 'personnel'
  let col = null
  let requireRejected = false
  if (log.action === '提交审核') col = 'submitted_at'
  else if (log.action === '镇级审核通过') col = 'town_reviewed_at'
  else if (log.action === '县级审核通过') col = 'county_reviewed_at'
  else if (log.action.startsWith('镇级审核失败')) { col = 'town_reviewed_at'; requireRejected = true }
  else if (log.action.startsWith('县级审核失败')) { col = 'county_reviewed_at'; requireRejected = true }
  const result = enrich({ table, rows, log, col, requireRejected })
  stats[result] = (stats[result] || 0) + 1
  if (result === 'ok') logsUsed++
}

// 校验日期先后（提交 ≤ 镇级 ≤ 县级）：00:00:00 只是"时分秒未知"，按日期粒度比较，
// 日期层面都矛盾的是真异常，整体放弃该记录并报告
const orderViolations = []
for (const [key, p] of proposals) {
  const merged = {
    submitted_at: p.set.submitted_at?.value ?? p.row.submitted_at,
    town_reviewed_at: p.set.town_reviewed_at?.value ?? p.row.town_reviewed_at,
    county_reviewed_at: p.set.county_reviewed_at?.value ?? p.row.county_reviewed_at
  }
  const seq = [merged.submitted_at, merged.town_reviewed_at, merged.county_reviewed_at].filter(Boolean).map(dateOf)
  const sorted = [...seq].sort()
  if (JSON.stringify(seq) !== JSON.stringify(sorted)) {
    orderViolations.push({ key, merged })
    proposals.delete(key)
  }
}

// ---------- 报告 ----------
console.log('\n===== 第 1 阶段：状态一致性清理 =====')
const cleanupByTable = {}
for (const c of cleanups) cleanupByTable[c.table] = (cleanupByTable[c.table] || 0) + 1
console.log(cleanups.length ? cleanupByTable : '无需清理')
for (const c of cleanups.slice(0, 10)) console.log(`  ${c.table}#${c.id}`, JSON.stringify(c.set))

console.log('\n===== 第 2 阶段：日志回填 =====')
console.log('日志匹配结果：', stats)
const enrichByTable = {}
for (const [, p] of proposals) {
  const table = p.row.bill_month !== undefined ? 'bills' : 'personnel'
  enrichByTable[table] = (enrichByTable[table] || 0) + 1
}
console.log(`将回填 ${proposals.size} 条记录（使用日志 ${logsUsed} 条）：`, enrichByTable)
for (const [key, p] of [...proposals].slice(0, 10)) {
  const setStr = Object.entries(p.set).map(([c, v]) => `${c}: ${p.row[c]} → ${v.value}`).join('；')
  console.log(`  ${key} ${venueName.get(p.row.venue_id) || ''} ${p.row.bill_month || ''}｜${setStr}`)
}
if (ambiguous.length) {
  console.log(`\n候选不唯一、跳过 ${ambiguous.length} 条日志（示例前 10）：`)
  for (const a of ambiguous.slice(0, 10)) console.log(`  [${a.log.created_at}] ${a.log.action} ${a.log.target} → ${a.candidates.join(' / ')}`)
}
if (orderViolations.length) {
  console.log(`\n时间先后校验失败、整体放弃 ${orderViolations.length} 条：`)
  for (const v of orderViolations.slice(0, 10)) console.log(`  ${v.key}`, JSON.stringify(v.merged))
}
if (conflicts.length) console.log(`\n日期对不上、未动 ${conflicts.length} 条日志（需人工核对，示例前 5）：`)
for (const c of conflicts.slice(0, 5)) console.log(`  [${c.log.created_at}] ${c.log.action} ${c.log.target} 候选：${c.rows.join(' / ')}`)

// ---------- 执行 ----------
if (!APPLY) {
  console.log('\n（干跑模式，未写库；确认无误后加 --apply 执行）')
  await db.end()
  process.exit(0)
}

await db.beginTransaction()
try {
  for (const c of cleanups) {
    const cols = Object.keys(c.set).map((k) => `${k}=NULL`).join(', ')
    await db.query(`UPDATE \`${c.table}\` SET ${cols} WHERE id=?`, [c.id])
  }
  for (const [, p] of proposals) {
    const table = p.row.bill_month !== undefined ? 'bills' : 'personnel'
    const cols = Object.keys(p.set).map((k) => `${k}=?`).join(', ')
    const vals = Object.values(p.set).map((v) => v.value)
    await db.query(`UPDATE \`${table}\` SET ${cols} WHERE id=?`, [...vals, p.row.id])
  }
  await db.commit()
  console.log(`\n已提交：清理 ${cleanups.length} 行，回填 ${proposals.size} 行`)
} catch (err) {
  await db.rollback()
  console.error('执行失败，已回滚：', err.message)
  process.exitCode = 1
}
await db.end()
