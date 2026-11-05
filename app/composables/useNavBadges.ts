export interface NavBadgeCounts {
  finance: number
  profiles: number
  personnel: number
}

const EMPTY: NavBadgeCounts = { finance: 0, profiles: 0, personnel: 0 }
/** 静默轮询间隔：有人新提交审核时，导航提示点不必等用户刷新页面 */
const POLL_MS = 60_000

/**
 * 导航「待我审核」提示点数据。失败时保持上一次的值，不打断页面操作。
 */
export function useNavBadges() {
  const counts = useState<NavBadgeCounts>('nav-badges', () => ({ ...EMPTY }))
  const stage = useState<string>('nav-badges-stage', () => '')
  let timer: ReturnType<typeof setInterval> | null = null

  async function refresh() {
    try {
      const response = await $fetch<{ stage: string, counts: NavBadgeCounts }>('/api/admin/review-counts')
      counts.value = { ...EMPTY, ...response.counts }
      stage.value = response.stage ?? ''
    } catch {
      // 离线或权限变化时静默跳过，提示点沿用旧值
    }
  }

  function start() {
    if (timer) return
    timer = setInterval(() => { void refresh() }, POLL_MS)
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  return { counts, stage, refresh, start, stop }
}
