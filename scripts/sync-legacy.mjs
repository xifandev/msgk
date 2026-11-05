// 旧系统（Laravel 版 msgk 库）→ 新系统（msgk2）关停后最终增量同步。
//
// 用法（在项目根目录执行）：
//   干跑（默认，只比对并输出同步计划，不写库）：
//     node --env-file=.env scripts/sync-legacy.mjs
//   实际执行：
//     node --env-file=.env scripts/sync-legacy.mjs --apply
//
// 旧库连接信息默认取自老项目 /Users/getlong/Code/msgk-old/laravel/.env，
// 可用 --legacy-env=<路径> 覆盖。脚本只读旧库，所有写入都在新库一个事务内完成。
//
// 同步规则（与 database/migrate-legacy.sql 的转换口径一致）：
// - 账单按 场所+月份 匹配（不能按主键：补齐脚本与新系统的自增 id 与旧库 zid 已交错）；
//   主键能对上的视为迁移行，内容有差异且新系统未动过（created_by/updated_by 均为空）
//   才用旧库覆盖，同时整体刷新该账单明细；新系统动过的一律列入冲突清单，不覆盖。
// - 主键对不上但场所+月份已存在账单：仅当新库该账单是无人动过的空草稿
//   （含自动补齐的）时才用旧库内容覆盖，否则列入冲突清单。
// - 人员/场所介绍按场所比对（人员照片地址不参与比对），有差异且未动过才覆盖；
//   覆盖人员后需重跑 scripts/migrate-personnel-images.mjs 把照片重新转存 OSS。
// - 安全文章、新闻按主键比对，有差异且未动过才覆盖；新闻分类、场所、管理员
//   的角色等只报告差异不改动（可能已在新系统人工调整过）。
// - 旧库新增的管理员、场所、日志直接追加；日志按内容元组去重。
// - 账单同步完成后，自动修复所有"无人动过的空草稿"账单的结余链（承接被
//   覆盖账单的真实结余）。

import fs from 'node:fs'
import mysql from 'mysql2/promise'

const APPLY = process.argv.includes('--apply')
const legacyEnvArg = process.argv.find((a) => a.startsWith('--legacy-env='))
const LEGACY_ENV_PATH = legacyEnvArg ? legacyEnvArg.slice('--legacy-env='.length) : '/Users/getlong/Code/msgk-old/laravel/.env'

function loadEnvFile(path) {
  const out = {}
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const nenv = (key) => process.env[key] || ''
for (const key of ['NITRO_DB_HOST', 'NITRO_DB_NAME', 'NITRO_DB_USER']) {
  if (!nenv(key)) {
    console.error(`环境变量缺失：${key}（请用 --env-file=.env 运行）`)
    process.exit(1)
  }
}
if (!fs.existsSync(LEGACY_ENV_PATH)) {
  console.error(`找不到旧项目配置：${LEGACY_ENV_PATH}（可用 --legacy-env= 指定）`)
  process.exit(1)
}
const lenv = loadEnvFile(LEGACY_ENV_PATH)
for (const key of ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME']) {
  if (!lenv[key]) {
    console.error(`旧项目配置缺失：${key}`)
    process.exit(1)
  }
}

const newDb = await mysql.createConnection({
  host: nenv('NITRO_DB_HOST'),
  port: Number(nenv('NITRO_DB_PORT') || 3306),
  user: nenv('NITRO_DB_USER'),
  password: nenv('NITRO_DB_PASSWORD'),
  database: nenv('NITRO_DB_NAME'),
  charset: 'utf8mb4',
  decimalNumbers: true,
  dateStrings: true
})
const oldDb = await mysql.createConnection({
  host: lenv.DB_HOST,
  port: Number(lenv.DB_PORT || 3306),
  user: lenv.DB_USERNAME,
  password: lenv.DB_PASSWORD,
  database: lenv.DB_DATABASE,
  charset: 'utf8mb4',
  dateStrings: true
})

// ---------- 转换辅助（口径同 migrate-legacy.sql） ----------
const STATE_MAP = { 正在编辑: 'draft', 待镇级审核: 'pending_town', 待县级审核: 'pending_county', 审核通过: 'approved', 审核失败: 'rejected' }
const mapState = (s) => STATE_MAP[s] ?? 'draft'
const dec = (v) => {
  const s = String(v ?? '').trim()
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : 0
}
const toText = (v) => {
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
  }
  return String(v ?? '')
}
const parseDT = (v) => {
  const m = toText(v).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  return `${m[1]} ${m[2] ?? '00:00'}:${m[3] ?? '00'}`
}
const parseD = (v) => {
  const m = toText(v).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}
const emptyToNull = (v) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}
const parseJson = (v, fallback) => {
  try { return JSON.parse(v) } catch { return fallback }
}
const normNum = (v) => Number(v ?? 0)
const eq = (a, b) => (a ?? null) === (b ?? null)

