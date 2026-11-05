export default defineTask({
  meta: {
    name: 'bills:auto-create',
    description: '每月 1 日为所有场所自动创建当月财务账单'
  },
  async run() {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const result = await execute(
      'INSERT IGNORE INTO bills (venue_id, bill_month) SELECT v.id, ? FROM venues v',
      [month]
    )
    return { result: `已为 ${result.affectedRows} 个场所创建 ${month} 账单` }
  }
})
