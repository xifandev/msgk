import OSS from 'ali-oss'

let client: OSS | null = null

function getClient() {
  const config = useRuntimeConfig()
  if (!config.ossBucket || !config.ossRegion || !config.aliyunAccessKeyId || !config.aliyunAccessKeySecret) {
    throw createError({ statusCode: 500, message: 'OSS 配置不完整' })
  }
  if (!client) {
    client = new OSS({
      bucket: config.ossBucket,
      region: config.ossRegion,
      accessKeyId: config.aliyunAccessKeyId,
      accessKeySecret: config.aliyunAccessKeySecret,
      secure: true
    })
  }
  return client
}

export async function uploadImage(buffer: Buffer, contentType: string, extension: string) {
  const key = `msgk/images/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`
  await getClient().put(key, buffer, { headers: { 'Content-Type': contentType } })
  const config = useRuntimeConfig()
  return { key, url: `https://${config.ossBucket}.${config.ossRegion}.aliyuncs.com/${key}` }
}

export async function readObject(key: string) {
  const result = await getClient().get(key)
  const headers = result.res.headers as Record<string, string | undefined>
  return {
    data: result.content,
    contentType: String(headers['content-type'] || 'application/octet-stream')
  }
}