// ---------- 读取新库现状 ----------
const [newVenues] = await newDb.query('SELECT id, name, township, sort_order FROM venues')
const newVenueById = new Map(newVenues.map((v) => [v.id, v]))
const [newBills] = await newDb.query('SELECT * FROM bills')
const newBillById = new Map(newBills.map((b) => [b.id, b]))
const newBillByVM = new Map(newBills.map((b) => [`${b.venue_id}|${b.bill_month}`, b]))
const [newItems] = await newDb.query('SELECT * FROM bill_items')
const newItemIds = new Set(newItems.map((i) => i.id))
const newItemsByBill = new Map()
for (const item of newItems) {
  if (!newItemsByBill.has(item.bill_id)) newItemsByBill.set(item.bill_id, new Map())
  newItemsByBill.get(item.bill_id).set(item.id, item)
}
const [newPersonnel] = await newDb.query('SELECT * FROM personnel')
const newPersonnelByVenue = new Map(newPersonnel.map((p) => [p.venue_id, p]))
const [newProfiles] = await newDb.query('SELECT * FROM venue_profiles')
const newProfileByVenue = new Map(newProfiles.map((p) => [p.venue_id, p]))
const [newSafety] = await newDb.query('SELECT * FROM safety_articles')
const newSafetyById = new Map(newSafety.map((s) => [s.id, s]))
const [newSafetyLinks] = await newDb.query('SELECT article_id, venue_id FROM safety_article_venues')
const newSafetyLinkSet = new Set(newSafetyLinks.map((l) => `${l.article_id}|${l.venue_id}`))
const [newNews] = await newDb.query('SELECT * FROM news_articles')
const newNewsById = new Map(newNews.map((n) => [n.id, n]))
const [newCats] = await newDb.query('SELECT id, name FROM news_categories')
const newCatById = new Map(newCats.map((c) => [c.id, c]))
const [newAdmins] = await newDb.query('SELECT * FROM admins')
const newAdminByPhone = new Map(newAdmins.map((a) => [a.phone, a]))

// ---------- 同步计划收集 ----------
const plan = {
  billsUpdate: [], billsInsert: [], billsConflict: [], billsSkipOrphan: [], billsSkipBadMonth: [],
  itemsInsert: [],
  venuesInsert: [], venuesDiff: [],
  personnelUpdate: [], personnelConflict: [],
  profilesUpdate: [], profilesConflict: [],
  safetyUpdate: [], safetyInsert: [], safetyConflict: [],
  newsUpdate: [], newsInsert: [], newsConflict: [],
  catsDiff: [],
  adminsInsert: [], adminsLogin: [], adminsDiff: [],
  logsInsert: []
}
let billsEqual = 0
let personnelEqual = 0
let profilesEqual = 0

// ---------- 账单与明细 ----------
function legacyBillRow(z) {
  return {
    venue_id: z.cid,
    bill_month: /^\d{4}-\d{2}/.test(toText(z.time).trim()) ? toText(z.time).trim().slice(0, 7) : null,
    income: dec(z.shouru),
    expense: dec(z.zhichu),
    previous_balance: dec(z.shangyue_jieyu),
    current_balance: dec(z.benyue_jieyu),
    state: mapState(z.state),
    published: Number(z.kaiguan) === 1 ? 1 : 0,
    submitted_at: parseDT(z.tijiao_time),
    town_note: emptyToNull(z.zhenji),
    town_reviewed_at: parseDT(z.zhenji_time),
    county_note: emptyToNull(z.xianji),
    county_reviewed_at: parseDT(z.xianji_time)
  }
}
function billContentDiff(nb, lb) {
  const fields = ['venue_id', 'bill_month', 'state', 'submitted_at', 'town_note', 'town_reviewed_at', 'county_note', 'county_reviewed_at']
  for (const f of fields) if (!eq(nb[f], lb[f])) return f
  // 无人动过的空草稿的结余由新系统按月结转计算，旧库手工填写值不参与比对
  const newIsSystemDraft = untouched(nb) && nb.state === 'draft' && normNum(nb.income) === 0 && normNum(nb.expense) === 0
  const amountFields = newIsSystemDraft ? ['income', 'expense'] : ['income', 'expense', 'previous_balance', 'current_balance']
  for (const f of amountFields) if (normNum(nb[f]) !== lb[f]) return f
  if (Number(nb.published) !== lb.published) return 'published'
  return null
}
function itemDiffLabel(newItemMap, items) {
  const missing = items.filter((it) => !newItemMap.has(it.legacy_mid))
  const changed = items.filter((it) => {
    const ni = newItemMap.get(it.legacy_mid)
    return ni && (!eq(ni.occurred_on, it.occurred_on) || !eq(ni.kind, it.kind) || !eq(ni.summary, it.summary) || normNum(ni.amount) !== it.amount)
  })
  const extra = [...newItemMap.keys()].filter((id) => !items.some((it) => it.legacy_mid === id))
  return { missing, changed, extra, label: `缺${missing.length}/改${changed.length}/多${extra.length}`, same: !missing.length && !changed.length && !extra.length }
}
function legacyItemRow(m, billId, venueId) {
  return {
    legacy_mid: m.mid,
    bill_id: billId,
    venue_id: venueId,
    occurred_on: parseD(m.time),
    kind: m.type === '收入' ? 'income' : m.type === '支出' ? 'expense' : null,
    summary: String(m.name ?? '').slice(0, 100),
    amount: dec(m.jine),
    created_at: parseDT(m.tijiao_time)
  }
}
const untouched = (row) => row.created_by === null && row.updated_by === null
const isEmptyDraft = async (bill) => {
  if (!untouched(bill) || bill.state !== 'draft') return false
  const [rows] = await newDb.query('SELECT COUNT(*) c FROM bill_items WHERE bill_id = ?', [bill.id])
  return rows[0].c === 0
}

