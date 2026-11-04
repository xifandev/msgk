/** 金额展示：¥ + 千分位 + 两位小数，如 ¥1,234.56。 */
export function formatMoney(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
