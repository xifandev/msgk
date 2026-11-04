<script setup lang="ts">
import { ElMessage } from 'element-plus'
import {
  Avatar, Bell, DataAnalysis, Document, DocumentChecked, Guide, Key, List,
  Message, OfficeBuilding, Reading, Setting, User, UserFilled, Wallet, Warning
} from '@element-plus/icons-vue'
import { NAVIGATION } from '~~/shared/navigation'

const { admin, hasPerm, logout, impersonator, stopImpersonate } = useAdmin()
const route = useRoute()
const mobileMenu = ref(false)
const icons = { Avatar, Bell, DataAnalysis, Document, DocumentChecked, Guide, Key, List, Message, OfficeBuilding, Reading, Setting, User, UserFilled, Wallet, Warning }
const items = computed(() => NAVIGATION.filter((item) => hasPerm(item.permission)))
const mainItems = computed(() => items.value.filter((item) => !item.superOnly))
const opsItems = computed(() => items.value.filter((item) => item.superOnly && admin.value?.roleCode === 'super'))
watch(() => route.path, () => { mobileMenu.value = false })

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
          <el-menu-item
            v-for="item in mainItems"
            :key="item.path"
            :index="item.path"
            :aria-current="route.path === item.path ? 'page' : undefined"
          >
            <el-icon><component :is="icons[item.icon as keyof typeof icons]" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
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
          <el-menu-item
            v-for="item in mainItems"
            :key="item.path"
            :index="item.path"
            :aria-current="route.path === item.path ? 'page' : undefined"
          >
            <el-icon><component :is="icons[item.icon as keyof typeof icons]" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
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
          <el-button class="mobile-trigger" size="small" plain @click="mobileMenu = true">打开导航</el-button>
          <div class="topbar-title">信息公开，清晰可查</div>
          <div class="account">
            <span class="account-name">{{ admin?.name }}</span>
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
  min-height: 88px;
  padding: 16px 18px;
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
.topbar { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 28px; background: rgb(255 255 255 / 92%); border-block-end: 1px solid var(--line); backdrop-filter: blur(12px); }
.topbar-title { color: var(--muted); }
.account { display: flex; align-items: center; gap: 12px; }
.account-name { font-weight: 650; }
.content { padding: 28px; }
.impersonate-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 8px 28px; background: #fdf6ec; border-block-end: 1px solid #f3d19e; color: #7a5a12; font-size: 14px; }
.impersonate-text strong { color: #5c4300; }
.mobile-trigger { display: none; }

@media (max-width: 900px) {
  .sidebar { display: none; }
  .workspace { margin-inline-start: 0; }
  .mobile-trigger { display: inline-flex; }
  .topbar { padding: 10px 16px; }
  .topbar-title { display: none; }
  .content { padding: 18px 14px; }
  .account { gap: 6px; }
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
  font-size: 14px;
  transition: background-color .18s ease, color .18s ease;
}
.sidebar .el-menu-item .el-icon,
.nav-drawer .el-menu-item .el-icon { color: #8fa3b6; font-size: 17px; }
.sidebar .el-menu-item:hover,
.nav-drawer .el-menu-item:hover { background: rgb(255 255 255 / 8%); color: #fff; }
.sidebar .el-menu-item:hover .el-icon,
.nav-drawer .el-menu-item:hover .el-icon { color: #fff; }

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
