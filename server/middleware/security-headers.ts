// 全局安全响应头：正常响应此前缺少基础安全头（仅错误响应由 error-handler 设置）
export default defineEventHandler((event) => {
  if (event.path.startsWith('/api/')) {
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
    return
  }
  setResponseHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer'
  })
})
