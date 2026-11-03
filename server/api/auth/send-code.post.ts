import { createHmac, randomInt } from 'node:crypto'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  checkRateLimit(`sms:${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}`, 10, 60 * 60 * 1000)
  const body = await readBody(event)
  const phone = String(body.phone ?? '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone)) throw createError({ statusCode: 400, message: '手机号格式不正确' })
  const secret = useRuntimeConfig().authSecret
  if (!secret) throw createError({ statusCode: 500, message: '登录配置不完整' })

  const created = await withTransaction(async (conn) => {
    const [adminRows] = await conn.query('SELECT id FROM admins WHERE phone = ? AND status = 1 FOR UPDATE', [phone])
    if (!(adminRows as unknown[]).length) return null
    const [recentRows] = await conn.query('SELECT id FROM login_codes WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)', [phone])
    if ((recentRows as unknown[]).length) throw createError({ statusCode: 429, message: '验证码已发送，请60秒后重试' })
    const code = String(randomInt(0, 1000000)).padStart(6, '0')
    const hash = createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex')
    const [result] = await conn.execute(
      'INSERT INTO login_codes (phone, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))',
      [phone, hash]
    )
    return { id: (result as any).insertId as number, code }
  })

  if (!created) return { ok: true, cooldown: 60, message: '如果账号已开通，验证码将发送到该手机号' }
  try {
    await sendSmsCode(phone, created.code)
  } catch (error) {
    await execute('DELETE FROM login_codes WHERE id = ?', [created.id])
    throw error
  }
  await execute('DELETE FROM login_codes WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY) OR used_at < DATE_SUB(NOW(), INTERVAL 1 DAY)')
  const response: Record<string, unknown> = { ok: true, cooldown: 60, message: '如果账号已开通，验证码将发送到该手机号' }
  if (useRuntimeConfig().smsMock === '1') response.devCode = created.code
  return response
})
