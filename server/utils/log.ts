import type { H3Event } from 'h3'
import type { AdminContext } from './auth'
import { execute } from './db'

// 日志只保留 180 天，每天最多清理一次
const RETENTION_DAYS = 180
let lastCleanup = 0

export async function logAction(admin: AdminContext, module: string, target: string, action: string, event?: H3Event) {
  const ip = event ? getRequestIP(event, { xForwardedFor: true }) ?? '' : ''
  await execute(
    'INSERT INTO operation_logs (admin_id, admin_name, module, target, action, ip) VALUES (?, ?, ?, ?, ?, ?)',
    [admin.id, admin.name, module, target, action, ip]
  )
  if (Date.now() - lastCleanup > 24 * 60 * 60 * 1000) {
    lastCleanup = Date.now()
    await execute(`DELETE FROM operation_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ${RETENTION_DAYS} DAY)`)
  }
}
