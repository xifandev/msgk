interface WechatError {
  errcode?: number
  errmsg?: string
}

interface AccessTokenResponse extends WechatError {
  access_token?: string
  expires_in?: number
}

let cachedAccessToken: { value: string, expiresAt: number } | null = null
let accessTokenRequest: Promise<string> | null = null

async function requestAccessToken(): Promise<string> {
  const config = useRuntimeConfig()
  if (!config.wxaAppId || !config.wxaAppSecret) {
    throw createError({ statusCode: 503, message: '微信小程序 AppID 或 AppSecret 尚未配置' })
  }

  const params = new URLSearchParams({
    grant_type: 'client_credential',
    appid: config.wxaAppId,
    secret: config.wxaAppSecret
  })
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?${params}`, {
    signal: AbortSignal.timeout(10000)
  })
  const data = await response.json() as AccessTokenResponse
  if (!response.ok || !data.access_token) {
    throw createError({ statusCode: 502, message: `微信访问凭证获取失败${data.errcode ? `（${data.errcode}）` : ''}` })
  }

  cachedAccessToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max((Number(data.expires_in) || 7200) - 300, 300) * 1000
  }
  return data.access_token
}

function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return Promise.resolve(cachedAccessToken.value)
  }
  if (!accessTokenRequest) {
    accessTokenRequest = requestAccessToken().finally(() => {
      accessTokenRequest = null
    })
  }
  return accessTokenRequest
}

export async function createVenueQrCode(venueId: number) {
  const accessToken = await getAccessToken()
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/wxaapp/createwxaqrcode?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: `pages/index/index?cid=${venueId}`, width: 1280 }),
    signal: AbortSignal.timeout(15000)
  })
  const contentType = response.headers.get('content-type')?.split(';')[0] || ''
  const buffer = await response.arrayBuffer()

  if (!response.ok || !contentType.startsWith('image/') || buffer.byteLength === 0) {
    let error: WechatError = {}
    try {
      error = JSON.parse(new TextDecoder().decode(buffer)) as WechatError
    } catch {}
    if (error.errcode === 40001 || error.errcode === 42001) cachedAccessToken = null
    throw createError({ statusCode: 502, message: `微信二维码生成失败${error.errcode ? `（${error.errcode}）` : ''}` })
  }

  return { data: new Uint8Array(buffer), contentType }
}