const [legacyBills] = await oldDb.query('SELECT * FROM zhangdan')
const [legacyItems] = await oldDb.query('SELECT * FROM mingxi')
const legacyItemsByBillKey = new Map()
for (const m of legacyItems) {
  const month = /^\d{4}-\d{2}/.test(toText(m.time).trim()) ? toText(m.time).trim().slice(0, 7) : null
  if (!month) continue
  const key = `${m.cid}|${month}`
  if (!legacyItemsByBillKey.has(key)) legacyItemsByBillKey.set(key, [])
  legacyItemsByBillKey.get(key).push(m)
}

for (const z of legacyBills) {
  const lb = legacyBillRow(z)
  const venue = newVenueById.get(z.cid)
  if (!venue) { plan.billsSkipOrphan.push({ zid: z.zid, cid: z.cid, month: lb.bill_month }); continue }
  if (!lb.bill_month) { plan.billsSkipBadMonth.push({ zid: z.zid, cid: z.cid, time: z.time }); continue }
  const items = (legacyItemsByBillKey.get(`${z.cid}|${lb.bill_month}`) ?? [])
    .map((m) => legacyItemRow(m, null, z.cid))
    .filter((it) => it.kind && it.occurred_on)

  const byId = newBillById.get(z.zid)
  if (byId && byId.venue_id === lb.venue_id && byId.bill_month === lb.bill_month) {
    const diffField = billContentDiff(byId, lb)
    const itemDiff = itemDiffLabel(newItemsByBill.get(byId.id) ?? new Map(), items)
    if (!diffField && itemDiff.same) { billsEqual++; continue }
    if (!untouched(byId)) {
      plan.billsConflict.push({ id: byId.id, venue: venue.name, month: lb.bill_month, reason: `新系统已修改（字段 ${diffField ?? '明细'} 有差异）` })
      continue
    }
    plan.billsUpdate.push({ id: byId.id, venue: venue.name, month: lb.bill_month, diff: diffField, itemsDelta: itemDiff.label, data: lb, items })
    continue
  }
  const byVM = newBillByVM.get(`${lb.venue_id}|${lb.bill_month}`)
  if (byVM) {
    const diffField = billContentDiff(byVM, lb)
    const itemDiff = itemDiffLabel(newItemsByBill.get(byVM.id) ?? new Map(), items)
    if (!diffField && itemDiff.same) { billsEqual++; continue }
    if (await isEmptyDraft(byVM)) {
      plan.billsUpdate.push({ id: byVM.id, venue: venue.name, month: lb.bill_month, diff: '空草稿覆盖', itemsDelta: `补${items.length}条明细`, data: lb, items })
    } else {
      plan.billsConflict.push({ id: byVM.id, venue: venue.name, month: lb.bill_month, reason: '新库同场所同月份已有有效账单（旧库 zid=' + z.zid + '）' })
    }
    continue
  }
  plan.billsInsert.push({ zid: z.zid, venue: venue.name, month: lb.bill_month, data: lb, items })
}

// ---------- 人员 ----------
function legacyMembers(neirong) {
  return (parseJson(neirong, []) ?? []).map((m) => ({
    sort: Number(m.paixu) || 0,
    imageUrl: emptyToNull(m.img),
    name: String(m.xingming ?? ''),
    gender: String(m.xingbie ?? ''),
    clergy: String(m.jiaozhi ?? ''),
    position: String(m.zhiwu ?? ''),
    phone: String(m.tel ?? '')
  }))
}
function membersEqual(a, b) {
  if (a.length !== b.length) return false
  return a.every((ma, i) => {
    const mb = b[i]
    return (Number(ma.sort) || 0) === (Number(mb.sort) || 0)
      && Boolean(ma.imageUrl) === Boolean(mb.imageUrl)
      && ['name', 'gender', 'clergy', 'position', 'phone'].every((f) => String(ma[f] ?? '') === String(mb[f] ?? ''))
  })
}
const [legacyPersonnel] = await oldDb.query('SELECT * FROM renyuan')
const seenPersonnelVenue = new Set()
for (const r of legacyPersonnel) {
  if (seenPersonnelVenue.has(r.cid)) continue // 与迁移脚本一致：同场所只取 rid 最小者
  seenPersonnelVenue.add(r.cid)
  const venue = newVenueById.get(r.cid)
  if (!venue) continue
  const members = legacyMembers(r.neirong)
  const lp = {
    state: mapState(r.state),
    published: Number(r.kaiguan) === 1 ? 1 : 0,
    submitted_at: parseDT(r.tijiao_time),
    town_note: emptyToNull(r.zhenji),
    town_reviewed_at: parseDT(r.zhenji_time),
    county_note: emptyToNull(r.xianji),
    county_reviewed_at: parseDT(r.xianji_time)
  }
  const np = newPersonnelByVenue.get(r.cid)
  if (!np) { plan.personnelConflict.push({ venue: venue.name, reason: '新库该场所无人名册（旧库 rid=' + r.rid + '）' }); continue }
  const newMembers = parseJson(typeof np.members === 'string' ? np.members : JSON.stringify(np.members), [])
  const sameMeta = ['state', 'submitted_at', 'town_note', 'town_reviewed_at', 'county_note', 'county_reviewed_at'].every((f) => eq(np[f], lp[f])) && Number(np.published) === lp.published
  if (sameMeta && membersEqual(newMembers, members)) { personnelEqual++; continue }
  if (!untouched(np)) { plan.personnelConflict.push({ venue: venue.name, reason: '新系统已修改，且与旧库内容不一致' }); continue }
  plan.personnelUpdate.push({ id: np.id, venue: venue.name, data: lp, members })
}

