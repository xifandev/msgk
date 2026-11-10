// 已公开账期：小程序"选择月份 / 选择年份"弹窗的数据源
// 只返回审核通过且对外公开、且不晚于当前月份的账单
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
  const months = rows.map(row => row.bill_month)

  return { venueId, months }
})
