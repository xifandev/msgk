export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'system:logs')
  if (admin.roleCode !== 'super') {
    throw createError({ statusCode: 403, message: '操作日志仅系统管理员可查看' })
  }
  const { page, pageSize, offset, search } = pageParams(event)
  const where = ['1 = 1']
  const params: unknown[] = []
  if (search) {
    where.push('(module LIKE ? OR target LIKE ? OR action LIKE ? OR admin_name LIKE ?)')
    params.push(...Array(4).fill(`%${search}%`))
  }
  const condition = where.join(' AND ')
  const total = await queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM operation_logs WHERE ${condition}`, params)
  const list = await query(`SELECT * FROM operation_logs WHERE ${condition} ORDER BY id DESC LIMIT ${pageSize} OFFSET ${offset}`, params)
  return { list, total: Number(total?.count ?? 0), page, pageSize }
})
