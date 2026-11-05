import type { Ref } from 'vue'

const VALID_TABS = ['', 'mine', 'pending_town', 'pending_county', 'draft', 'approved', 'rejected'] as const

/**
 * 财务/场所/人员三个公开栏目共用的审核状态筛选栏选中项管理。
 * 初始取值：URL ?state= 参数优先；否则审核员固定落在“待我审核”，其他人落在“全部”。
 * 必须在 onMounted 里先调 initTab() 再加载列表，避免先用“全部”渲染再跳变。
 */
export function useReviewStateTab(myState: Readonly<Ref<string>>, isReviewer: Readonly<Ref<boolean>>) {
  const route = useRoute()
  const router = useRouter()
  const activeTab = ref('')

  function initTab() {
    const fromQuery = String(route.query.state ?? '')
    if (fromQuery && (VALID_TABS as readonly string[]).includes(fromQuery)) {
      activeTab.value = fromQuery === myState.value ? 'mine' : fromQuery
      return
    }
    activeTab.value = isReviewer.value && myState.value ? 'mine' : ''
  }

  function syncQuery(value: string) {
    const state = value === 'mine' ? myState.value : value
    void router.replace({ query: { ...route.query, state: state || undefined } })
  }

  return { activeTab, initTab, syncQuery }
}
