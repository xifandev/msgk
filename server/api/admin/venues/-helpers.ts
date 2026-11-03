import type { AdminContext } from '../../../utils/auth'
import { requireVenueScope } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'
import { text } from '../../../utils/http'

export function optionalUrl(value: unknown, name: string): string | null {
  const result = String(value ?? '').trim()
  if (!result) return null
  if (result.length > 500) throw createError({ statusCode: 400, message: `${name}不能超过500个字符` })
  if (!/^https:\/\/\S+$/.test(result)) throw createError({ statusCode: 400, message: `${name}必须是 https 链接` })
  return result
}

export function optionalDate(value: unknown, name: string): string | null {
  const result = String(value ?? '').trim()
  if (!result) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw createError({ statusCode: 400, message: `${name}格式应为 YYYY-MM-DD` })
  return result
}

export function intOrDefault(value: unknown, name: string, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  if (!Number.isSafeInteger(num)) throw createError({ statusCode: 400, message: `${name}必须是整数` })
  return num
}

export async function requireScopedVenue(admin: AdminContext, venueId: number) {
  requireVenueScope(admin, venueId)
  const venue = await queryOne<{ id: number; name: string }>('SELECT id, name FROM venues WHERE id = ?', [venueId])
  if (!venue) throw createError({ statusCode: 404, message: '场所不存在' })
  return venue
}

export interface PersonnelMember {
  sort: number
  imageUrl: string | null
  name: string
  gender: string
  clergy: string
  position: string
  phone: string
}

export function sanitizeMembers(input: unknown): PersonnelMember[] {
  if (!Array.isArray(input)) throw createError({ statusCode: 400, message: '成员列表格式不正确' })
  if (input.length > 100) throw createError({ statusCode: 400, message: '成员数量不能超过100人' })
  const members = input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw createError({ statusCode: 400, message: `第${index + 1}个成员格式不正确` })
    }
    const item = raw as Record<string, unknown>
    return {
      name: text(item.name, `第${index + 1}个成员的姓名`, 50),
      gender: text(item.gender, '性别', 20, false),
      clergy: text(item.clergy, '教职', 50, false),
      position: text(item.position, '职务', 100, false),
      phone: text(item.phone, '联系电话', 30, false),
      imageUrl: optionalUrl(item.imageUrl, '照片链接'),
      sort: intOrDefault(item.sort, '排序值')
    }
  })
  members.sort((a, b) => a.sort - b.sort)
  members.forEach((member, index) => {
    member.sort = index + 1
  })
  return members
}
