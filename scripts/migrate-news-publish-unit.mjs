// 政策法规迁移：news_articles 增加“发布单位”字段并回填。
//
// 用法（在项目根目录执行）：
//   干跑（默认，只打印将要执行的变更，不写库）：
//     node --env-file=.env scripts/migrate-news-publish-unit.mjs
//   实际执行：
//     node --env-file=.env scripts/migrate-news-publish-unit.mjs --apply
//
// 内容：
// 1. news_articles 增加 publish_unit VARCHAR(100)（幂等：已存在则跳过）。
// 2. 回填存量文章的 publish_unit，按优先级取：
//    创建人 organization → 场所管理员回退其首个场所名 → 县级管理员最常用的 organization（历史迁移数据无创建人）。

import mysql from 'mysql2/promise'

const APPLY = process.argv.includes('--apply')

const env = (key) => process.env[key] || ''
const required = ['NITRO_DB_HOST', 'NITRO_DB_NAME', 'NITRO_DB_USER']
const missing = required.filter((k) => !env(k))
if (missing.length) {
  console.error(`环境变量缺失：${missing.join('、')}（请确认 .env 已填写并用 --env-file=.env 运行）`)
  process.exit(1)
}

const db = await mysql.createConnection({
  host: env('NITRO_DB_HOST'),
  port: Number(env('NITRO_DB_PORT') || 3306),
  user: env('NITRO_DB_USER'),
  password: env('NITRO_DB_PASSWORD'),
  database: env('NITRO_DB_NAME'),
  charset: 'utf8mb4',
  multipleStatements: false
})

// 1. 加列
const [columns] = await db.query(
  `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news_articles' AND COLUMN_NAME = 'publish_unit'`
)
const hasColumn = columns[0].c > 0
if (!hasColumn) {
  console.log('将执行：ALTER TABLE news_articles ADD COLUMN publish_unit VARCHAR(100) NULL AFTER author_name')
  if (APPLY) await db.query('ALTER TABLE news_articles ADD COLUMN publish_unit VARCHAR(100) NULL AFTER author_name')
} else {
  console.log('跳过：publish_unit 列已存在')
}

// 2. 回填发布单位
// 政策法规只能由县级发布，历史迁移数据没有 created_by，统一回退到县级管理员最常用的单位。
const [countyUnits] = await db.query(
  `SELECT a.organization AS unit, COUNT(*) AS c
   FROM admins a JOIN roles r ON r.id = a.role_id
   WHERE r.code = 'county' AND TRIM(COALESCE(a.organization, '')) <> ''
   GROUP BY a.organization
   ORDER BY c DESC
   LIMIT 1`
)
const defaultUnit = countyUnits[0]?.unit ?? null
console.log(defaultUnit ? `县级默认发布单位：${defaultUnit}` : '未找到县级管理员的单位，仅按创建人回填')

const pendingFilter = hasColumn ? "(a.publish_unit IS NULL OR a.publish_unit = '')" : '1 = 1'
const [pending] = await db.query(`SELECT COUNT(*) AS c FROM news_articles a WHERE ${pendingFilter}`)
const backfillCount = pending[0].c
const backfillSql = `
  UPDATE news_articles a
  LEFT JOIN admins m ON m.id = a.created_by
  LEFT JOIN roles r ON r.id = m.role_id
  SET a.publish_unit = COALESCE(
    NULLIF(TRIM(m.organization), ''),
    CASE WHEN r.code = 'venue' THEN (
      SELECT v.name FROM venues v
      WHERE v.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(m.venue_ids, '$[0]')) AS UNSIGNED)
    ) END,
    ?
  )
  WHERE a.publish_unit IS NULL OR a.publish_unit = ''`
if (backfillCount > 0) {
  console.log(`将回填 ${backfillCount} 篇文章的发布单位`)
  if (APPLY) {
    const [result] = await db.query(backfillSql, [defaultUnit])
    console.log(`已回填 ${result.affectedRows} 行`)
  }
} else {
  console.log('跳过：没有需要回填发布单位的文章')
}

console.log(APPLY ? '\n迁移完成。' : '\n干跑结束（未写库）。加 --apply 参数执行。')
await db.end()
