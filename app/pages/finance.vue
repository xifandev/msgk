<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { REVIEW_LABELS, REVIEW_TAG_TYPES, reviewActionMessage } from '~~/shared/review'
const FINANCE_LABELS: Record<string, string> = { ...REVIEW_LABELS, draft: '正在填报' }
const route = useRoute()
const router = useRouter()
const { admin, hasPerm } = useAdmin()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const counts = ref<Record<string, number>>({})
const filters = reactive({ page: 1, pageSize: 10, venueId: null as number | null, month: '', state: '' })

interface StateTab { value: string, label: string, count: number }
const canReview = computed(() => hasPerm('finance:review'))
const myState = computed(() => {
  const code = admin.value?.roleCode ?? ''
  if (code === 'town') return 'pending_town'
  if (['county', 'super'].includes(code)) return 'pending_county'
  return ''
})
const stateTabs = computed<StateTab[]>(() => {
  if (!canReview.value) return []
  const items: StateTab[] = []
  if (myState.value) items.push({ value: 'mine', label: '待我审核', count: counts.value[myState.value] ?? 0 })
  if (myState.value !== 'pending_town') items.push({ value: 'pending_town', label: '待镇级审核', count: counts.value.pending_town ?? 0 })
  if (myState.value !== 'pending_county') items.push({ value: 'pending_county', label: '待县级审核', count: counts.value.pending_county ?? 0 })
  items.push({ value: 'draft', label: '正在填报', count: counts.value.draft ?? 0 })
  items.push({ value: 'approved', label: '审核通过', count: counts.value.approved ?? 0 })
  items.push({ value: 'rejected', label: '审核失败', count: counts.value.rejected ?? 0 })
  items.push({ value: '', label: '全部', count: counts.value.all ?? 0 })
  return items
})
const activeTab = computed(() => {
  if (!canReview.value) return ''
  if (filters.state && filters.state === myState.value) return 'mine'
  return filters.state
})
function setStateTab(value: string) {
  const state = value === 'mine' ? myState.value : value
  if (filters.state === state) return
  filters.state = state
  filters.page = 1
  void router.replace({ query: { ...route.query, state: state || undefined } })
}
const addVisible = ref(false)
const adding = ref(false)
const addForm = reactive({ venueId: null as number | null, month: '' })
const detailVisible = ref(false)
const current = ref<Record<string, any>>({})
const items = ref<any[]>([])
const itemVisible = ref(false)
const itemSaving = ref(false)
const itemForm = reactive({ id: 0, kind: 'income', occurredOn: '', summary: '', amount: '' })
const prevDirty = ref(false)
const billEditable = computed(() => ['draft', 'rejected'].includes(current.value.state))
const previewBalance = computed(() => {
  const previous = Number(current.value.previous_balance)
  const income = Number(current.value.income)
  const expense = Number(current.value.expense)
  if (![previous, income, expense].every(Number.isFinite)) return null
  return previous + income - expense
})

