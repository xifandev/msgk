import type { Ref } from 'vue'

const VALID_TABS = ['', 'mine', 'pending_town', 'pending_county', 'draft', 'approved', 'rejected'] as const

/**
 * 财务/场所/人员三个公开栏目共用的审核状态筛选栏选中项管理。
 * 初始取值：URL ?state= 参数优先；否则按 defaultMine 决定——默认审核员落在“待我审核”，
 * defaultMine 为 false（场所公开/人员公开）时一律落在“全部”。
 * 必须在 onMounted 里先调 initTab() 再加载列表，避免先用“全部”渲染再跳变。
 */
export function useReviewStateTab(myState: Readonly<Ref<string>>, isReviewer: Readonly<Ref<boolean>>, defaultMine = true) {
  const route = useRoute()
  const router = useRouter()
  // null 表示全部不选中（工具栏查询生效时胶囊不保持任何选中态）
  const activeTab = ref<string | null>('')

  function initTab() {
    const fromQuery = String(route.query.state ?? '')
    if (fromQuery && (VALID_TABS as readonly string[]).includes(fromQuery)) {
      activeTab.value = fromQuery === myState.value ? 'mine' : fromQuery
      return
    }
    activeTab.value = defaultMine && isReviewer.value && myState.value ? 'mine' : ''
  }

  function syncQuery(value: string) {
    const state = value === 'mine' ? myState.value : value
    void router.replace({ query: { ...route.query, state: state || undefined } })
  }

  // 工具栏查询生效时调用：胶囊全部不选中，并清掉地址栏里的 state 参数
  function clearTab() {
    activeTab.value = null
    void router.replace({ query: { ...route.query, state: undefined } })
  }

  return { activeTab, initTab, syncQuery, clearTab }
}