// ---------- 场所介绍 ----------
function legacyExtra(neirong) {
  const out = {}
  for (const item of parseJson(neirong, []) ?? []) {
    if (item.mingcheng) out[item.mingcheng] = item.neirong ?? ''
  }
  return out
}
const [legacyProfiles] = await oldDb.query('SELECT * FROM jieshao')
const seenProfileVenue = new Set()
for (const j of legacyProfiles) {
  if (seenProfileVenue.has(j.cid)) continue
  seenProfileVenue.add(j.cid)
  const venue = newVenueById.get(j.cid)
  if (!venue) continue
  const lp = {
    registration_date: parseD(j.dengji_time),
    religion: emptyToNull(j.zongjiao),
    category: emptyToNull(j.leibie),
    manager: emptyToNull(j.fuzeren),
    phone: emptyToNull(String(j.tel ?? '').slice(0, 30)),
    approval_authority: emptyToNull(j.pizhun),
    credit_code: emptyToNull(j.daima),
    address: emptyToNull(j.dizhi),
    summary: emptyToNull(j.jianjie),
    extra: legacyExtra(j.neirong),
    state: mapState(j.state),
    published: Number(j.kaiguan) === 1 ? 1 : 0,
    submitted_at: parseDT(j.tijiao_time),
    town_note: emptyToNull(j.zhenji),
    town_reviewed_at: parseDT(j.zhenji_time),
    county_note: emptyToNull(j.xianji),
    county_reviewed_at: parseDT(j.xianji_time)
  }
  const np = newProfileByVenue.get(j.cid)
  if (!np) continue
  const newExtra = parseJson(typeof np.extra === 'string' ? np.extra : JSON.stringify(np.extra), {})
  const scalarFields = ['registration_date', 'religion', 'category', 'manager', 'phone', 'approval_authority', 'credit_code', 'address', 'summary', 'state', 'submitted_at', 'town_note', 'town_reviewed_at', 'county_note', 'county_reviewed_at']
  const same = scalarFields.every((f) => eq(np[f], lp[f])) && Number(np.published) === lp.published
    && JSON.stringify(newExtra) === JSON.stringify(lp.extra)
  if (same) { profilesEqual++; continue }
  if (!untouched(np)) { plan.profilesConflict.push({ venue: venue.name, reason: '新系统已修改，且与旧库内容不一致' }); continue }
  plan.profilesUpdate.push({ id: np.id, venue: venue.name, data: lp })
}

// ---------- 安全文章 ----------
const [legacySafety] = await oldDb.query('SELECT * FROM anquan')
for (const a of legacySafety) {
  const ls = {
    title: String(a.title ?? ''),
    cover_url: emptyToNull(a.img),
    content: String(a.content ?? ''),
    author_name: emptyToNull(a.author),
    state: mapState(a.state),
    published: Number(a.kaiguan) === 1 ? 1 : 0,
    submitted_at: parseDT(a.tijiao_time),
    town_note: emptyToNull(a.zhenji),
    town_reviewed_at: parseDT(a.zhenji_time),
    county_note: emptyToNull(a.xianji),
    county_reviewed_at: parseDT(a.xianji_time)
  }
  const linkVenues = (parseJson(a.cids, []) ?? []).filter((cid) => newVenueById.has(cid))
  const ns = newSafetyById.get(a.aid)
  if (!ns) { plan.safetyInsert.push({ aid: a.aid, title: ls.title, data: ls, linkVenues, legacy: a }); continue }
  const same = ['title', 'cover_url', 'content', 'author_name', 'state', 'submitted_at', 'town_note', 'town_reviewed_at', 'county_note', 'county_reviewed_at'].every((f) => eq(ns[f], ls[f])) && Number(ns.published) === ls.published
  const linksSame = linkVenues.every((v) => newSafetyLinkSet.has(`${a.aid}|${v}`))
    && newSafetyLinks.filter((l) => l.article_id === a.aid).length === linkVenues.length
  if (same && linksSame) continue
  if (!untouched(ns)) { plan.safetyConflict.push({ id: a.aid, title: ls.title, reason: '新系统已修改，且与旧库内容不一致' }); continue }
  plan.safetyUpdate.push({ id: a.aid, title: ls.title, data: ls, linkVenues })
}