function rowIndex(index: number) {
  return (filters.page - 1) * filters.pageSize + index + 1
}
function monthRange() {
  const [year, month] = String(current.value.bill_month ?? '').split('-').map(Number)
  if (!year || !month) return null
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return { start, end }
}
function disableOutsideMonth(date: Date) {
  const range = monthRange()
  if (!range) return false
  return date < range.start || date > range.end
}

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number, counts?: Record<string, number> }>('/api/admin/finance', { query: filters })
    list.value = response.list
    total.value = response.total
    counts.value = response.counts ?? {}
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
async function addBill() {
  if (!addForm.venueId) { ElMessage.warning('请选择场所'); return }
  if (!addForm.month) { ElMessage.warning('请选择要添加的月份'); return }
  adding.value = true
  try {
    await $fetch('/api/admin/finance', { method: 'POST', body: addForm })
    ElMessage.success('月度公开已添加')
    addVisible.value = false
    addForm.venueId = null
    addForm.month = ''
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { adding.value = false }
}
async function openBill(row: any) {
  try {
    const response = await $fetch<{ bill: any, items: any[] }>(`/api/admin/finance/${row.id}`)
    current.value = response.bill
    items.value = response.items
    prevDirty.value = false
    detailVisible.value = true
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function saveBill() {
  const value = Number(current.value.previous_balance)
  if (!Number.isFinite(value)) { ElMessage.warning('请输入正确的上月结余'); return }
  try {
    await $fetch(`/api/admin/finance/${current.value.id}`, { method: 'PUT', body: { previousBalance: value.toFixed(2) } })
    prevDirty.value = false
    ElMessage.success('保存成功')
    await Promise.all([load(), openBill(current.value)])
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
async function confirmClose(done: () => void) {
  if (!prevDirty.value) { done(); return }
  try {
    await ElMessageBox.confirm('上月结余尚未保存，是否保存后关闭？', '提示', { type: 'warning', confirmButtonText: '保存并关闭', cancelButtonText: '不保存', distinguishCancelAndClose: true })
    await saveBill()
    done()
  } catch (action) {
    if (action === 'cancel') {
      prevDirty.value = false
      done()
    }
  }
}
function editItem(item?: any) {
  Object.assign(itemForm, item ? { id: item.id, kind: item.kind, occurredOn: item.occurred_on, summary: item.summary, amount: item.amount } : { id: 0, kind: 'income', occurredOn: `${current.value.bill_month}-01`, summary: '', amount: '' })
  itemVisible.value = true
}
function normalizeAmount() {
  const value = Number(itemForm.amount)
  if (Number.isFinite(value) && value > 0) itemForm.amount = value.toFixed(2)
}
async function saveItem() {
  if (!itemForm.occurredOn) { ElMessage.warning('请选择日期'); return }
  if (!itemForm.summary.trim()) { ElMessage.warning('请输入简要描述'); return }
  if (!(Number(itemForm.amount) > 0)) { ElMessage.warning('请输入收支金额'); return }
  const url = itemForm.id ? `/api/admin/finance/items/${itemForm.id}` : `/api/admin/finance/${current.value.id}/items`
  itemSaving.value = true
  try {
    await $fetch(url, { method: itemForm.id ? 'PUT' : 'POST', body: itemForm })
    itemVisible.value = false
    await openBill(current.value)
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { itemSaving.value = false }
}
async function deleteItem(item: any) {
  try {
    await ElMessageBox.confirm(`是否要删除明细“${item.summary}”？`, '警告', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
  } catch { return }
  try {
    await $fetch(`/api/admin/finance/items/${item.id}`, { method: 'DELETE' })
    await openBill(current.value)
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
function validateSubmit() {
  if (prevDirty.value) return '上月结余尚未保存，请先点击“保存上月结余”'
  if (!items.value.length) return '请先录入至少一条收支明细，再提交审核'
  if (current.value.previous_balance === null || current.value.previous_balance === undefined || current.value.previous_balance === '') return '请填写上月结余，再提交审核'
  return null
}
async function review(action: string, reason?: string) {
  try {
    await $fetch(`/api/admin/finance/${current.value.id}/review`, { method: 'POST', body: { action, reason } })
    ElMessage.success(reviewActionMessage(action))
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
  try {
    await ElMessageBox.confirm(`是否要删除本月账单及收支明细（${row.venue_name} ${row.bill_month}）？删除后不可恢复。`, '警告', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
  } catch { return }
  try {
    await $fetch(`/api/admin/finance/${row.id}`, { method: 'DELETE' })
    ElMessage.success('删除成功')
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
watch(() => [filters.page, filters.pageSize, filters.venueId, filters.month, filters.state], load)
onMounted(() => {
  const state = String(route.query.state ?? '')
  if (state && state in REVIEW_LABELS) filters.state = state
  const venueId = Number(route.query.venueId)
  if (Number.isSafeInteger(venueId) && venueId > 0) filters.venueId = venueId
  const month = String(route.query.month ?? '')
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) filters.month = month
  load().then(() => {
    if (!state && canReview.value && myState.value && (counts.value[myState.value] ?? 0) > 0) setStateTab('mine')
  })
})
</script>

<template>
  <div class="page">
    <nav v-if="stateTabs.length" class="state-tabs" role="tablist" aria-label="审核状态快速筛选">
      <button
        v-for="tab in stateTabs"
        :key="tab.value || 'all'"
        type="button"
        role="tab"
        class="state-tab"
        :class="{ active: activeTab === tab.value }"
        :aria-selected="activeTab === tab.value"
        @click="setStateTab(tab.value)"
      >
        {{ tab.label }}<em>{{ tab.count }}</em>
      </button>
    </nav>
    <section class="panel">
      <div class="toolbar">
        <VenueSelect v-model="filters.venueId" clearable style="width: 260px" />
        <el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" placeholder="公开月份" />
        <el-select v-model="filters.state" clearable placeholder="全部状态">
          <el-option v-for="(label, value) in FINANCE_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
        <el-button plain @click="load">查询</el-button>
        <div class="toolbar-actions">
          <el-button v-if="hasPerm('finance:edit')" type="primary" :icon="Plus" @click="addVisible = true">添加月度公开</el-button>
        </div>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="月度账单列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column prop="venue_name" label="场所名称" min-width="150" />
          <el-table-column label="公开月份" width="110">
            <template #default="{ row }"><el-tag effect="plain">{{ row.bill_month }}</el-tag></template>
          </el-table-column>
          <el-table-column label="收入" width="110" align="right"><template #default="{ row }">{{ formatMoney(row.income) }}</template></el-table-column>
          <el-table-column label="支出" width="110" align="right"><template #default="{ row }">{{ formatMoney(row.expense) }}</template></el-table-column>
          <el-table-column label="上月结余" width="110" align="right"><template #default="{ row }">{{ formatMoney(row.previous_balance) }}</template></el-table-column>
          <el-table-column label="本月结余" width="110" align="right"><template #default="{ row }">{{ formatMoney(row.current_balance) }}</template></el-table-column>
          <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="REVIEW_TAG_TYPES[row.state]">{{ FINANCE_LABELS[row.state] }}</el-tag></template></el-table-column>
          <el-table-column v-if="hasPerm('finance:publish')" label="公开" width="80">
            <template #default="{ row }">
              <el-tooltip content="审核通过后才能公开" :disabled="row.state === 'approved'" placement="top">
                <el-switch v-model="row.published" :active-value="1" :inactive-value="0" :disabled="row.state !== 'approved'" :aria-label="`${row.venue_name}${row.bill_month}公开状态`" @change="publish(row)" />
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="168" fixed="right" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button v-if="['draft', 'rejected'].includes(row.state)" size="small" type="primary" :aria-label="`录入${row.venue_name}${row.bill_month}的收支明细`" @click="openBill(row)">录入明细</el-button>
                <el-button v-else size="small" type="primary" plain :aria-label="`查看${row.venue_name}${row.bill_month}的审核`" @click="openBill(row)">查看审核</el-button>
                <el-button v-if="hasPerm('finance:delete') && row.state === 'draft'" size="small" type="danger" plain :aria-label="`删除${row.venue_name}${row.bill_month}账单`" @click="remove(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-dialog v-model="addVisible" title="添加月度公开" width="min(480px, 94vw)">
      <el-form label-position="top" @submit.prevent="addBill">
        <el-form-item label="当前场所" required><VenueSelect v-model="addForm.venueId" /></el-form-item>
        <el-form-item label="公开月份" required><el-date-picker v-model="addForm.month" type="month" value-format="YYYY-MM" placeholder="选择月份" /></el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="addVisible = false">取消</el-button>
          <el-button type="primary" :loading="adding" @click="addBill">确定添加</el-button>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" class="finance-drawer" size="min(1000px, 96vw)" :title="`${current.venue_name ?? ''} ${current.bill_month ?? ''}`" :before-close="confirmClose">
      <div class="detail-layout">
        <section class="detail-main">
          <div class="summary-grid">
            <section class="previous-balance-card" aria-label="上月结余填写与保存">
              <el-input v-model="current.previous_balance" aria-label="上月结余" :disabled="!billEditable" @input="prevDirty = true">
                <template #prepend>¥ 上月结余</template>
              </el-input>
              <el-button v-if="hasPerm('finance:edit') && billEditable" type="primary" plain aria-label="保存上月结余" @click="saveBill">保存</el-button>
            </section>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="本月收入">{{ formatMoney(current.income) }}</el-descriptions-item>
              <el-descriptions-item label="本月支出">{{ formatMoney(current.expense) }}</el-descriptions-item>
              <el-descriptions-item label="本月结余">{{ formatMoney(previewBalance ?? current.current_balance) }}</el-descriptions-item>
              <el-descriptions-item label="明细数">{{ items.length }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <div class="toolbar">
            <el-button v-if="hasPerm('finance:edit') && billEditable" type="primary" @click="editItem()">添加收支</el-button>
          </div>
          <el-table :data="items" class="finance-items-table" aria-label="收支明细">
            <el-table-column type="index" label="序号" width="64" class-name="finance-nowrap-cell" label-class-name="finance-nowrap-cell" />
            <el-table-column prop="occurred_on" label="日期" width="115" class-name="finance-nowrap-cell" label-class-name="finance-nowrap-cell" />
            <el-table-column label="收支类型" width="80">
              <template #default="{ row }"><el-tag :type="row.kind === 'income' ? 'success' : 'info'">{{ row.kind === 'income' ? '收入' : '支出' }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="summary" label="简要描述" min-width="100" />
            <el-table-column label="金额" width="104" align="right"><template #default="{ row }">{{ formatMoney(row.amount) }}</template></el-table-column>
            <el-table-column label="操作" width="128" fixed="right" align="right">
              <template #default="{ row }">
                <TableActions v-if="billEditable">
                  <el-button size="small" type="primary" :aria-label="`编辑明细${row.summary}`" @click="editItem(row)">编辑</el-button>
                  <el-button v-if="hasPerm('finance:delete')" size="small" type="danger" plain :aria-label="`删除明细${row.summary}`" @click="deleteItem(row)">删除</el-button>
                </TableActions>
              </template>
            </el-table-column>
          </el-table>
          <div class="finance-item-cards">
            <el-empty v-if="!items.length" description="尚未添加收支明细" />
            <ol v-else aria-label="收支明细">
              <li v-for="(item, index) in items" :key="item.id" class="finance-item-card">
                <header>
                  <span>第 {{ index + 1 }} 条</span>
                  <el-tag :type="item.kind === 'income' ? 'success' : 'info'">{{ item.kind === 'income' ? '收入' : '支出' }}</el-tag>
                </header>
                <dl>
                  <div><dt>日期</dt><dd>{{ item.occurred_on }}</dd></div>
                  <div><dt>简要描述</dt><dd>{{ item.summary }}</dd></div>
                  <div><dt>金额</dt><dd>{{ formatMoney(item.amount) }}</dd></div>
                </dl>
                <TableActions v-if="billEditable">
                  <el-button size="small" type="primary" :aria-label="`编辑明细${item.summary}`" @click="editItem(item)">编辑</el-button>
                  <el-button v-if="hasPerm('finance:delete')" size="small" type="danger" plain :aria-label="`删除明细${item.summary}`" @click="deleteItem(item)">删除</el-button>
                </TableActions>
              </li>
            </ol>
          </div>
        </section>
        <aside class="review-side">
          <ReviewTimeline :record="current" :labels="FINANCE_LABELS" />
          <ReviewActions :state="current.state" edit-permission="finance:edit" review-permission="finance:review" :submit-validator="validateSubmit" @action="review" />
        </aside>
      </div>
    </el-drawer>

    <el-dialog v-model="itemVisible" :title="itemForm.id ? '编辑明细' : '添加收支'" width="min(520px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveItem">
        <el-form-item label="收支类型" required><el-radio-group v-model="itemForm.kind"><el-radio-button value="income">收入</el-radio-button><el-radio-button value="expense">支出</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="选择日期" required><el-date-picker v-model="itemForm.occurredOn" value-format="YYYY-MM-DD" :disabled-date="disableOutsideMonth" placeholder="日期需在账单月份内" /></el-form-item>
        <el-form-item label="简要描述" required><el-input v-model="itemForm.summary" maxlength="30" show-word-limit placeholder="10个字以内简短描述" /></el-form-item>
        <el-form-item label="收支金额" required>
          <el-input v-model="itemForm.amount" inputmode="decimal" placeholder="请输入收支金额" @blur="normalizeAmount">
            <template #prepend>¥</template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="itemVisible = false">取消</el-button>
          <el-button type="primary" :loading="itemSaving" @click="saveItem">保存明细</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.state-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.state-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: #475467;
  cursor: pointer;
  font-size: 13px;
  transition: border-color .15s, background-color .15s, color .15s;
}
.state-tab em { min-width: 22px; padding: 0 6px; border-radius: 999px; background: #eef1f5; color: var(--muted); font-style: normal; font-size: 11px; line-height: 20px; text-align: center; font-variant-numeric: tabular-nums; }
.state-tab:hover { border-color: var(--el-color-primary-light-5); color: var(--brand); }
.state-tab.active { border-color: var(--brand); background: var(--brand); color: #fff; }
.state-tab.active em { background: rgb(255 255 255 / 20%); color: #fff; }
.state-tab:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .state-tab { transition: none; } }
.el-select, .el-date-picker { min-width: 180px; }
.muted { color: var(--muted); font-size: 13px; }
:global(.finance-drawer .el-drawer__body) { container-type: inline-size; }
:global(.finance-drawer .el-drawer__close-btn) { flex: none; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border: 1px solid transparent; border-radius: 50%; color: #475467; font-size: 24px; transition: color .15s, background-color .15s, border-color .15s, transform .15s; }
:global(.finance-drawer .el-drawer__close-btn:hover),
:global(.finance-drawer .el-drawer__close-btn:focus-visible) { border-color: #b9cce1; background: var(--brand-soft); color: var(--brand); transform: scale(1.08); }
:global(.finance-drawer .el-drawer__close-btn:focus-visible) { outline: 3px solid #84adff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  :global(.finance-drawer .el-drawer__close-btn) { transition: none; }
  :global(.finance-drawer .el-drawer__close-btn:hover),
  :global(.finance-drawer .el-drawer__close-btn:focus-visible) { transform: none; }
}
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 24px; align-items: start; }
.detail-main, .review-side { min-width: 0; }
.review-side { display: grid; align-content: start; gap: 20px; }
.summary-grid { display: grid; gap: 16px; margin-block-end: 18px; }
.previous-balance-card { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: #f8fafc; }
.previous-balance-card .el-input { flex: 0 1 240px; width: 240px; min-width: 0; }
.previous-balance-card .el-button { flex: none; margin: 0; }
.finance-items-table :deep(.finance-nowrap-cell .cell) { white-space: nowrap; }
.finance-item-cards { display: none; }
.finance-item-cards ol { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.finance-item-card { padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.finance-item-card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 13px; }
.finance-item-card dl { display: grid; gap: 8px; margin: 12px 0; }
.finance-item-card dl > div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 10px; }
.finance-item-card dt { color: var(--muted); }
.finance-item-card dd { margin: 0; overflow-wrap: anywhere; }
.finance-item-card .table-actions { padding-block-start: 12px; border-block-start: 1px solid var(--line); }
@container (max-width: 880px) {
  .detail-layout { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 600px) {
  .finance-items-table { display: none; }
  .finance-item-cards { display: block; }
}
</style>
