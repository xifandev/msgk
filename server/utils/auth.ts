import { SignJWT, jwtVerify } from 'jose'
import type { H3Event } from 'h3'
import { parseJson, queryOne } from './db'
import { assertSameOrigin } from './http'

export const AUTH_COOKIE = 'msgk_token'
const COOKIE_MAX_AGE = 12 * 60 * 60

export interface AdminContext {
  id: number
  phone: string
  name: string
  roleId: number
  roleName: string
  roleCode: string
  permissions: string[]
  venueIds: number[]
  allVenues: boolean
  organization: string | null
  noticeEnabled: boolean
}

interface AdminRow {
  id: number
  phone: string
  name: string
  role_id: number
  role_name: string | null
  role_code: string | null
  permissions: unknown
  venue_ids: unknown
  all_venues: number
  organization: string | null
  notice_enabled: number
}

function secretKey() {
  const secret = useRuntimeConfig().authSecret
  if (!secret || secret.length < 32) {
    throw createError({ statusCode: 500, message: 'NITRO_AUTH_SECRET 未配置或长度不足' })
  }
  return new TextEncoder().encode(secret)
}

export async function signAuthToken(adminId: number, impersonatorId?: number) {
  const payload: Record<string, unknown> = { aid: adminId }
  if (impersonatorId && impersonatorId !== adminId) payload.imp = impersonatorId
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(secretKey())
}

export async function readAuthPayload(event: H3Event): Promise<{ aid: number, imp?: number } | null> {
  const token = getCookie(event, AUTH_COOKIE)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey())
    const aid = Number(payload.aid)
    if (!Number.isSafeInteger(aid) || aid <= 0) return null
    const imp = payload.imp ? Number(payload.imp) : undefined
    return { aid, imp: imp !== undefined && Number.isSafeInteger(imp) && imp > 0 ? imp : undefined }
  } catch {
    return null
  }
}

export function setAuthCookie(event: H3Event, token: string) {
  setCookie(event, AUTH_COOKIE, token, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE
  })
}

export function clearAuthCookie(event: H3Event) {
  deleteCookie(event, AUTH_COOKIE, { path: '/' })
}

export async function loadAdmin(id: number): Promise<AdminContext | null> {
  const row = await queryOne<AdminRow>(
    `SELECT a.id, a.phone, a.name, a.role_id, r.name AS role_name,
            r.code AS role_code, r.permissions, a.venue_ids, a.all_venues, a.organization, a.notice_enabled
     FROM admins a LEFT JOIN roles r ON r.id = a.role_id
     WHERE a.id = ? AND a.status = 1`,
    [id]
  )
  if (!row) return null
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    roleId: row.role_id,
    roleName: row.role_name ?? '',
    roleCode: row.role_code ?? '',
    permissions: parseJson<string[]>(row.permissions, []),
    venueIds: parseJson<unknown[]>(row.venue_ids, []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0),
    allVenues: row.all_venues === 1,
    organization: row.organization,
    noticeEnabled: row.notice_enabled === 1
  }
}

export async function requireAuth(event: H3Event): Promise<AdminContext> {
  const token = getCookie(event, AUTH_COOKIE)
  if (!token) throw createError({ statusCode: 401, message: '请先登录' })
  try {
    const { payload } = await jwtVerify(token, secretKey())
    const admin = await loadAdmin(Number(payload.aid))
    if (!admin) throw new Error('inactive')
    return admin
  } catch {
    throw createError({ statusCode: 401, message: '登录已失效，请重新登录' })
  }
}

export function hasPermission(admin: AdminContext, code: string) {
  return admin.permissions.includes('*') || admin.permissions.includes(code)
}

export async function requirePermission(event: H3Event, code: string): Promise<AdminContext> {
  assertSameOrigin(event)
  const admin = await requireAuth(event)
  if (!hasPermission(admin, code)) throw createError({ statusCode: 403, message: '没有该操作的权限' })
  return admin
}

export function requireVenueScope(admin: AdminContext, venueId: number) {
  if (admin.allVenues || admin.venueIds.includes(venueId)) return
  throw createError({ statusCode: 403, message: '该场所不在你的数据权限范围内' })
}

export function venueScope(admin: AdminContext, column = 'venue_id') {
  if (admin.allVenues) return { sql: '1 = 1', params: [] as number[] }
  if (admin.venueIds.length === 0) return { sql: '1 = 0', params: [] as number[] }
  return {
    sql: `${column} IN (${admin.venueIds.map(() => '?').join(',')})`,
    params: admin.venueIds
  }
}