// ---------- 新闻 ----------
const [legacyNews] = await oldDb.query('SELECT * FROM news')
for (const n of legacyNews) {
  if (!newCatById.has(n.tid)) continue
  const ln = {
    category_id: n.tid,
    title: String(n.title ?? ''),
    summary: emptyToNull(n.zhaiyao),
    cover_url: emptyToNull(n.img),
    content: String(n.content ?? ''),
    author_name: emptyToNull(n.author),
    published: Number(n.state) === 1 ? 1 : 0
  }
  const nn = newNewsById.get(n.nid)
  if (!nn) { plan.newsInsert.push({ nid: n.nid, title: ln.title, data: ln, legacy: n }); continue }
  const same = ['category_id', 'title', 'summary', 'cover_url', 'content', 'author_name'].every((f) => eq(nn[f], ln[f])) && Number(nn.published) === ln.published
  if (same) continue
  if (nn.updated_by !== null || nn.created_by !== null) { plan.newsConflict.push({ id: n.nid, title: ln.title, reason: '新系统已修改，且与旧库内容不一致' }); continue }
  plan.newsUpdate.push({ id: n.nid, title: ln.title, data: ln })
}
const [legacyCats] = await oldDb.query('SELECT * FROM news_type')
for (const c of legacyCats) {
  const nc = newCatById.get(c.tid)
  if (nc && nc.name !== c.name) plan.catsDiff.push({ id: c.tid, legacyName: c.name, newName: nc.name })
}

// ---------- 场所 ----------
const [legacyVenues] = await oldDb.query('SELECT * FROM changsuo')
for (const c of legacyVenues) {
  const nv = newVenueById.get(c.cid)
  if (!nv) { plan.venuesInsert.push({ cid: c.cid, name: c.name, legacy: c }); continue }
  const township = emptyToNull(c.xiangzhen) ?? '未分类'
  if (nv.name !== c.name || nv.township !== township || Number(nv.sort_order) !== (Number(c.xuhao) || 0)) {
    plan.venuesDiff.push({ id: c.cid, legacyName: c.name, newName: nv.name })
  }
}

// ---------- 管理员 ----------
const ROLE_MAP = { 1: 1, 2: 2, 3: 3, 999: 999 }
const [legacyAdmins] = await oldDb.query('SELECT * FROM admin')
const seenPhone = new Set()
for (const a of legacyAdmins) {
  if (seenPhone.has(a.name)) continue
  seenPhone.add(a.name)
  const na = newAdminByPhone.get(a.name)
  if (!na) {
    plan.adminsInsert.push({
      phone: a.name,
      name: emptyToNull(a.myname) ?? a.name,
      role_id: ROLE_MAP[a.rid] ?? 3,
      organization: emptyToNull(a.danwei),
      note: emptyToNull(a.other),
      status: [1, 200].includes(Number(a.status)) ? 1 : 0,
      all_venues: [1, 999].includes(Number(a.rid)) ? 1 : 0,
      venue_ids: JSON.stringify(parseJson(a.cids, []) ?? []),
      last_login_at: parseDT(a.last_login_time),
      legacyRid: a.rid
    })
    continue
  }
  const legacyLogin = parseDT(a.last_login_time)
  if (legacyLogin && (!na.last_login_at || legacyLogin > na.last_login_at)) {
    plan.adminsLogin.push({ id: na.id, phone: a.name, from: na.last_login_at, to: legacyLogin })
  }
  const legacyRole = ROLE_MAP[a.rid] ?? 3
  const legacyStatus = [1, 200].includes(Number(a.status)) ? 1 : 0
  if (na.role_id !== legacyRole || Number(na.status) !== legacyStatus) {
    plan.adminsDiff.push({ id: na.id, phone: a.name, field: `role ${na.role_id}→${legacyRole} / status ${na.status}→${legacyStatus}` })
  }
}

// ---------- 操作日志 ----------
const [legacyLogs] = await oldDb.query('SELECT * FROM log')
const [newLogs] = await newDb.query('SELECT admin_name, module, target, action, created_at FROM operation_logs')
const newLogSet = new Set(newLogs.map((l) => [l.admin_name, l.module, l.target, l.action, l.created_at].join('')))
const legacyAdminByAid = new Map(legacyAdmins.map((a) => [a.aid, a]))
for (const l of legacyLogs) {
  const row = {
    admin_id: newAdminByPhone.get(legacyAdminByAid.get(l.aid)?.name)?.id ?? null,
    admin_name: emptyToNull(l.name),
    module: (emptyToNull(l.page) ?? '未知').slice(0, 50),
    target: emptyToNull(String(l.mubiao ?? '').slice(0, 200)),
    action: String(l.neirong ?? '').slice(0, 100),
    ip: emptyToNull(l.ip),
    created_at: parseDT(l.time)
  }
  const key = [row.admin_name, row.module, row.target, row.action, row.created_at].join('')
  if (!newLogSet.has(key)) plan.logsInsert.push(row)
}

