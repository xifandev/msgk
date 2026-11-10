interface MonthRow {
  bill_month: string
}

interface AggregateRow {
  ym: string
  income: number | string
  expense: number | string
  net: number | string
}

const round2 = (value: number) => Math.round(value * 100) / 100

// 月度公开信息流：分页返回已公开月份的「汇总」数据（收入/支出/期末结余），
// 不返回明细。明细由小程序点开某个月份后再按需调用 /finance/monthly 单月接口获取，
// 避免一个接口把全部明细暴露出来。
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') throw createError({ statusCode: 405, message: '仅支持 GET 请求' })
  const input = getQuery(event)
  const venueId = positiveId(input.venueId, '场所ID')
  const limit = Math.min(20, Math.max(1, Math.floor(Number(input.limit) || 10)))
  const before = String(input.before ?? '').trim()
  if (before && !/^\d{4}-(0[1-9]|1[0-2])$/.test(before)) {
    throw createError({ statusCode: 400, message: '游标月份格式必须为 YYYY-MM' })
  }

  // 只返回审核通过、已对外公开且不晚于当前月份的账单，多取一条判断是否还有更早月份
  const page = await query<MonthRow>(
    `SELECT bill_month FROM bills
     WHERE venue_id = ? AND state = 'approved' AND published = 1
       AND bill_month <= DATE_FORMAT(NOW(), '%Y-%m')
       ${before ? 'AND bill_month < ?' : ''}
     ORDER BY bill_month DESC LIMIT ?`,
    before ? [venueId, before, limit + 1] : [venueId, limit + 1]
  )
  const hasMore = page.length > limit
  const months = page.slice(0, limit)

  if (!months.length) {
    return before
      ? { months: [], hasMore: false }
      : {
          months: [],
          hasMore: false,
          overview: { publishedCount: 0, latestBalance: 0, totalIncome: 0, totalExpense: 0 }
        }
  }

  const maxMonth = months[0]!.bill_month
  const [maxYear, maxMon] = maxMonth.split('-').map(Number) as [number, number]
  // 聚合上界取最新公开月份当月末（Date.UTC 的月份从 0 起，传 maxMon 即下个月 1 日）
  const nextMonthStart = new Date(Date.UTC(maxYear, maxMon, 1)).toISOString().slice(0, 10)

  // 汇总所有已公开账单的明细（最早公开月 ~ 最新公开月月末），按月份聚合。
  // 只 JOIN 已公开账单，未公开月份金额绝不进入累计，避免间接泄露未公开数据
  const aggregates = await query<AggregateRow>(
    `SELECT DATE_FORMAT(i.occurred_on, '%Y-%m') AS ym,
            COALESCE(SUM(CASE WHEN i.kind = 'income' THEN i.amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN i.kind = 'expense' THEN i.amount ELSE 0 END), 0) AS expense,
            COALESCE(SUM(CASE WHEN i.kind = 'income' THEN i.amount ELSE -i.amount END), 0) AS net
     FROM bill_items i
     JOIN bills b ON b.id = i.bill_id AND b.state = 'approved' AND b.published = 1
     WHERE i.venue_id = ? AND i.occurred_on < ?
     GROUP BY ym ORDER BY ym`,
    [venueId, nextMonthStart]
  )

  const byMonth = new Map(aggregates.map(row => [row.ym, row]))
  // 按时间升序累加净额，得到每个有明细月份的期末结余（累计口径）
  let running = 0
  const balances = new Map<string, number>()
  for (const row of aggregates) {
    running = round2(running + Number(row.net))
    balances.set(row.ym, running)
  }

  // 某公开月份可能没有明细：结余取最近一个不晚于它的有明细月份的累计值
  const resultMonths = months.map(({ bill_month }) => {
    const agg = byMonth.get(bill_month)
    let currentBalance = balances.get(bill_month) ?? 0
    if (!agg) {
      for (const row of aggregates) {
        if (row.ym <= bill_month) currentBalance = balances.get(row.ym) ?? 0
        else break
      }
    }
    return {
      month: bill_month,
      income: round2(Number(agg?.income ?? 0)),
      expense: round2(Number(agg?.expense ?? 0)),
      currentBalance
    }
  })

  const response: Record<string, unknown> = { months: resultMonths, hasMore }

  // 总览只在首次（无游标）返回：公开月数 + 最新结余 + 累计收支
  if (!before) {
    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM bills
       WHERE venue_id = ? AND state = 'approved' AND published = 1
         AND bill_month <= DATE_FORMAT(NOW(), '%Y-%m')`,
      [venueId]
    )
    response.overview = {
      publishedCount: Number(countRow?.total ?? 0),
      latestBalance: running,
      totalIncome: round2(aggregates.reduce((sum, row) => sum + Number(row.income), 0)),
      totalExpense: round2(aggregates.reduce((sum, row) => sum + Number(row.expense), 0))
    }
  }

  return response
})
