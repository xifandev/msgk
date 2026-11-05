// 场所安全模块迁移：仅县级可发布（镇级/场所只读），取消层级审核。
//
// 用法（在项目根目录执行）：
//   干跑（默认，只打印将要执行的变更，不写库）：
//     node --env-file=.env scripts/migrate-safety-county-only.mjs
//   实际执行：
//     node --env-file=.env scripts/migrate-safety-county-only.mjs --apply
//
// 内容：
// 1. 角色权限调整（保留角色已有其他自定义权限）：
//    - town / venue：仅保留 safety:view，移除 safety:edit / safety:delete / safety:review / safety:publish。
//    - county：移除 safety:review（场所安全不再审核）。
// 2. 存量文章：state 一律置为 approved（审核流程已取消，公开与否由 published 决定）。

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

const WRITE_PERMS = ['safety:edit', 'safety:delete', 'safety:review', 'safety:publish']

// 1. 角色权限调整
const [roleRows] = await db.query(`SELECT id, code, permissions FROM roles WHERE code IN ('county', 'town', 'venue')`)
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
  const removable = role.code === 'county' ? ['safety:review'] : WRITE_PERMS
  const removed = permissions.filter((p) => removable.includes(p))
  if (!removed.length) {
    console.log(`角色 ${role.code}：无需调整`)
    continue
  }
  const next = permissions.filter((p) => !removable.includes(p))
  console.log(`角色 ${role.code}：将移除 ${removed.join('、')}`)
  if (APPLY) {
    await db.query('UPDATE roles SET permissions = ? WHERE id = ?', [JSON.stringify(next), role.id])
  }
}

// 2. 存量文章置为已通过
// 注意：updated_at 带 ON UPDATE CURRENT_TIMESTAMP，必须显式写 updated_at = updated_at，
// 否则整表更新会把所有文章的编辑时间刷成执行时刻。
const [pending] = await db.query(`SELECT COUNT(*) AS c FROM safety_articles WHERE state <> 'approved'`)
if (pending[0].c > 0) {
  console.log(`将把 ${pending[0].c} 篇非 approved 状态的存量文章置为 approved（审核流程已取消，不改动 updated_at）`)
  if (APPLY) {
    const [result] = await db.query(
      `UPDATE safety_articles SET state = 'approved', updated_at = updated_at WHERE state <> 'approved'`
    )
    console.log(`已更新 ${result.affectedRows} 行`)
  }
} else {
  console.log('跳过：没有需要调整状态的存量文章')
}

// 3. 可选修复：把被误刷的 updated_at 还原为发布时间（created_at）
// 仅当确知编辑时间被整表更新污染时使用。
const REPAIR = process.argv.includes('--repair-updated-at')
if (REPAIR) {
  const [stale] = await db.query(
    `SELECT COUNT(*) AS c FROM safety_articles WHERE updated_at > created_at`
  )
  console.log(`将把 ${stale[0].c} 篇文章的 updated_at 还原为 created_at（发布时间）`)
  if (APPLY) {
    const [result] = await db.query(
      `UPDATE safety_articles SET updated_at = created_at WHERE updated_at > created_at`
    )
    console.log(`已更新 ${result.affectedRows} 行`)
  }
}

console.log(APPLY ? '\n迁移完成。' : '\n干跑结束（未写库）。加 --apply 参数执行。')
await db.end()