// ---------- 输出计划 ----------
const line = '─'.repeat(60)
console.log(line)
console.log(`账单：一致 ${billsEqual}，待更新 ${plan.billsUpdate.length}，待新增 ${plan.billsInsert.length}，冲突 ${plan.billsConflict.length}，孤儿跳过 ${plan.billsSkipOrphan.length}，异常月份跳过 ${plan.billsSkipBadMonth.length}`)
for (const b of plan.billsUpdate) console.log(`  更新 [${b.venue}] ${b.month}（${b.diff ?? '明细'}，${b.itemsDelta}）`)
for (const b of plan.billsInsert) console.log(`  新增 [${b.venue}] ${b.month}（${b.items.length} 条明细，旧 zid=${b.zid}）`)
for (const b of plan.billsConflict) console.log(`  冲突 [${b.venue}] ${b.month}：${b.reason}`)
for (const b of plan.billsSkipOrphan) console.log(`  孤儿 旧zid=${b.zid} cid=${b.cid} ${b.month}`)
console.log(line)
console.log(`人员：一致 ${personnelEqual}，待更新 ${plan.personnelUpdate.length}，冲突 ${plan.personnelConflict.length}`)
for (const p of plan.personnelUpdate) console.log(`  更新 [${p.venue}]`)
for (const p of plan.personnelConflict) console.log(`  冲突 [${p.venue}]：${p.reason}`)
console.log(`场所介绍：一致 ${profilesEqual}，待更新 ${plan.profilesUpdate.length}，冲突 ${plan.profilesConflict.length}`)
for (const p of plan.profilesUpdate) console.log(`  更新 [${p.venue}]`)
for (const p of plan.profilesConflict) console.log(`  冲突 [${p.venue}]：${p.reason}`)
console.log(`安全文章：待更新 ${plan.safetyUpdate.length}，待新增 ${plan.safetyInsert.length}，冲突 ${plan.safetyConflict.length}`)
for (const s of plan.safetyUpdate) console.log(`  更新《${s.title}》`)
for (const s of plan.safetyInsert) console.log(`  新增《${s.title}》（旧 aid=${s.aid}）`)
for (const s of plan.safetyConflict) console.log(`  冲突《${s.title}》：${s.reason}`)
console.log(`新闻：待更新 ${plan.newsUpdate.length}，待新增 ${plan.newsInsert.length}，冲突 ${plan.newsConflict.length}；分类名称差异 ${plan.catsDiff.length}`)
for (const n of plan.newsUpdate) console.log(`  更新《${n.title}》`)
for (const n of plan.newsInsert) console.log(`  新增《${n.title}》（旧 nid=${n.nid}）`)
for (const n of plan.newsConflict) console.log(`  冲突《${n.title}》：${n.reason}`)
for (const c of plan.catsDiff) console.log(`  分类#${c.id}：旧「${c.legacyName}」新「${c.newName}」（不改动）`)
console.log(`场所：待新增 ${plan.venuesInsert.length}，内容差异（仅报告）${plan.venuesDiff.length}`)
for (const v of plan.venuesInsert) console.log(`  新增 [${v.name}]（旧 cid=${v.cid}）`)
for (const v of plan.venuesDiff) console.log(`  差异#${v.id}：旧「${v.legacyName}」新「${v.newName}」（不改动）`)
console.log(`管理员：待新增 ${plan.adminsInsert.length}，登录时间待同步 ${plan.adminsLogin.length}，角色/状态差异（仅报告）${plan.adminsDiff.length}`)
for (const a of plan.adminsInsert) console.log(`  新增 ${a.phone}（${a.name}，旧 rid=${a.legacyRid}）`)
for (const a of plan.adminsDiff) console.log(`  差异 ${a.phone}：${a.field}（不改动）`)
console.log(`操作日志：旧库 ${legacyLogs.length} 条，待追加 ${plan.logsInsert.length} 条`)
console.log(line)

if (!APPLY) {
  console.log('干跑结束，未写入数据库。确认无误后加 --apply 实际执行。')
  await newDb.end(); await oldDb.end()
  process.exit(0)
}

