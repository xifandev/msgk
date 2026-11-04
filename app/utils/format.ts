/** 日期时间展示：YYYY-MM-DD HH:mm，空值或非法值返回 —。 */
export function formatDateTime(value: unknown): string {
  if (!value) return '—'
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 金额展示：¥ + 千分位 + 两位小数，如 ¥1,234.56。 */
export function formatMoney(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
