import type { H3Event } from 'h3'
import type { AdminContext } from './auth'
import { execute } from './db'

export async function logAction(admin: AdminContext, module: string, target: string, action: string, event?: H3Event) {
  const ip = event ? getRequestIP(event, { xForwardedFor: true }) ?? '' : ''
  await execute(
    'INSERT INTO operation_logs (admin_id, admin_name, module, target, action, ip) VALUES (?, ?, ?, ?, ?, ?)',
    [admin.id, admin.name, module, target, action, ip]
  )
}
