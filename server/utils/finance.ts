import { query } from './db'

// 收入、支出、期末结余全部由 bill_items 实时计算，bills 表不再维护这些汇总值

export interface BillTotals {
  income: number
  expense: number
}

const round2 = (value: number) => Math.round(value * 100) / 100

// 从明细列表汇总收入/支出
export function totalsFromItems(items: { kind: string, amount: number | string }[]): BillTotals {
  let income = 0
  let expense = 0
  for (const item of items) {
    if (item.kind === 'income') income += Number(item.amount)
    else expense += Number(item.amount)
  }
  return { income: round2(income), expense: round2(expense) }
}

// 按账单 ID 批量汇总收入/支出（列表页用，避免 N+1）
export async function getBillTotals(billIds: number[]) {
  const totals = new Map<number, BillTotals>()
  if (!billIds.length) return totals
  const placeholders = billIds.map(() => '?').join(', ')
  const rows = await query<{ bill_id: number, income: number | string, expense: number | string }>(
    `SELECT bill_id,
            COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM bill_items WHERE bill_id IN (${placeholders}) GROUP BY bill_id`,
    billIds
  )
  for (const row of rows) {
    totals.set(Number(row.bill_id), { income: round2(Number(row.income)), expense: round2(Number(row.expense)) })
  }
  return totals
}

// 期末结余 = 截至该月末的全部明细净额（实时计算，不落库）
export async function getBillBalance(venueId: number, month: string) {
  const [year, mon] = month.split('-').map(Number)
  const nextMonthStart = new Date(Date.UTC(year ?? 0, mon ?? 1, 1)).toISOString().slice(0, 10)
  const rows = await query<{ balance: number | string }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END), 0) AS balance
     FROM bill_items WHERE venue_id = ? AND occurred_on < ?`,
    [venueId, nextMonthStart]
  )
  return round2(Number(rows[0]?.balance ?? 0))
}
