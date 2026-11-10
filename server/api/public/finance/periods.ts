// 账期列表：小程序"选择月份 / 选择年份"弹窗的数据源
// 只返回月份与该月是否已公开，不返回任何金额、明细、审核备注，避免未公开账期的数据外泄
// - published：审核通过且对外公开
// - filling：后台已建账但尚未公开（填报/审核中），小程序侧只做"填报中"占位，不可点选
// 两种情况都只到当前月份为止，未来月份既不公开也不出现在列表里
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = positiveId(input.venueId, '场所ID')

  const rows = await query<{ bill_month: string, state: string, published: number | string }>(
    `SELECT bill_month, state, published FROM bills
     WHERE venue_id = ? AND bill_month <= DATE_FORMAT(NOW(), '%Y-%m')
     ORDER BY bill_month DESC`,
    [venueId]
  )

  const periods = rows.map(row => ({
    month: row.bill_month,
    status: row.state === 'approved' && Number(row.published) === 1 ? 'published' : 'filling'
  }))

  return { venueId, periods }
})
