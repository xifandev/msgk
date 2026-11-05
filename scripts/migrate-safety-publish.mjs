// 场所安全模块迁移：新增发布单位字段 + 角色权限调整（镇级仅查看、场所可发布）。
//
// 用法（在项目根目录执行）：
//   干跑（默认，只打印将要执行的变更，不写库）：
//     node --env-file=.env scripts/migrate-safety-publish.mjs
//   实际执行：
//     node --env-file=.env scripts/migrate-safety-publish.mjs --apply
//
// 内容：
// 1. safety_articles 增加 publish_unit VARCHAR(100)（幂等：已存在则跳过）。
// 2. 回填存量文章的 publish_unit：取创建人 organization，为空且创建人是场所管理员时回退其首个场所名。
// 3. 角色权限调整（保留角色已有其他自定义权限）：
//    - town：移除 safety:review、safety:publish（镇级仅查看）。
//    - venue：追加 safety:publish（场所可发布）。

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
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'safety_articles' AND COLUMN_NAME = 'publish_unit'`
)
const hasColumn = columns[0].c > 0
if (!hasColumn) {
  console.log('将执行：ALTER TABLE safety_articles ADD COLUMN publish_unit VARCHAR(100) NULL AFTER author_role')
  if (APPLY) await db.query('ALTER TABLE safety_articles ADD COLUMN publish_unit VARCHAR(100) NULL AFTER author_role')
} else {
  console.log('跳过：publish_unit 列已存在')
}

// 2. 回填发布单位（列尚不存在时按创建人条件统计， ALTER 之后全部回填）
const pendingFilter = hasColumn
  ? "(a.publish_unit IS NULL OR a.publish_unit = '')"
  : '1 = 1'
const [pending] = await db.query(
  `SELECT COUNT(*) AS c FROM safety_articles a
   LEFT JOIN admins m ON m.id = a.created_by
   WHERE ${pendingFilter}
     AND (TRIM(COALESCE(m.organization, '')) <> '' OR EXISTS (
       SELECT 1 FROM roles r WHERE r.id = m.role_id AND r.code = 'venue'
     ))`
)
const backfillCount = pending[0].c
const backfillSql = `
  UPDATE safety_articles a
  LEFT JOIN admins m ON m.id = a.created_by
  LEFT JOIN roles r ON r.id = m.role_id
  SET a.publish_unit = COALESCE(
    NULLIF(TRIM(m.organization), ''),
    CASE WHEN r.code = 'venue' THEN (
      SELECT v.name FROM venues v
      WHERE v.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(m.venue_ids, '$[0]')) AS UNSIGNED)
    ) END
  )
  WHERE a.publish_unit IS NULL OR a.publish_unit = ''`
if (backfillCount > 0) {
  console.log(`将回填 ${backfillCount} 篇文章的发布单位（创建人所属单位，场所管理员回退场所名）`)
  if (APPLY) {
    const [result] = await db.query(backfillSql)
    console.log(`已回填 ${result.affectedRows} 行`)
  }
} else {
  console.log('跳过：没有需要回填发布单位的文章')
}

// 3. 角色权限调整
const [roleRows] = await db.query(`SELECT id, code, permissions FROM roles WHERE code IN ('town', 'venue')`)
for (const role of roleRows) {
  let permissions
  if (typeof role.permissions === 'string') {
    try {
      permissions = JSON.parse(role.permissions)
    } catch {
      console.error(`角色 ${role.code} 的 permissions 不是合法 JSON，请人工处理（id=${role.id}）`)
      process.exit(1)
    }
  } else {
    permissions = role.permissions
  }
  if (!Array.isArray(permissions)) {
    console.error(`角色 ${role.code} 的 permissions 不是数组，请人工处理（id=${role.id}）`)
    process.exit(1)
  }
  let next
  if (role.code === 'town') {
    const removed = permissions.filter((p) => p === 'safety:review' || p === 'safety:publish')
    next = permissions.filter((p) => p !== 'safety:review' && p !== 'safety:publish')
    if (removed.length) {
      console.log(`角色 town：将移除 ${removed.join('、')}（镇级仅查看）`)
    } else {
      console.log('角色 town：无需调整（已不含 safety:review / safety:publish）')
      continue
    }
  } else {
    if (permissions.includes('safety:publish')) {
      console.log('角色 venue：无需调整（已含 safety:publish）')
      continue
    }
    next = [...permissions, 'safety:publish']
    console.log('角色 venue：将追加 safety:publish（场所可发布）')
  }
  if (APPLY) {
    await db.query('UPDATE roles SET permissions = ? WHERE id = ?', [JSON.stringify(next), role.id])
  }
}

console.log(APPLY ? '\n迁移完成。' : '\n干跑结束（未写库）。加 --apply 参数执行。')
await db.end()
