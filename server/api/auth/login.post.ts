import { createHmac, timingSafeEqual } from 'node:crypto'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const body = await readBody(event)
  const phone = String(body.phone ?? '').trim()
  const code = String(body.code ?? '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) {
    throw createError({ statusCode: 400, message: '手机号或验证码格式不正确' })
  }
  const record = await queryOne<{ id: number, code_hash: string, attempts: number }>(
    `SELECT id, code_hash, attempts FROM login_codes
     WHERE phone = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [phone]
  )
  if (!record || record.attempts >= 5) throw createError({ statusCode: 401, message: '验证码已失效，请重新获取' })
  const secret = useRuntimeConfig().authSecret
  const expected = createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex')
  const valid = timingSafeEqual(Buffer.from(expected), Buffer.from(record.code_hash))
  if (!valid) {
    await execute('UPDATE login_codes SET attempts = attempts + 1, used_at = IF(attempts >= 4, NOW(), used_at) WHERE id = ?', [record.id])
    throw createError({ statusCode: 401, message: '验证码错误' })
  }
  const adminRow = await queryOne<{ id: number }>('SELECT id FROM admins WHERE phone = ? AND status = 1', [phone])
  if (!adminRow) throw createError({ statusCode: 403, message: '账号不存在或已停用' })
  await execute('UPDATE login_codes SET used_at = NOW() WHERE phone = ? AND used_at IS NULL', [phone])
  await execute('DELETE FROM login_codes WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY) OR used_at < DATE_SUB(NOW(), INTERVAL 1 DAY)')
  await execute('UPDATE admins SET last_login_at = NOW() WHERE id = ?', [adminRow.id])
  setAuthCookie(event, await signAuthToken(adminRow.id))
  const admin = await loadAdmin(adminRow.id)
  if (!admin) throw createError({ statusCode: 403, message: '账号不存在或已停用' })
  return { admin, redirect: '/dashboard' }
})
