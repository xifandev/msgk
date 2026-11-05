import type { H3Event } from 'h3'
import sanitizeHtml from 'sanitize-html'

export function positiveId(value: unknown, name = 'ID'): number {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: `${name}格式不正确` })
  }
  return id
}

export function text(value: unknown, name: string, max = 200, required = true): string {
  const result = String(value ?? '').trim()
  if (required && !result) throw createError({ statusCode: 400, message: `请填写${name}` })
  if (result.length > max) throw createError({ statusCode: 400, message: `${name}不能超过${max}个字符` })
  return result
}

export function money(value: unknown): string {
  const result = String(value ?? '').trim()
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(result)) {
    throw createError({ statusCode: 400, message: '金额必须是非负数字，最多两位小数' })
  }
  return Number(result).toFixed(2)
}

export function pageParams(event: H3Event) {
  const input = getQuery(event)
  const page = Math.max(1, Number(input.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize) || 10))
  return { page, pageSize, offset: (page - 1) * pageSize, search: String(input.search ?? '').trim() }
}

function firstHeaderValue(value: unknown): string {
  return String(value ?? '').split(',')[0]!.trim()
}

// 反向代理下协议由 Nginx/CDN 决定，服务端只可靠拿到 Host，因此按主机名比对
function normalizeHost(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/:(?:80|443)$/, '')
}

function requestHosts(event: H3Event): string[] {
  const hosts = [
    firstHeaderValue(getHeader(event, 'x-forwarded-host')),
    firstHeaderValue(getHeader(event, 'host'))
  ].map(normalizeHost).filter(Boolean)
  return [...new Set(hosts)]
}

export function assertSameOrigin(event: H3Event) {
  const method = event.method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return
  const fetchSite = String(getHeader(event, 'sec-fetch-site') ?? '')
  if (fetchSite === 'cross-site') throw createError({ statusCode: 403, message: '拒绝跨站请求' })
  const origin = getHeader(event, 'origin')
  if (!origin || origin === 'null') return
  let originHost = ''
  try {
    originHost = normalizeHost(new URL(origin).host)
  } catch {
    throw createError({ statusCode: 403, message: '请求来源不正确' })
  }
  if (!originHost || !requestHosts(event).includes(originHost)) {
    throw createError({ statusCode: 403, message: '请求来源不正确' })
  }
}

export function cleanRichText(value: unknown): string {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan']
    },
    allowedSchemes: ['https'],
    transformTags: {
      a: (_tagName, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer' } })
    }
  })
}
