import type { H3Error, H3Event } from 'h3'
import { getRequestHeader, send, setResponseHeader, setResponseHeaders, setResponseStatus } from 'h3'

// 自定义错误处理：响应中永不携带 stack，避免泄露服务器目录结构
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export default function errorHandler(error: H3Error, event: H3Event) {
  const statusCode = error.statusCode || 500
  const statusMessage = error.statusMessage || 'Server Error'
  const message = error.message || statusMessage
  if (error.unhandled || error.fatal || statusCode >= 500) {
    console.error('[request error]', error.stack || error.message)
  }
  setResponseHeaders(event, {
    'Content-Security-Policy': "script-src 'none'; frame-ancestors 'none';",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer'
  })
  if (statusCode === 404) setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseStatus(event, statusCode, statusMessage)

  const accept = String(getRequestHeader(event, 'accept') ?? '')
  if (accept.includes('application/json') || event.path.startsWith('/api')) {
    setResponseHeader(event, 'Content-Type', 'application/json')
    return send(event, JSON.stringify({ url: event.path, statusCode, statusMessage, message }))
  }
  setResponseHeader(event, 'Content-Type', 'text/html')
  const safeMessage = escapeHtml(message)
  const safeStatusMessage = escapeHtml(statusMessage)
  return send(event, `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${statusCode} ${safeStatusMessage}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; background: #f4f7fb; color: #10305a; }
    main { max-width: 420px; padding: 40px; text-align: center; }
    h1 { margin: 0; font-size: 48px; }
    p { margin: 16px 0 28px; color: #52688a; }
    a { color: #1a63b0; }
  </style>
</head>
<body>
  <main>
    <h1>${statusCode}</h1>
    <p>${safeMessage}</p>
    <a href="/">返回首页</a>
  </main>
</body>
</html>`)
}
