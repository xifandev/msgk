import type { PoolConnection } from 'mysql2/promise'

export async function recalculateBill(conn: PoolConnection, billId: number) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount ELSE 0 END), 0) AS expense,
            (SELECT previous_balance FROM bills WHERE id = ?) AS previous_balance
     FROM bill_items WHERE bill_id = ?`,
    [billId, billId]
  )
  const totals = (rows as { income: number, expense: number, previous_balance: number }[])[0]
  const income = Number(totals?.income ?? 0)
  const expense = Number(totals?.expense ?? 0)
  const previous = Number(totals?.previous_balance ?? 0)
  await conn.query(
    'UPDATE bills SET income = ?, expense = ?, current_balance = ? WHERE id = ?',
    [income.toFixed(2), expense.toFixed(2), (previous + income - expense).toFixed(2), billId]
  )
}
