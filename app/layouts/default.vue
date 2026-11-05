<script setup lang="ts">
import { ElMessage } from 'element-plus'
import {
  Avatar, DataAnalysis, Document, Guide, Key, List,
  Message, OfficeBuilding, Reading, Setting, Switch, User, UserFilled, Wallet
} from '@element-plus/icons-vue'
import { NAVIGATION, navigationFor } from '~~/shared/navigation'
import type { NavBadgeCounts } from '~/composables/useNavBadges'

const { admin, venues, hasPerm, logout, impersonator, stopImpersonate } = useAdmin()
const route = useRoute()
const mobileMenu = ref(false)
const icons = { Avatar, DataAnalysis, Document, Guide, Key, List, Message, OfficeBuilding, Reading, Setting, Switch, User, UserFilled, Wallet }
const items = computed(() => NAVIGATION.filter((item) => {
  if (item.excludeRoleCodes?.includes(admin.value?.roleCode ?? '')) return false
  return Array.isArray(item.permission) ? item.permission.some((code) => hasPerm(code)) : hasPerm(item.permission)
}))
const mainItems = computed(() => items.value.filter((item) => !item.superOnly))
const opsItems = computed(() => items.value.filter((item) => item.superOnly && admin.value?.roleCode === 'super'))
/** 导航分组分隔线：三个「公开」栏目共用一组光柱（上下各一根，锚定在可见栏目的边界上） */
const PUBLIC_PATHS = ['/finance', '/profiles', '/personnel']
const NAV_GROUPS: { anchor: string[], label: string }[] = [
  { anchor: PUBLIC_PATHS, label: '公开内容' },
  { anchor: ['/venues'], label: '场所与账号管理' }
]
const navDividers = computed(() => {
  const map: Record<string, string | undefined> = {}
  for (const group of NAV_GROUPS) {
    const hit = mainItems.value.find((item) => group.anchor.includes(item.path))
    if (hit) map[hit.path] = group.label
  }
  // 公开组收尾：最后一个可见公开栏目之后的下一项前补一根光柱，把三个公开框成一组
  const list = mainItems.value
  let lastPublic = -1
  list.forEach((item, index) => { if (PUBLIC_PATHS.includes(item.path)) lastPublic = index })
  const next = list[lastPublic + 1]
  if (lastPublic >= 0 && next && !(next.path in map)) map[next.path] = undefined
  return map
})
const hasDivider = (path: string) => path in navDividers.value
watch(() => route.path, () => { mobileMenu.value = false })

const accountUnit = computed(() => {
  const a = admin.value
  if (!a) return ''
  // 场所账号：直接显示场所名
  if (a.roleCode === 'venue' && venues.value.length) {
    return venues.value.map((venue) => venue.name).join('、')
  }
  // 镇级/县级/其他：显示所属单位（如"道托镇"、"县委"）
  if (a.organization) return a.organization
  // 兜底：仅有场所范围时退回显示场所名
  if (!a.allVenues && venues.value.length) {
    return venues.value.map((venue) => venue.name).join('、')
  }
  return ''
})

const currentPage = computed(() => navigationFor(route.path))
const pageTitle = computed(() => currentPage.value?.label ?? '后台管理')
const pageDescription = computed(() => currentPage.value?.description ?? '')
useHead({ title: computed(() => `${pageTitle.value} · 沂水宗教码上公开`) })

/** 导航「待我审核」提示点：只挂在有审核待办的栏目上 */
const BADGE_KEYS: Record<string, keyof NavBadgeCounts> = {
  '/finance': 'finance',
  '/profiles': 'profiles',
  '/personnel': 'personnel'
}
const { counts: badgeCounts, refresh: refreshBadges, start: startBadgePoll, stop: stopBadgePoll } = useNavBadges()
function badgeOf(path: string) {
  const key = BADGE_KEYS[path]
  return key ? badgeCounts.value[key] ?? 0 : 0
}
onMounted(() => {
  void refreshBadges()
  startBadgePoll()
})
onBeforeUnmount(stopBadgePoll)
watch(() => route.path, () => { void refreshBadges() })


