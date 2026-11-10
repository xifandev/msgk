interface BillRow {
  id: number
  bill_month: string
}

interface ItemRow {
  bill_id: number
  id: number
  occurred_on: string
  kind: string
  summary: string
  amount: number
}

interface NetRow {
  ym: string
  net: number | string
}

const round2 = (value: number) => Math.round(value * 100) / 100

// 公开明细信息流：分页返回已公开月份及其完整收支明细。
// 按月份游标分页（默认每页 10 个月），避免一次性把全部历史明细暴露出来。
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = positiveId(input.venueId, '场所ID')
  const limit = Math.min(20, Math.max(1, Math.floor(Number(input.limit) || 10)))
  const before = String(input.before ?? '').trim()
  if (before && !/^\d{4}-(0[1-9]|1[0-2])$/.test(before)) {
    throw createError({ statusCode: 400, message: '游标月份格式必须为 YYYY-MM' })
  }

  // 只返回审核通过、已公开且不晚于当前月份的账单，多取一条判断是否还有更早月份
  const page = await query<BillRow>(
    `SELECT id, bill_month FROM bills
     WHERE venue_id = ? AND state = 'approved' AND published = 1
       AND bill_month <= DATE_FORMAT(NOW(), '%Y-%m')
       ${before ? 'AND bill_month < ?' : ''}
     ORDER BY bill_month DESC LIMIT ?`,
    before ? [venueId, before, limit + 1] : [venueId, limit + 1]
  )
  const hasMore = page.length > limit
  const months = page.slice(0, limit)

  if (!months.length) {
    return { months: [], hasMore: false }
  }

  const maxMonth = months[0]!.bill_month
  const [maxYear, maxMon] = maxMonth.split('-').map(Number) as [number, number]
  // 结余累计上界取最新公开月份当月末（Date.UTC 的月份从 0 起，传 maxMon 即下个月 1 日）
  const nextMonthStart = new Date(Date.UTC(maxYear, maxMon, 1)).toISOString().slice(0, 10)

  // 本页账单的全部明细，随月份分页按需返回（每个公开月份铺开的完整收支明细）
  const billIds = months.map(bill => bill.id)
  const placeholders = billIds.map(() => '?').join(', ')
  const itemRows = await query<ItemRow>(
    `SELECT bill_id, id, occurred_on, kind, summary, amount
     FROM bill_items WHERE bill_id IN (${placeholders})
     ORDER BY occurred_on ASC, id ASC`,
    billIds
  )
  const itemsByBill = new Map<number, ItemRow[]>()
  for (const row of itemRows) {
    const list = itemsByBill.get(Number(row.bill_id))
    if (list) list.push(row)
    else itemsByBill.set(Number(row.bill_id), [row])
  }

  // 期末结余累计：只统计已公开账单明细的净额，未公开月份金额绝不进入累计
  const netRows = await query<NetRow>(
    `SELECT DATE_FORMAT(i.occurred_on, '%Y-%m') AS ym,
            COALESCE(SUM(CASE WHEN i.kind = 'income' THEN i.amount ELSE -i.amount END), 0) AS net
     FROM bill_items i
     JOIN bills b ON b.id = i.bill_id AND b.state = 'approved' AND b.published = 1
     WHERE i.venue_id = ? AND i.occurred_on < ?
     GROUP BY ym ORDER BY ym`,
    [venueId, nextMonthStart]
  )
  let running = 0
  const balances = new Map<string, number>()
  for (const row of netRows) {
    running = round2(running + Number(row.net))
    balances.set(row.ym, running)
  }

  const resultMonths = months.map(({ id, bill_month }) => {
    const items = (itemsByBill.get(Number(id)) ?? []).map(item => ({
      id: item.id,
      occurredOn: item.occurred_on,
      kind: item.kind,
      summary: item.summary,
      amount: Number(item.amount)
    }))
    let income = 0
    let expense = 0
    for (const item of items) {
      if (item.kind === 'income') income += item.amount
      else expense += item.amount
    }
    // 该月结余：有明细取累计值，无明细取最近一个不晚于它的有明细月份
    let currentBalance = balances.get(bill_month) ?? 0
    if (!balances.has(bill_month)) {
      for (const row of netRows) {
        if (row.ym <= bill_month) currentBalance = balances.get(row.ym) ?? 0
        else break
      }
    }
    return {
      month: bill_month,
      income: round2(income),
      expense: round2(expense),
      currentBalance,
      items
    }
  })

  return { months: resultMonths, hasMore }
})
