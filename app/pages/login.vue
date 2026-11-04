<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChatDotRound, Iphone } from '@element-plus/icons-vue'

definePageMeta({ layout: 'auth' })
useHead({ title: '管理员登录 | 沂水宗教码上公开' })
const { admin } = useAdmin()
const form = reactive({ phone: '', code: '' })
const sending = ref(false)
const submitting = ref(false)
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
const contactVisible = ref(false)
const contactVenues = ref<{ id: number, name: string, township: string }[]>([])
const contactVenueId = ref<number | null>(null)
const contacts = ref<{ name: string, phone: string, roleName: string }[]>([])

async function openContacts() {
  contactVisible.value = true
  if (!contactVenues.value.length) {
    const response = await $fetch<{ list: typeof contactVenues.value }>('/api/public/venues')
    contactVenues.value = response.list
  }
}
async function loadContacts() {
  if (!contactVenueId.value) return
  try {
    contacts.value = (await $fetch<{ list: typeof contacts.value }>('/api/public/contacts', { query: { venueId: contactVenueId.value } })).list
  } catch (error) { ElMessage.error(errorMessage(error)) }
}

async function sendCode() {
  if (!/^1[3-9]\d{9}$/.test(form.phone)) {
    ElMessage.warning('请先填写正确的11位手机号')
    return
  }
  sending.value = true
  try {
    const response = await $fetch<{ cooldown: number, devCode?: string }>('/api/auth/send-code', { method: 'POST', body: { phone: form.phone } })
    countdown.value = response.cooldown
    if (response.devCode) form.code = response.devCode
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && timer) clearInterval(timer)
    }, 1000)
    ElMessage.success('验证码已发送')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    sending.value = false
  }
}

