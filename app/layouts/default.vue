<script setup lang="ts">
import {
  Avatar, Bell, DataAnalysis, Document, DocumentChecked, Guide, Key, List,
  Message, OfficeBuilding, Reading, Setting, User, UserFilled, Wallet, Warning
} from '@element-plus/icons-vue'
import { NAVIGATION } from '~~/shared/navigation'

const { admin, hasPerm, logout } = useAdmin()
const route = useRoute()
const mobileMenu = ref(false)
const icons = { Avatar, Bell, DataAnalysis, Document, DocumentChecked, Guide, Key, List, Message, OfficeBuilding, Reading, Setting, User, UserFilled, Wallet, Warning }
const items = computed(() => NAVIGATION.filter((item) => hasPerm(item.permission)))
watch(() => route.path, () => { mobileMenu.value = false })
</script>

<template>
  <div class="admin-shell">
    <a class="skip-link" href="#content">跳到主要内容</a>
    <aside class="sidebar">
      <NuxtLink class="brand" to="/dashboard">
        <span class="brand-mark">码</span>
        <span><strong>码上公开</strong><small>信息公开管理系统</small></span>
      </NuxtLink>
      <nav aria-label="后台主导航">
        <el-menu :default-active="route.path" router>
          <el-menu-item v-for="item in items" :key="item.path" :index="item.path">
            <el-icon><component :is="icons[item.icon as keyof typeof icons]" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>
      </nav>
    </aside>

    <el-drawer v-model="mobileMenu" direction="ltr" size="280px" title="码上公开">
      <nav aria-label="移动端主导航">
        <el-menu :default-active="route.path" router>
          <el-menu-item v-for="item in items" :key="item.path" :index="item.path">{{ item.label }}</el-menu-item>
        </el-menu>
      </nav>
    </el-drawer>

    <div class="workspace">
      <header class="topbar">
        <el-button class="mobile-trigger" text @click="mobileMenu = true">打开导航</el-button>
        <div class="topbar-title">信息公开，清晰可查</div>
        <div class="account">
          <span class="account-name">{{ admin?.name }}</span>
          <el-tag effect="plain">{{ admin?.roleName }}</el-tag>
          <el-button text @click="logout">退出登录</el-button>
        </div>
      </header>
      <main id="content" class="content" tabindex="-1">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell { min-height: 100dvh; }
.sidebar { position: fixed; inset-block: 0; inset-inline-start: 0; width: 232px; background: #fff; border-inline-end: 1px solid var(--line); overflow-y: auto; z-index: 20; }
.brand { display: flex; align-items: center; gap: 12px; height: 86px; padding: 18px 22px; }
.brand-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: var(--brand); color: white; font-size: 23px; font-weight: 700; }
.brand strong, .brand small { display: block; }
.brand small { color: var(--muted); font-size: 12px; }
.el-menu { border-inline-end: 0; }
.workspace { min-height: 100dvh; margin-inline-start: 232px; }
.topbar { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 28px; background: rgb(255 255 255 / 92%); border-block-end: 1px solid var(--line); position: sticky; inset-block-start: 0; z-index: 10; backdrop-filter: blur(12px); }
.topbar-title { color: var(--muted); }
.account { display: flex; align-items: center; gap: 12px; }
.account-name { font-weight: 650; }
.content { padding: 28px; }
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
