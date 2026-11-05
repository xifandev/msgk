import type { PoolConnection } from 'mysql2/promise'
import { queryOne } from './db'

export async function recalculateBill(conn: PoolConnection, billId: number) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM bill_items WHERE bill_id = ?`,
    [billId]
  )
  const totals = (rows as { income: number, expense: number }[])[0]
  const income = Number(totals?.income ?? 0)
  const expense = Number(totals?.expense ?? 0)
  await conn.query(
    'UPDATE bills SET income = ?, expense = ? WHERE id = ?',
    [income.toFixed(2), expense.toFixed(2), billId]
  )
}

// 月结余 = 场所期初结余 + 截至该月末的全部明细净额（实时计算，不落库）
export async function getBillBalance(venueId: number, month: string) {
  const [year, mon] = month.split('-').map(Number)
  const nextMonthStart = new Date(Date.UTC(year ?? 0, mon ?? 1, 1)).toISOString().slice(0, 10)
  const row = await queryOne<{ balance: number | string }>(
    `SELECT v.opening_balance + COALESCE((
       SELECT SUM(CASE WHEN i.kind = 'income' THEN i.amount ELSE -i.amount END)
       FROM bill_items i WHERE i.venue_id = v.id AND i.occurred_on < ?
     ), 0) AS balance
     FROM venues v WHERE v.id = ?`,
    [nextMonthStart, venueId]
  )
  return Math.round(Number(row?.balance ?? 0) * 100) / 100
}