async function submit() {
  submitting.value = true
  try {
    const response = await $fetch<{ admin: any, redirect: string }>('/api/auth/login', { method: 'POST', body: form })
    admin.value = response.admin
    await navigateTo(response.redirect)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <section class="login-card" aria-labelledby="login-title">
    <aside class="login-intro">
      <div class="intro-brand">
        <span class="emblem" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M16 3.6 27 7.4v7.9c0 6.4-4.4 11-11 13.1-6.6-2.1-11-6.7-11-13.1V7.4L16 3.6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M11 15.6l3.4 3.4L21.2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="intro-brand-text">YISHUI&nbsp;·&nbsp;MSGK</span>
      </div>

      <h1 id="login-title">沂水宗教码上公开管理系统</h1>
      <p class="intro-sub">统一管理 · 规范审核</p>

      <ul class="intro-points">
        <li>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8.5" r="3.2" stroke="currentColor" stroke-width="1.5" />
            <path d="M5.5 19.5c.9-3.3 3.4-5 6.5-5s5.6 1.7 6.5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span>权限分级</span>
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 20V9.2l6-3.4 6 3.4V20" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M16 12.6l4 2.2V20M9 20v-4.2h2.4V20" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
          <span>场所隔离</span>
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="3.8" width="14" height="16.4" rx="2.2" stroke="currentColor" stroke-width="1.5" />
            <path d="M8.6 8.6h6.8M8.6 12h6.8M8.6 15.4h4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span>审核发布</span>
        </li>
      </ul>

      <svg class="intro-ornament" viewBox="0 0 400 400" fill="none" aria-hidden="true">
        <circle cx="330" cy="70" r="120" stroke="currentColor" stroke-width="1" opacity=".3" />
        <circle cx="330" cy="70" r="170" stroke="currentColor" stroke-width="1" opacity=".22" />
        <circle cx="330" cy="70" r="220" stroke="currentColor" stroke-width="1" opacity=".15" />
      </svg>
    </aside>

    <form class="login-form" method="post" @submit.prevent="submit">
      <h2>管理员登录</h2>

      <label for="login-phone">手机号</label>
      <el-input
        id="login-phone"
        v-model="form.phone"
        name="phone"
        inputmode="numeric"
        autocomplete="username"
        maxlength="11"
        placeholder="请输入手机号"
        size="large"
        :prefix-icon="Iphone"
      />

      <label for="login-code">验证码</label>
      <div class="code-row">
        <el-input
          id="login-code"
          v-model="form.code"
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="6 位验证码"
          size="large"
          :prefix-icon="ChatDotRound"
          @keyup.enter="submit"
        />
        <el-button class="code-btn" size="large" :loading="sending" :disabled="countdown > 0" @click="sendCode">
          {{ countdown > 0 ? `${countdown} 秒后重发` : '获取验证码' }}
        </el-button>
      </div>

      <el-button class="submit" type="primary" native-type="submit" size="large" :loading="submitting">登录</el-button>

      <button type="button" class="contacts-button" @click="openContacts">查询管理员联系方式</button>
    </form>

    <el-drawer v-model="contactVisible" title="场所管理员联系方式" size="min(480px, 94vw)">
      <el-select v-model="contactVenueId" filterable placeholder="请选择场所" style="width: 100%" @change="loadContacts">
        <el-option v-for="venue in contactVenues" :key="venue.id" :value="venue.id" :label="`${venue.name}（${venue.township}）`" />
      </el-select>
      <el-empty v-if="contactVenueId && !contacts.length" description="暂无已开通的管理员联系方式" />
      <el-descriptions v-for="(contact, index) in contacts" :key="index" :title="contact.roleName" :column="1" border class="contact-card">
        <el-descriptions-item label="姓名">{{ contact.name }}</el-descriptions-item>
        <el-descriptions-item label="电话">{{ contact.phone }}</el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </section>
</template>

<style scoped>
.login-card {
  position: relative;
  width: min(1000px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(0, 0.92fr);
  overflow: hidden;
  border: 1px solid rgb(23 84 156 / 10%);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 32px 80px -28px rgb(11 57 108 / 45%), 0 2px 8px rgb(11 57 108 / 6%);
}

/* 左侧政务蓝信息区 */
.login-intro {
  position: relative;
  overflow: hidden;
  padding: 52px 48px;
  color: #fff;
  background: linear-gradient(158deg, #0a3a6b 0%, #14508f 52%, #1a63b0 100%);
  display: flex;
  flex-direction: column;
}
.login-intro::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle at 18% 12%, rgb(255 255 255 / 14%), transparent 55%);
  pointer-events: none;
}
.login-intro::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: .5;
  background-image:
    linear-gradient(rgb(255 255 255 / 6%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 6%) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(160deg, #000 10%, transparent 72%);
  pointer-events: none;
}

.intro-brand { position: relative; display: flex; align-items: center; gap: 12px; }
.emblem {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid rgb(255 255 255 / 34%);
  border-radius: 12px;
  background: rgb(255 255 255 / 10%);
  color: #fff;
}
.emblem svg { width: 26px; height: 26px; }
.intro-brand-text { font-size: 12px; letter-spacing: 2.4px; color: rgb(255 255 255 / 72%); }

.login-intro h1 {
  position: relative;
  margin: auto 0 0;
  font-size: clamp(23px, 2.1vw, 27px);
  font-weight: 700;
  letter-spacing: 1px;
  line-height: 1.45;
}
.intro-sub {
  position: relative;
  margin: 14px 0 0;
  font-size: 14px;
  letter-spacing: 1.5px;
  color: rgb(255 255 255 / 70%);
}

.intro-points {
  position: relative;
  display: flex;
  gap: 10px;
  margin: 46px 0 0;
  padding: 0;
  list-style: none;
}
.intro-points li {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 13px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 999px;
  background: rgb(255 255 255 / 9%);
  font-size: 13px;
  color: rgb(255 255 255 / 88%);
  backdrop-filter: blur(4px);
}
.intro-points svg { width: 16px; height: 16px; color: rgb(255 255 255 / 78%); }

.intro-ornament {
  position: absolute;
  inset-block-start: -90px;
  inset-inline-end: -120px;
  width: 400px;
  color: #fff;
  pointer-events: none;
}

/* 右侧表单 */
.login-form { padding: 56px 46px; display: flex; flex-direction: column; justify-content: center; }
.login-form h2 { margin: 0 0 30px; font-size: 24px; font-weight: 650; letter-spacing: .5px; color: #10305a; }
.login-form label { display: block; margin-block: 0 8px; font-size: 14px; font-weight: 600; color: #37507a; }
.login-form label + .el-input,
.login-form .code-row { margin-block-end: 20px; }
.code-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
.code-row :deep(.el-button) { min-width: 112px; }
.code-btn {
  color: var(--brand);
  border-color: #c9dbf0;
  background: #f3f8fe;
  font-weight: 500;
}
.code-btn:hover:not(.is-disabled) {
  color: var(--brand-dark);
  border-color: #a8c6e6;
  background: #e9f2fc;
}
.submit { width: 100%; margin-block-start: 10px; letter-spacing: 4px; font-weight: 600; }
.contacts-button {
  margin: 18px auto 0;
  padding: 4px 6px;
  border: 0;
  background: none;
  color: #4a72ab;
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
}
.contacts-button:hover { color: var(--brand); text-decoration: underline; }

@media (max-width: 760px) {
  .login-card { grid-template-columns: 1fr; border-radius: 18px; }
  .login-intro { padding: 30px 26px; }
  .login-intro h1 { margin-block-start: 18px; font-size: 21px; }
  .intro-sub { margin-block-start: 8px; font-size: 13px; letter-spacing: 2px; }
  .intro-points, .intro-ornament { display: none; }
  .login-form { padding: 30px 26px 34px; }
  .login-form h2 { margin-block-end: 22px; font-size: 21px; }
}
</style>