async function switchBack() {
  try {
    await stopImpersonate()
    ElMessage.success('已切回自己的账号')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}
</script>

<template>
  <div class="admin-shell">
    <a class="skip-link" href="#content">跳到主要内容</a>
    <aside class="sidebar">
      <NuxtLink class="brand" to="/dashboard">
        <strong>沂水宗教码上公开</strong>
        <small>信息公开管理系统</small>
      </NuxtLink>
      <nav class="nav" aria-label="后台主导航">
        <el-menu :default-active="route.path" router>
          <template v-for="item in mainItems" :key="item.path">
            <div
              v-if="hasDivider(item.path)"
              class="nav-meteor-divider"
              role="separator"
              :aria-label="navDividers[item.path]"
            />
            <el-menu-item
              :index="item.path"
              :aria-current="route.path === item.path ? 'page' : undefined"
            >
              <el-icon><component :is="icons[item.icon as keyof typeof icons]" /></el-icon>
              <span>{{ item.label }}</span>
              <span v-if="badgeOf(item.path)" class="nav-dot" aria-hidden="true" />
              <span v-if="badgeOf(item.path)" class="sr-only">{{ badgeOf(item.path) }} 项待你审核</span>
            </el-menu-item>
          </template>
          <el-menu-item-group v-if="opsItems.length" title="运维工具">
            <el-menu-item
              v-for="item in opsItems"
              :key="item.path"
              :index="item.path"
              :aria-current="route.path === item.path ? 'page' : undefined"
            >
              <el-icon><component :is="icons[item.icon as keyof typeof icons]" /></el-icon>
              <span>{{ item.label }}</span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </nav>
    </aside>

    <el-drawer v-model="mobileMenu" class="nav-drawer" direction="ltr" size="240px" title="沂水宗教码上公开">
      <nav aria-label="移动端主导航">
        <el-menu :default-active="route.path" router>
          <template v-for="item in mainItems" :key="item.path">
            <div
              v-if="hasDivider(item.path)"
              class="nav-meteor-divider"
              role="separator"
              :aria-label="navDividers[item.path]"
            />
            <el-menu-item
              :index="item.path"
              :aria-current="route.path === item.path ? 'page' : undefined"
            >
              <el-icon><component :is="icons[item.icon as keyof typeof icons]" /></el-icon>
              <span>{{ item.label }}</span>
              <span v-if="badgeOf(item.path)" class="nav-dot" aria-hidden="true" />
              <span v-if="badgeOf(item.path)" class="sr-only">{{ badgeOf(item.path) }} 项待你审核</span>
            </el-menu-item>
          </template>
          <el-menu-item-group v-if="opsItems.length" title="运维工具">
            <el-menu-item
              v-for="item in opsItems"
              :key="item.path"
              :index="item.path"
              :aria-current="route.path === item.path ? 'page' : undefined"
            >
              <el-icon><component :is="icons[item.icon as keyof typeof icons]" /></el-icon>
              <span>{{ item.label }}</span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </nav>
    </el-drawer>

    <div class="workspace">
      <div class="top-sticky">
        <div v-if="impersonator" class="impersonate-bar" role="alert">
          <span class="impersonate-text">正在以 <strong>{{ admin?.name }}</strong> 的身份操作（由 {{ impersonator.name }} 切换）</span>
          <el-button size="small" type="warning" @click="switchBack">切回我的账号</el-button>
        </div>
        <header class="topbar">
          <el-button class="mobile-trigger" size="small" plain @click="mobileMenu = true">导航</el-button>
          <div class="topbar-heading">
            <h1 class="topbar-title">{{ pageTitle }}</h1>
            <p v-if="pageDescription" class="topbar-desc">{{ pageDescription }}</p>
          </div>
          <div class="account">
            <span class="account-name">{{ admin?.name }}</span>
            <el-tag v-if="accountUnit" class="account-unit" type="info" effect="plain" :title="accountUnit">{{ accountUnit }}</el-tag>
            <el-tag effect="plain">{{ admin?.roleName }}</el-tag>
            <el-button size="small" plain @click="logout">退出登录</el-button>
          </div>
        </header>
      </div>
      <main id="content" class="content" tabindex="-1">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell { min-height: 100dvh; }

.sidebar {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  width: 200px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #22303f 0%, #1b2734 100%);
  border-inline-end: 1px solid #101a24;
  box-shadow: 2px 0 14px rgb(9 17 25 / 18%);
  overflow: hidden;
  z-index: 20;
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 3px;
  min-height: 78px;
  padding: 14px 18px;
  border-block-end: 1px solid rgb(255 255 255 / 8%);
  background: rgb(255 255 255 / 3%);
  flex: none;
}
.brand strong { font-size: 16px; font-weight: 700; letter-spacing: .5px; color: #fff; line-height: 1.4; }
.brand small { color: #92a6b9; font-size: 12px; letter-spacing: .5px; }
.brand:focus-visible { outline: 2px solid #5aa9e6; outline-offset: -4px; }

.nav { flex: 1; overflow-y: auto; padding: 10px 0 18px; }
.nav::-webkit-scrollbar { width: 6px; }
.nav::-webkit-scrollbar-thumb { background: rgb(255 255 255 / 14%); border-radius: 3px; }

.workspace { min-height: 100dvh; margin-inline-start: 200px; }
.top-sticky { position: sticky; inset-block-start: 0; z-index: 10; }
.topbar {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 78px;
  padding: 10px 28px;
  background: rgb(255 255 255 / 94%);
  border-block-end: 1px solid var(--line);
  backdrop-filter: blur(12px);
}
.topbar-heading { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.topbar-title {
  margin: 0;
  color: #101828;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topbar-desc {
  margin: 0;
  color: #98a2b3;
  font-size: 12.5px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.account { display: flex; align-items: center; gap: 12px; flex: none; min-width: 0; }
.account-name { font-weight: 650; color: #344054; }
.account-unit { max-width: 260px; }
.account-unit :deep(span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.content { padding: 24px 28px 36px; }
.impersonate-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 8px 28px; background: #fdf6ec; border-block-end: 1px solid #f3d19e; color: #7a5a12; font-size: 14px; }
.impersonate-text strong { color: #5c4300; }
.mobile-trigger { display: none; }

@media (max-width: 900px) {
  .sidebar { display: none; }
  .workspace { margin-inline-start: 0; }
  .mobile-trigger { display: inline-flex; }
  .topbar { gap: 12px; min-height: 64px; padding: 8px 16px; }
  .topbar-title { font-size: 17px; letter-spacing: .5px; }
  .topbar-desc { display: none; }
  .content { padding: 16px 14px 28px; }
  .account { gap: 6px; }
  .account-name { display: none; }
  .account-unit { max-width: 130px; }
}
</style>

<style>
/* 深色侧栏导航：Element Plus 菜单需要全局覆盖，移动端抽屉会被 teleport 到 body */
.sidebar .el-menu,
.nav-drawer .el-menu {
  border-inline-end: 0;
  background: transparent;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #c3d0dd;
  --el-menu-hover-bg-color: rgb(255 255 255 / 7%);
  --el-menu-active-color: #fff;
}
/* 内容维护与审核分组上下边界：流星头部在左，光尾向右渐隐 */
.sidebar .nav-meteor-divider,
.nav-drawer .nav-meteor-divider {
  position: relative;
  height: 1px;
  margin: 12px 20px 12px 18px;
  border: 0;
  background: linear-gradient(90deg, rgb(190 226 255 / 80%) 0%, rgb(105 180 235 / 42%) 32%, rgb(105 180 235 / 12%) 68%, transparent 100%);
}
.sidebar .nav-meteor-divider::before,
.nav-drawer .nav-meteor-divider::before {
  content: "";
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #e1f2ff;
  box-shadow: 0 0 7px 1px rgb(124 196 248 / 55%);
  transform: translateY(-50%);
}
.sidebar .el-menu-item-group ul,
.nav-drawer .el-menu-item-group ul { margin: 0; padding: 0; }
.sidebar .el-menu-item-group__title,
.nav-drawer .el-menu-item-group__title {
  margin-block-start: 8px;
  padding: 8px 10px 2px 16px;
  color: #748ca2;
  font-size: 12px;
  letter-spacing: 2px;
  border-block-start: 1px solid rgb(255 255 255 / 8%);
}
.sidebar .el-menu-item,
.nav-drawer .el-menu-item {
  position: relative;
  height: 44px;
  line-height: 44px;
  margin: 3px 10px;
  padding: 0 12px 0 16px;
  border-radius: 8px;
  color: #c3d0dd;
  font-size: 15px;
  transition: background-color .18s ease, color .18s ease;
}
.sidebar .el-menu-item .el-icon,
.nav-drawer .el-menu-item .el-icon { color: #8fa3b6; font-size: 19px; }
.sidebar .el-menu-item:hover,
.nav-drawer .el-menu-item:hover { background: rgb(255 255 255 / 8%); color: #fff; }
.sidebar .el-menu-item:hover .el-icon,
.nav-drawer .el-menu-item:hover .el-icon { color: #fff; }

/* 待我审核提示点：栏目名靠右的小圆点，像未读消息，但只做轻提示、不显示数字 */
.sidebar .el-menu-item,
.nav-drawer .el-menu-item { display: flex; align-items: center; }
.sidebar .el-menu-item .nav-dot,
.nav-drawer .el-menu-item .nav-dot {
  flex: none;
  margin-inline-start: auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff8168;
  box-shadow: 0 0 0 3px rgb(255 129 104 / 16%), 0 0 8px 1px rgb(255 129 104 / 45%);
  animation: nav-dot-breathe 2.8s ease-in-out infinite;
}
.sidebar .el-menu-item.is-active .nav-dot,
.nav-drawer .el-menu-item.is-active .nav-dot {
  background: #ffe4db;
  box-shadow: 0 0 0 3px rgb(255 255 255 / 24%), 0 0 8px 1px rgb(255 255 255 / 55%);
}
@keyframes nav-dot-breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .6; transform: scale(.85); }
}
@media (prefers-reduced-motion: reduce) {
  .sidebar .el-menu-item .nav-dot,
  .nav-drawer .el-menu-item .nav-dot { animation: none; }
}

/* 选中态：蓝色底 + 左侧标识条 + 白色文字，保持常驻高亮 */
.sidebar .el-menu-item.is-active,
.nav-drawer .el-menu-item.is-active {
  background: linear-gradient(90deg, #1c88cf 0%, #1a7cc0 100%);
  color: #fff;
  font-weight: 650;
  box-shadow: 0 4px 12px rgb(11 57 108 / 38%);
}
.sidebar .el-menu-item.is-active::before,
.nav-drawer .el-menu-item.is-active::before {
  content: "";
  position: absolute;
  inset-block: 10px;
  inset-inline-start: 5px;
  width: 3px;
  border-radius: 2px;
  background: #fff;
}
.sidebar .el-menu-item.is-active .el-icon,
.nav-drawer .el-menu-item.is-active .el-icon { color: #fff; }
.sidebar .el-menu-item.is-active:hover,
.nav-drawer .el-menu-item.is-active:hover { background: linear-gradient(90deg, #1c9adf 0%, #1a7cc0 100%); }

/* 移动端抽屉深色外观 */
.nav-drawer .el-drawer { background: #1e2b39; }
.nav-drawer .el-drawer__header { margin: 0; padding: 16px 18px; color: #fff; border-block-end: 1px solid rgb(255 255 255 / 8%); font-weight: 700; }
.nav-drawer .el-drawer__body { padding: 8px 0; }
.nav-drawer .el-drawer__close-btn { color: #c3d0dd; }
</style>
