// 已公开账期：小程序"选择月份 / 选择年份"弹窗的数据源
// 只返回审核通过、已对外公开且不晚于当前月份的账单，未公开账期的存在与状态也不下发
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = positiveId(input.venueId, '场所ID')

  const rows = await query<{ bill_month: string }>(
    `SELECT bill_month FROM bills
     WHERE venue_id = ? AND state = 'approved' AND published = 1
       AND bill_month <= DATE_FORMAT(NOW(), '%Y-%m')
     ORDER BY bill_month DESC`,
    [venueId]
  )

  const periods = rows.map(row => ({ month: row.bill_month, status: 'published' }))
  // months 仅为兼容已发布的小程序版本（旧版只认已公开月份数组）
  const months = rows.map(row => row.bill_month)

  return { venueId, months, periods }
})
