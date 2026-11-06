/** 日期时间展示：YYYY-MM-DD HH:mm，空值或非法值返回 —。 */
export function formatDateTime(value: unknown): string {
  if (!value) return '—'
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 审核时间展示：旧系统迁移数据的时分秒均为 00:00:00（当日具体时间未知），
 * 此时只显示 YYYY-MM-DD；新系统的精确时间仍显示 YYYY-MM-DD HH:mm。
 */
export function formatReviewTime(value: unknown): string {
  if (!value) return '—'
  const raw = String(value)
  const date = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (num: number) => String(num).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) return day
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 金额展示：千分位 + 两位小数，如 1,234.56。 */
export function formatMoney(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 支出金额展示：使用负号，如 -360.00；零值不带负号，非法值仍返回 —。 */
export function formatExpense(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  const abs = Math.abs(num)
  if (abs === 0) return formatMoney(0)
  return `-${formatMoney(abs)}`
}
