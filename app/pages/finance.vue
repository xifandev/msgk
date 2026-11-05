<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { REVIEW_ACTION_MESSAGES, REVIEW_LABELS, REVIEW_TAG_TYPES, myReviewState } from '~~/shared/review'
const FINANCE_ACTION_MESSAGES: Record<string, string> = { ...REVIEW_ACTION_MESSAGES, reopen: '已退回为填报中，修改后需重新提交审核' }
const financeActionMessage = (action: string) => FINANCE_ACTION_MESSAGES[action] ?? '审核状态已更新'
const route = useRoute()
const { admin, hasPerm } = useAdmin()
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const counts = ref<Record<string, number>>({})
const filters = reactive({ page: 1, pageSize: 10, venueId: null as number | null, month: '', state: '' })
// 两套查询完全独立：胶囊只管状态，工具栏只管场所/月份；最后使用哪一套，列表就按哪一套取数
const queryMode = ref<'tab' | 'toolbar'>('tab')
// 当前列表实际生效的状态：仅“胶囊查询”模式下参与取数
const effectiveState = computed(() => (queryMode.value === 'tab' ? filters.state : ''))

interface StateTab { value: string, label: string, count: number }
const canReview = computed(() => hasPerm('finance:review'))
const isTown = computed(() => admin.value?.roleCode === 'town')
// 公开列仅在“全部 / 审核通过”视图下展示，其余状态整列隐藏
const showPublishColumn = computed(() => hasPerm('finance:publish') && (!effectiveState.value || effectiveState.value === 'approved'))
// 镇级管理员无填报权限，查看“正在填报”列表时隐藏整列操作
const showActionColumn = computed(() => !(isTown.value && effectiveState.value === 'draft'))
const myState = computed(() => myReviewState(admin.value?.roleCode ?? ''))
const stateTab = useReviewStateTab(myState, canReview)
const mounted = ref(false)
const stateTabs = computed<StateTab[]>(() => {
  const items: StateTab[] = []
  if (canReview.value && myState.value) items.push({ value: 'mine', label: '待我审核', count: counts.value[myState.value] ?? 0 })
  if (!(canReview.value && myState.value === 'pending_town')) items.push({ value: 'pending_town', label: '待镇级审核', count: counts.value.pending_town ?? 0 })
  if (!(canReview.value && myState.value === 'pending_county')) items.push({ value: 'pending_county', label: '待县级审核', count: counts.value.pending_county ?? 0 })
  items.push({ value: 'draft', label: '正在填报', count: counts.value.draft ?? 0 })
  items.push({ value: 'approved', label: '审核通过', count: counts.value.approved ?? 0 })
  items.push({ value: 'rejected', label: '审核失败', count: counts.value.rejected ?? 0 })
  items.push({ value: '', label: '全部', count: counts.value.all ?? 0 })
  return items
})
// 胶囊是一套独立查询：只按状态取数；点胶囊时彻底清空工具栏的场所/月份
const activeTab = stateTab.activeTab
function setStateTab(value: string) {
  const state = value === 'mine' ? myState.value : value
  activeTab.value = value
  filters.state = state
  filters.venueId = null
  filters.month = ''
  filters.page = 1
  queryMode.value = 'tab'
  stateTab.syncQuery(value)
}
// 工具栏是另一套独立查询：只按场所/月份取数；查询时胶囊全部不选中
function queryByToolbar() {
  const wasToolbar = queryMode.value === 'toolbar'
  const wasFirstPage = filters.page === 1
  queryMode.value = 'toolbar'
  stateTab.clearTab()
  filters.page = 1
  // 条件确实没变化时，手动刷新一次，保证“查询”有反馈
  if (wasToolbar && wasFirstPage) void load()
}
const detailVisible = ref(false)
const current = ref<Record<string, any>>({})
const items = ref<any[]>([])
const itemVisible = ref(false)
const itemSaving = ref(false)
const itemForm = reactive({ id: 0, kind: 'income', occurredOn: '', summary: '', amount: '' })
const billEditable = computed(() => ['draft', 'rejected'].includes(current.value.state))
// 录入态按录入顺序倒序（id 倒序，最新录入的排第一，便于确认刚录入内容）；审核态按日期正序（从小到大）
const sortedItems = computed(() => {
  const arr = [...items.value]
  if (billEditable.value) {
    arr.sort((a, b) => Number(b.id) - Number(a.id))
  } else {
    arr.sort((a, b) => String(a.occurred_on ?? '').localeCompare(String(b.occurred_on ?? '')))
  }
  return arr
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
    // 胶囊模式只带状态；工具栏模式只带场所/月份，互不叠加
    const query = queryMode.value === 'tab'
      ? { page: filters.page, pageSize: filters.pageSize, state: filters.state || undefined }
      : { page: filters.page, pageSize: filters.pageSize, venueId: filters.venueId ?? undefined, month: filters.month || undefined }
    const response = await $fetch<{ list: any[], total: number, counts?: Record<string, number> }>('/api/admin/finance', { query })
    list.value = response.list
    total.value = response.total
    counts.value = response.counts ?? {}
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
async function openBill(row: any) {
  try {
    const response = await $fetch<{ bill: any, items: any[] }>(`/api/admin/finance/${row.id}`)
    current.value = response.bill
    items.value = response.items
    detailVisible.value = true
  } catch (error) { ElMessage.error(errorMessage(error)) }
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
  if (!items.value.length) return '请先录入至少一条收支明细，再提交审核'
  return null
}
async function review(action: string, reason?: string) {
  try {
    await $fetch(`/api/admin/finance/${current.value.id}/review`, { method: 'POST', body: { action, reason } })
    ElMessage.success(financeActionMessage(action))
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
watch(() => [filters.page, filters.pageSize, filters.venueId, filters.month, filters.state, queryMode.value], load)
onMounted(() => {
  mounted.value = true
  stateTab.initTab()
  const tab = stateTab.activeTab.value
  filters.state = (tab === 'mine' ? myState.value : tab) ?? ''
  const venueId = Number(route.query.venueId)
  if (Number.isSafeInteger(venueId) && venueId > 0) filters.venueId = venueId
  const month = String(route.query.month ?? '')
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) filters.month = month
  // 带场所/月份参数进来的（如工作台跳转），视作工具栏查询，胶囊不保持选中
  if (filters.venueId || filters.month) {
    queryMode.value = 'toolbar'
    stateTab.clearTab()
  }
  void load()
})
</script>

<template>
  <div class="page">
    <StateTabs v-if="mounted && canReview" :tabs="stateTabs" :model-value="activeTab" aria-label="审核状态快速筛选" @update:model-value="setStateTab" />
    <section class="panel">
      <div class="toolbar">
        <VenueSelect v-model="filters.venueId" clearable placeholder="搜索场所" style="width: 260px" @change="queryByToolbar" />
        <el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" placeholder="公开月份" @change="queryByToolbar" />
        <el-button plain @click="queryByToolbar">查询</el-button>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="月度账单列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column prop="venue_name" label="场所名称" min-width="150" />
          <el-table-column label="收入" width="110" align="right"><template #default="{ row }">{{ formatMoney(row.income) }}</template></el-table-column>
          <el-table-column label="支出" width="110" align="right"><template #default="{ row }">{{ formatExpense(row.expense) }}</template></el-table-column>
          <el-table-column label="期末结余" width="110" align="right"><template #default="{ row }">{{ formatMoney(row.balance) }}</template></el-table-column>
          <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="REVIEW_TAG_TYPES[row.state]">{{ REVIEW_LABELS[row.state] }}</el-tag></template></el-table-column>
          <el-table-column v-if="showPublishColumn" label="公开" width="80">
            <template #default="{ row }">
              <el-switch v-if="row.state === 'approved'" v-model="row.published" :active-value="1" :inactive-value="0" :aria-label="`${row.venue_name}${row.bill_month}公开状态`" @change="publish(row)" />
              <span v-else class="muted" aria-hidden="true">—</span>
            </template>
          </el-table-column>
          <el-table-column label="公开月份" width="118" fixed="right" class-name="finance-month-cell" label-class-name="finance-month-head">
            <template #default="{ row }"><el-tag effect="plain" class="finance-month-tag">{{ row.bill_month }}</el-tag></template>
          </el-table-column>
          <el-table-column v-if="showActionColumn" label="操作" width="160" fixed="right" align="right">
            <template #default="{ row }">
              <span v-if="isTown && row.state === 'draft'" class="muted" aria-hidden="true">—</span>
              <TableActions v-else class="compact">
                <el-button v-if="hasPerm('finance:edit') && ['draft', 'rejected'].includes(row.state)" type="primary" :aria-label="`录入${row.venue_name}${row.bill_month}的收支明细`" @click="openBill(row)">录入明细</el-button>
                <el-button v-else type="primary" plain :aria-label="`查看${row.venue_name}${row.bill_month}的审核`" @click="openBill(row)">查看审核</el-button>
                <el-button v-if="hasPerm('finance:delete') && row.state === 'draft'" type="danger" plain :aria-label="`删除${row.venue_name}${row.bill_month}账单`" @click="remove(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-drawer v-model="detailVisible" class="finance-drawer" size="min(1000px, 96vw)">
      <template #header>
        <span class="finance-drawer-title">
          <span class="finance-drawer-venue">{{ current.venue_name ?? '' }}</span>
          <strong class="finance-drawer-month">{{ current.bill_month ?? '' }}</strong>
        </span>
      </template>
      <div class="detail-layout">
        <section class="detail-main">
          <div class="summary-grid">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="本月收入">{{ formatMoney(current.income) }}</el-descriptions-item>
              <el-descriptions-item label="本月支出">{{ formatExpense(current.expense) }}</el-descriptions-item>
              <el-descriptions-item label="期末结余">{{ formatMoney(current.balance) }}</el-descriptions-item>
              <el-descriptions-item label="明细数">{{ items.length }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <div class="toolbar">
            <el-button v-if="hasPerm('finance:edit') && billEditable" type="primary" @click="editItem()">添加收支</el-button>
          </div>
          <el-table :data="sortedItems" class="finance-items-table" aria-label="收支明细">
            <el-table-column prop="occurred_on" label="日期" width="115" class-name="finance-nowrap-cell" label-class-name="finance-nowrap-cell" />
            <el-table-column label="收支类型" width="80">
              <template #default="{ row }"><el-tag :type="row.kind === 'income' ? 'success' : 'info'">{{ row.kind === 'income' ? '收入' : '支出' }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="summary" label="简要描述" min-width="100" />
            <el-table-column label="金额" width="104" align="right"><template #default="{ row }">{{ row.kind === 'expense' ? formatExpense(row.amount) : formatMoney(row.amount) }}</template></el-table-column>
            <el-table-column label="操作" width="128" fixed="right" align="right">
              <template #default="{ row }">
                <TableActions v-if="billEditable">
                  <el-button size="small" type="primary" :aria-label="`编辑明细${row.summary}`" @click="editItem(row)">编辑</el-button>
                  <el-button size="small" type="danger" plain :aria-label="`删除明细${row.summary}`" @click="deleteItem(row)">删除</el-button>
                </TableActions>
              </template>
            </el-table-column>
          </el-table>
          <div class="finance-item-cards">
            <el-empty v-if="!items.length" description="尚未添加收支明细" />
            <ol v-else aria-label="收支明细">
              <li v-for="(item, index) in sortedItems" :key="item.id" class="finance-item-card">
                <header>
                  <span>{{ item.occurred_on }}</span>
                  <el-tag :type="item.kind === 'income' ? 'success' : 'info'">{{ item.kind === 'income' ? '收入' : '支出' }}</el-tag>
                </header>
                <dl>
                  <div><dt>简要描述</dt><dd>{{ item.summary }}</dd></div>
                  <div><dt>金额</dt><dd>{{ item.kind === 'expense' ? formatExpense(item.amount) : formatMoney(item.amount) }}</dd></div>
                </dl>
                <TableActions v-if="billEditable">
                  <el-button size="small" type="primary" :aria-label="`编辑明细${item.summary}`" @click="editItem(item)">编辑</el-button>
                  <el-button size="small" type="danger" plain :aria-label="`删除明细${item.summary}`" @click="deleteItem(item)">删除</el-button>
                </TableActions>
              </li>
            </ol>
          </div>
        </section>
        <aside class="review-side">
          <el-card class="review-card" shadow="never">
            <template #header><span class="review-card-title">审核进度</span></template>
            <ReviewTimeline :record="current" />
            <ReviewActions :state="current.state" edit-permission="finance:edit" review-permission="finance:review" :submit-validator="validateSubmit" reopen-label="重新填报" @action="review" />
          </el-card>
        </aside>
      </div>
    </el-drawer>

    <el-dialog v-model="itemVisible" :title="itemForm.id ? '编辑明细' : '添加收支'" width="min(520px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveItem">
        <el-form-item label="收支类型" required><el-radio-group v-model="itemForm.kind"><el-radio-button value="income">收入</el-radio-button><el-radio-button value="expense">支出</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="选择日期" required><el-date-picker v-model="itemForm.occurredOn" value-format="YYYY-MM-DD" :disabled-date="disableOutsideMonth" placeholder="日期需在账单月份内" /></el-form-item>
        <el-form-item label="简要描述" required><el-input v-model="itemForm.summary" maxlength="100" placeholder="请输入简要描述" /></el-form-item>
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
.el-select, .el-date-picker { min-width: 180px; }
/* 列表行高略放大，减少拥挤感 */
.table-region :deep(.el-table th.el-table__cell) { padding-block: 10px; }
.table-region :deep(.el-table td.el-table__cell) { padding-block: 11px; }
/* 行悬停高亮更明显（悬停期间持续高亮由 el-table 自带 hover-row 保证） */
.table-region :deep(.el-table) { --el-table-row-hover-bg-color: #eaf2fc; }
/* 公开月份列：表头与月份标签略放大，便于辨认 */
.table-region :deep(.finance-month-head .cell) { font-size: 15px; font-weight: 600; }
.table-region :deep(.finance-month-tag) { height: 26px; padding-inline: 10px; font-size: 14px; line-height: 24px; font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); font-size: 13px; }
.table-actions.compact :deep(.el-button) { height: 26px; padding-inline: 10px; font-size: 13px; }
:global(.finance-drawer .el-drawer__body) { container-type: inline-size; }
:global(.finance-drawer .finance-drawer-title) { display: grid; gap: 2px; line-height: 1.3; }
:global(.finance-drawer .finance-drawer-venue) { font-size: 17px; font-weight: 600; color: #1f2937; }
:global(.finance-drawer .finance-drawer-month) { font-size: 22px; font-weight: 700; color: var(--brand); font-variant-numeric: tabular-nums; letter-spacing: 0.5px; }
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
.review-card { border-radius: 12px; background: linear-gradient(180deg, #fbfcfe 0%, var(--surface) 100%); }
.review-card :deep(.el-card__header) { padding: 12px 16px; border-block-end-color: var(--line); }
.review-card-title { font-size: 14px; font-weight: 600; color: #344054; }
.review-card :deep(.el-card__body) { display: grid; gap: 20px; padding: 16px; }
.summary-grid { display: grid; gap: 16px; margin-block-end: 18px; }
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
