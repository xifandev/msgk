export default defineTask({
  meta: {
    name: 'bills:auto-create',
    description: '每月 1 日为所有场所自动创建当月财务账单，并结转上月结余'
  },
  async run() {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const result = await execute(
      `INSERT IGNORE INTO bills (venue_id, bill_month, previous_balance, current_balance)
       SELECT v.id, ?, COALESCE(p.current_balance, 0), COALESCE(p.current_balance, 0)
       FROM venues v
       LEFT JOIN bills p ON p.id = (
         SELECT b.id FROM bills b
         WHERE b.venue_id = v.id AND b.bill_month < ?
         ORDER BY b.bill_month DESC LIMIT 1
       )`,
      [month, month]
    )
    return { result: `已为 ${result.affectedRows} 个场所创建 ${month} 账单` }
  }
})
