<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { REVIEW_LABELS, REVIEW_TAG_TYPES } from '~~/shared/review'

useHead({ title: '财务公开 | 码上公开' })
const { hasPerm } = useAdmin()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const filters = reactive({ page: 1, pageSize: 10, venueId: null as number | null, month: '', state: '' })
const addVisible = ref(false)
const addForm = reactive({ venueId: null as number | null, month: '' })
const detailVisible = ref(false)
const current = ref<Record<string, any>>({})
const items = ref<any[]>([])
const itemVisible = ref(false)
const itemForm = reactive({ id: 0, kind: 'income', occurredOn: '', summary: '', amount: '' })

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/finance', { query: filters })
    list.value = response.list
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
async function addBill() {
  try {
    await $fetch('/api/admin/finance', { method: 'POST', body: addForm })
    ElMessage.success('月度账单已创建')
    addVisible.value = false
    addForm.venueId = null
    addForm.month = ''
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function openBill(row: any) {
  try {
    const response = await $fetch<{ bill: any, items: any[] }>(`/api/admin/finance/${row.id}`)
    current.value = response.bill
    items.value = response.items
    detailVisible.value = true
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function saveBill() {
  try {
    await $fetch(`/api/admin/finance/${current.value.id}`, { method: 'PUT', body: { previousBalance: current.value.previous_balance } })
    ElMessage.success('账单汇总已保存')
    await Promise.all([load(), openBill(current.value)])
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
function editItem(item?: any) {
  Object.assign(itemForm, item ? { id: item.id, kind: item.kind, occurredOn: item.occurred_on, summary: item.summary, amount: item.amount } : { id: 0, kind: 'income', occurredOn: `${current.value.bill_month}-01`, summary: '', amount: '' })
  itemVisible.value = true
}
async function saveItem() {
  const url = itemForm.id ? `/api/admin/finance/items/${itemForm.id}` : `/api/admin/finance/${current.value.id}/items`
  try {
    await $fetch(url, { method: itemForm.id ? 'PUT' : 'POST', body: itemForm })
    itemVisible.value = false
    await openBill(current.value)
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function deleteItem(item: any) {
  await ElMessageBox.confirm(`确定删除“${item.summary}”吗？`, '删除明细', { type: 'warning' })
  try {
    await $fetch(`/api/admin/finance/items/${item.id}`, { method: 'DELETE' })
    await openBill(current.value)
    await load()
  } catch (error) { if (error !== 'cancel') ElMessage.error(errorMessage(error)) }
}
async function review(action: string, reason?: string) {
  try {
    await $fetch(`/api/admin/finance/${current.value.id}/review`, { method: 'POST', body: { action, reason } })
    ElMessage.success('审核状态已更新')
    await Promise.all([load(), openBill(current.value)])
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function publish(row: any) {
  try {
    await $fetch(`/api/admin/finance/${row.id}/publish`, { method: 'POST', body: { published: row.published } })
    ElMessage.success(row.published ? '已公开' : '已取消公开')
  } catch (error) { row.published = row.published ? 0 : 1; ElMessage.error(errorMessage(error)) }
}
async function remove(row: any) {
  await ElMessageBox.confirm(`确定删除 ${row.venue_name} ${row.bill_month} 的账单及全部明细吗？`, '删除账单', { type: 'warning' })
  await $fetch(`/api/admin/finance/${row.id}`, { method: 'DELETE' })
  ElMessage.success('账单已删除')
  await load()
}
watch(() => [filters.page, filters.pageSize, filters.venueId, filters.month, filters.state], load)
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div><h1>财务公开</h1><p>按月维护收支明细，审核通过后向公众公开。</p></div>
      <el-button v-if="hasPerm('finance:edit')" type="primary" @click="addVisible = true">添加月度账单</el-button>
    </div>
    <section class="panel">
      <div class="toolbar">
        <VenueSelect v-model="filters.venueId" clearable />
        <el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" placeholder="公开月份" />
        <el-select v-model="filters.state" clearable placeholder="审核状态">
          <el-option v-for="(label, value) in REVIEW_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="月度账单列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column prop="venue_name" label="场所" min-width="150" />
          <el-table-column prop="bill_month" label="月份" width="110" />
          <el-table-column prop="income" label="收入（元）" width="120" />
          <el-table-column prop="expense" label="支出（元）" width="120" />
          <el-table-column prop="previous_balance" label="上月结余" width="120" />
          <el-table-column prop="current_balance" label="本月结余" width="120" />
          <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="REVIEW_TAG_TYPES[row.state]">{{ REVIEW_LABELS[row.state] }}</el-tag></template></el-table-column>
          <el-table-column v-if="hasPerm('finance:publish')" label="公开" width="80"><template #default="{ row }"><el-switch v-model="row.published" :active-value="1" :inactive-value="0" :disabled="row.state !== 'approved'" :aria-label="`${row.venue_name}${row.bill_month}公开状态`" @change="publish(row)" /></template></el-table-column>
          <el-table-column label="操作" width="190" fixed="right"><template #default="{ row }"><el-button text type="primary" @click="openBill(row)">明细与审核</el-button><el-button v-if="hasPerm('finance:delete')" text type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" layout="total, sizes, prev, pager, next" /></div>
    </section>

    <el-dialog v-model="addVisible" title="添加月度账单" width="min(480px, 94vw)">
      <el-form label-position="top" @submit.prevent="addBill">
        <el-form-item label="场所" required><VenueSelect v-model="addForm.venueId" /></el-form-item>
        <el-form-item label="公开月份" required><el-date-picker v-model="addForm.month" type="month" value-format="YYYY-MM" placeholder="选择月份" /></el-form-item>
        <el-button type="primary" native-type="submit">创建账单</el-button>
      </el-form>
    </el-dialog>

    <el-drawer v-model="detailVisible" size="min(900px, 96vw)" :title="`${current.venue_name ?? ''} ${current.bill_month ?? ''}`">
      <div class="detail-layout">
        <section>
          <div class="summary-grid">
            <el-input v-model="current.previous_balance" aria-label="上月结余" :disabled="!['draft','rejected'].includes(current.state)"><template #prepend>上月结余</template></el-input>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="收入">{{ current.income }}</el-descriptions-item><el-descriptions-item label="支出">{{ current.expense }}</el-descriptions-item>
              <el-descriptions-item label="本月结余">{{ current.current_balance }}</el-descriptions-item><el-descriptions-item label="明细数">{{ items.length }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <div class="toolbar">
            <el-button v-if="hasPerm('finance:edit') && ['draft','rejected'].includes(current.state)" type="primary" @click="editItem()">添加明细</el-button>
            <el-button v-if="hasPerm('finance:edit') && ['draft','rejected'].includes(current.state)" @click="saveBill">保存上月结余</el-button>
          </div>
          <el-table :data="items">
            <el-table-column prop="occurred_on" label="日期" width="115" />
            <el-table-column label="类型" width="90"><template #default="{ row }">{{ row.kind === 'income' ? '收入' : '支出' }}</template></el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="140" />
            <el-table-column prop="amount" label="金额" width="110" />
            <el-table-column label="操作" width="130"><template #default="{ row }"><template v-if="['draft','rejected'].includes(current.state)"><el-button text @click="editItem(row)">编辑</el-button><el-button v-if="hasPerm('finance:delete')" text type="danger" @click="deleteItem(row)">删除</el-button></template></template></el-table-column>
          </el-table>
        </section>
        <aside class="review-side"><ReviewTimeline :record="current" /><ReviewActions :state="current.state" edit-permission="finance:edit" review-permission="finance:review" @action="review" /></aside>
      </div>
    </el-drawer>

    <el-dialog v-model="itemVisible" :title="itemForm.id ? '编辑明细' : '添加明细'" width="min(520px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveItem">
        <el-form-item label="收支类型" required><el-radio-group v-model="itemForm.kind"><el-radio-button value="income">收入</el-radio-button><el-radio-button value="expense">支出</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="日期" required><el-date-picker v-model="itemForm.occurredOn" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="摘要" required><el-input v-model="itemForm.summary" maxlength="100" /></el-form-item>
        <el-form-item label="金额（元）" required><el-input v-model="itemForm.amount" inputmode="decimal" /></el-form-item>
        <el-button type="primary" native-type="submit">保存明细</el-button>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.el-select, .el-date-picker { min-width: 180px; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 24px; }
.review-side { display: grid; align-content: start; gap: 20px; }
.summary-grid { display: grid; gap: 16px; margin-block-end: 18px; }
@media (max-width: 760px) { .detail-layout { grid-template-columns: 1fr; } }
</style>