// ---------- 实际执行 ----------
await newDb.beginTransaction()
try {
  const billIdUsed = new Set(newBills.map((b) => b.id))
  for (const b of [...plan.billsUpdate]) {
    await newDb.query(
      `UPDATE bills SET income=?, expense=?, previous_balance=?, current_balance=?, state=?, published=?,
        submitted_at=?, town_note=?, town_reviewed_at=?, county_note=?, county_reviewed_at=? WHERE id=?`,
      [b.data.income, b.data.expense, b.data.previous_balance, b.data.current_balance, b.data.state, b.data.published,
       b.data.submitted_at, b.data.town_note, b.data.town_reviewed_at, b.data.county_note, b.data.county_reviewed_at, b.id]
    )
    await newDb.query('DELETE FROM bill_items WHERE bill_id = ?', [b.id])
    for (const it of b.items) {
      const useId = !newItemIds.has(it.legacy_mid)
      await newDb.query(
        `INSERT INTO bill_items (${useId ? 'id, ' : ''}bill_id, venue_id, occurred_on, kind, summary, amount, created_at)
         VALUES (${useId ? '?, ' : ''}?, ?, ?, ?, ?, ?, ?)`,
        useId ? [it.legacy_mid, b.id, it.venue_id, it.occurred_on, it.kind, it.summary, it.amount, it.created_at]
              : [b.id, it.venue_id, it.occurred_on, it.kind, it.summary, it.amount, it.created_at]
      )
    }
  }
  for (const b of plan.billsInsert) {
    const useId = !billIdUsed.has(b.zid)
    const createdAt = `${b.data.bill_month}-01 00:00:00`
    const [res] = await newDb.query(
      `INSERT INTO bills (${useId ? 'id, ' : ''}venue_id, bill_month, income, expense, previous_balance, current_balance,
        state, published, submitted_at, town_note, town_reviewed_at, county_note, county_reviewed_at, created_at)
       VALUES (${useId ? '?, ' : ''}?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      useId ? [b.zid, b.data.venue_id, b.data.bill_month, b.data.income, b.data.expense, b.data.previous_balance, b.data.current_balance,
               b.data.state, b.data.published, b.data.submitted_at, b.data.town_note, b.data.town_reviewed_at, b.data.county_note, b.data.county_reviewed_at, createdAt]
            : [b.data.venue_id, b.data.bill_month, b.data.income, b.data.expense, b.data.previous_balance, b.data.current_balance,
               b.data.state, b.data.published, b.data.submitted_at, b.data.town_note, b.data.town_reviewed_at, b.data.county_note, b.data.county_reviewed_at, createdAt]
    )
    const billId = useId ? b.zid : res.insertId
    for (const it of b.items) {
      const useItemId = !newItemIds.has(it.legacy_mid)
      await newDb.query(
        `INSERT INTO bill_items (${useItemId ? 'id, ' : ''}bill_id, venue_id, occurred_on, kind, summary, amount, created_at)
         VALUES (${useItemId ? '?, ' : ''}?, ?, ?, ?, ?, ?, ?)`,
        useItemId ? [it.legacy_mid, billId, it.venue_id, it.occurred_on, it.kind, it.summary, it.amount, it.created_at]
                  : [billId, it.venue_id, it.occurred_on, it.kind, it.summary, it.amount, it.created_at]
      )
    }
  }
  // 结余链修复：重排所有无人动过的空草稿账单的上月结余
  const [draftBills] = await newDb.query(
    `SELECT b.id, b.venue_id, b.bill_month FROM bills b
     WHERE b.created_by IS NULL AND b.updated_by IS NULL AND b.state = 'draft'
       AND b.income = 0 AND b.expense = 0
       AND NOT EXISTS (SELECT 1 FROM bill_items bi WHERE bi.bill_id = b.id)
     ORDER BY b.venue_id, b.bill_month`
  )
  let chainFixed = 0
  for (const d of draftBills) {
    const [prev] = await newDb.query(
      `SELECT current_balance FROM bills WHERE venue_id = ? AND bill_month < ? AND id <> ? ORDER BY bill_month DESC LIMIT 1`,
      [d.venue_id, d.bill_month, d.id]
    )
    const balance = Number(prev[0]?.current_balance ?? 0)
    const [res] = await newDb.query(
      'UPDATE bills SET previous_balance = ?, current_balance = ? WHERE id = ? AND (previous_balance <> ? OR current_balance <> ?)',
      [balance, balance, d.id, balance, balance]
    )
    chainFixed += res.affectedRows ? 1 : 0
  }
  for (const p of plan.personnelUpdate) {
    await newDb.query(
      `UPDATE personnel SET members=?, state=?, published=?, submitted_at=?, town_note=?, town_reviewed_at=?, county_note=?, county_reviewed_at=? WHERE id=?`,
      [JSON.stringify(p.members), p.data.state, p.data.published, p.data.submitted_at, p.data.town_note, p.data.town_reviewed_at, p.data.county_note, p.data.county_reviewed_at, p.id]
    )
  }
  for (const p of plan.profilesUpdate) {
    await newDb.query(
      `UPDATE venue_profiles SET registration_date=?, religion=?, category=?, manager=?, phone=?, approval_authority=?,
        credit_code=?, address=?, summary=?, extra=?, state=?, published=?, submitted_at=?, town_note=?, town_reviewed_at=?, county_note=?, county_reviewed_at=? WHERE id=?`,
      [p.data.registration_date, p.data.religion, p.data.category, p.data.manager, p.data.phone, p.data.approval_authority,
       p.data.credit_code, p.data.address, p.data.summary, JSON.stringify(p.data.extra), p.data.state, p.data.published,
       p.data.submitted_at, p.data.town_note, p.data.town_reviewed_at, p.data.county_note, p.data.county_reviewed_at, p.id]
    )
  }
  for (const s of plan.safetyUpdate) {
    await newDb.query(
      `UPDATE safety_articles SET title=?, cover_url=?, content=?, author_name=?, state=?, published=?,
        submitted_at=?, town_note=?, town_reviewed_at=?, county_note=?, county_reviewed_at=? WHERE id=?`,
      [s.data.title, s.data.cover_url, s.data.content, s.data.author_name, s.data.state, s.data.published,
       s.data.submitted_at, s.data.town_note, s.data.town_reviewed_at, s.data.county_note, s.data.county_reviewed_at, s.id]
    )
    await newDb.query('DELETE FROM safety_article_venues WHERE article_id = ?', [s.id])
    for (const v of s.linkVenues) await newDb.query('INSERT IGNORE INTO safety_article_venues (article_id, venue_id) VALUES (?, ?)', [s.id, v])
  }
  for (const s of plan.safetyInsert) {
    const createdAt = parseDT(s.legacy.time) ?? new Date().toISOString().slice(0, 19).replace('T', ' ')
    await newDb.query(
      `INSERT INTO safety_articles (id, title, cover_url, content, author_name, author_role, state, published,
        submitted_at, town_note, town_reviewed_at, county_note, county_reviewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.aid, s.data.title, s.data.cover_url, s.data.content, s.data.author_name,
       ROLE_MAP[s.legacy.rid] ? { 1: 'county', 2: 'town', 3: 'venue', 999: 'super' }[s.legacy.rid] : null,
       s.data.state, s.data.published, s.data.submitted_at, s.data.town_note, s.data.town_reviewed_at,
       s.data.county_note, s.data.county_reviewed_at, createdAt, createdAt]
    )
    for (const v of s.linkVenues) await newDb.query('INSERT IGNORE INTO safety_article_venues (article_id, venue_id) VALUES (?, ?)', [s.aid, v])
  }
  for (const n of plan.newsUpdate) {
    await newDb.query(
      'UPDATE news_articles SET category_id=?, title=?, summary=?, cover_url=?, content=?, author_name=?, published=? WHERE id=?',
      [n.data.category_id, n.data.title, n.data.summary, n.data.cover_url, n.data.content, n.data.author_name, n.data.published, n.id]
    )
  }
  for (const n of plan.newsInsert) {
    const createdAt = parseDT(n.legacy.time) ?? new Date().toISOString().slice(0, 19).replace('T', ' ')
    await newDb.query(
      'INSERT INTO news_articles (id, category_id, title, summary, cover_url, content, author_name, published, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [n.nid, n.data.category_id, n.data.title, n.data.summary, n.data.cover_url, n.data.content, n.data.author_name, n.data.published, createdAt]
    )
  }
  for (const v of plan.venuesInsert) {
    await newDb.query(
      'INSERT INTO venues (id, name, township, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
      [v.cid, v.name, emptyToNull(v.legacy.xiangzhen) ?? '未分类', Number(v.legacy.xuhao) || 0, parseDT(v.legacy.time)]
    )
  }
  for (const a of plan.adminsInsert) {
    await newDb.query(
      `INSERT INTO admins (phone, name, role_id, organization, note, status, all_venues, venue_ids, notice_enabled, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [a.phone, a.name, a.role_id, a.organization, a.note, a.status, a.all_venues, a.venue_ids, a.last_login_at]
    )
  }
  for (const a of plan.adminsLogin) {
    await newDb.query('UPDATE admins SET last_login_at = ? WHERE id = ?', [a.to, a.id])
  }
  for (const l of plan.logsInsert) {
    await newDb.query(
      'INSERT INTO operation_logs (admin_id, admin_name, module, target, action, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [l.admin_id, l.admin_name, l.module, l.target, l.action, l.ip, l.created_at]
    )
  }
  await newDb.commit()
  console.log(`写入完成：账单更新 ${plan.billsUpdate.length}、新增 ${plan.billsInsert.length}；结余链修复 ${chainFixed}；人员 ${plan.personnelUpdate.length}；介绍 ${plan.profilesUpdate.length}；安全 ${plan.safetyUpdate.length}+${plan.safetyInsert.length}；新闻 ${plan.newsUpdate.length}+${plan.newsInsert.length}；场所 ${plan.venuesInsert.length}；管理员 ${plan.adminsInsert.length}；登录 ${plan.adminsLogin.length}；日志 ${plan.logsInsert.length}。`)
  if (plan.personnelUpdate.length) {
    console.log('提醒：人员名册已用旧库照片地址覆盖，请重跑 node --env-file=.env scripts/migrate-personnel-images.mjs --apply 转存 OSS。')
  }
} catch (error) {
  await newDb.rollback()
  console.error('写入失败，已回滚：', error.message)
  process.exitCode = 1
}

await newDb.end()
await oldDb.end()
