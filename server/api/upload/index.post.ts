export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'dashboard:view')
  checkRateLimit(`upload:${admin.id}`, 30, 10 * 60 * 1000)
  const parts = await readMultipartFormData(event)
  const file = parts?.find((part) => part.name === 'file')
  if (!file?.data?.length) throw createError({ statusCode: 400, message: '请选择图片' })
  const contentType = (file.type ?? '').toLowerCase()
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
  const extension = extensions[contentType]
  if (!extension || file.data.length > 5 * 1024 * 1024) {
    throw createError({ statusCode: 400, message: '仅支持5MB以内的 JPG、PNG、WebP、GIF 图片' })
  }
  const result = await uploadImage(file.data, contentType, extension)
  await logAction(admin, '文件上传', result.key, `上传图片，${file.data.length}字节`, event)
  return result
})
