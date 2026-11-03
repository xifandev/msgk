const buckets = new Map<string, { count: number, resetAt: number }>()

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  if (current.count >= limit) throw createError({ statusCode: 429, message: '操作过于频繁，请稍后再试' })
  current.count++
  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey)
  }
}
