import { readObject } from '../../utils/oss'

const POSTER_BACKGROUND_KEY = 'msgk/assets/venue-poster-background.png'

export default defineEventHandler(async (event) => {
  try {
    const image = await readObject(POSTER_BACKGROUND_KEY)
    setResponseHeaders(event, {
      'Content-Type': image.contentType,
      'Content-Length': String(image.data.byteLength),
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff'
    })
    return image.data
  } catch {
    throw createError({ statusCode: 503, message: '海报底图暂时无法读取，请稍后重试' })
  }
})
