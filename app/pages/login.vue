<script setup lang="ts">
import { ElMessage } from 'element-plus'

definePageMeta({ layout: 'auth' })
useHead({ title: '管理员登录 | 码上公开' })
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
    <div class="login-intro">
      <span class="eyebrow">MSGK ADMIN</span>
      <h1 id="login-title">码上公开管理系统</h1>
      <p>场所信息、人员、安全动态与财务公开，统一管理，规范审核。</p>
      <ul>
        <li>按角色分配功能权限</li>
        <li>按场所隔离管理范围</li>
        <li>公开内容经过审核后发布</li>
      </ul>
    </div>
    <form class="login-form" method="post" @submit.prevent="submit">
      <h2>管理员登录</h2>
      <p class="muted">使用已开通的手机号获取短信验证码</p>
      <label for="login-phone">手机号</label>
      <el-input id="login-phone" v-model="form.phone" name="phone" inputmode="numeric" autocomplete="username" maxlength="11" placeholder="请输入手机号" size="large" />
      <label for="login-code">短信验证码</label>
      <div class="code-row">
        <el-input id="login-code" v-model="form.code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6位验证码" size="large" @keyup.enter="submit" />
        <el-button size="large" :loading="sending" :disabled="countdown > 0" @click="sendCode">
          {{ countdown > 0 ? `${countdown}秒后重发` : '获取验证码' }}
        </el-button>
      </div>
      <el-button class="submit" type="primary" native-type="submit" size="large" :loading="submitting">登录</el-button>
      <el-button class="contacts-button" text @click="openContacts">查询场所管理员联系方式</el-button>
      <p class="support">未开通账号或无法接收短信，请联系系统管理员。</p>
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
.login-card { width: min(960px, 100%); display: grid; grid-template-columns: 1.05fr 1fr; overflow: hidden; border-radius: 24px; background: white; box-shadow: 0 28px 80px rgb(50 0 10 / 25%); }
.login-intro { padding: 56px; color: white; background: rgb(80 8 22 / 55%); }
.eyebrow { font-size: 12px; letter-spacing: 2px; opacity: .75; }
.login-intro h1 { margin-block: 18px 14px; font-size: 34px; }
.login-intro p { color: #ffe7ea; }
.login-intro ul { margin-block-start: 36px; padding-inline-start: 20px; color: #ffe7ea; }
.login-form { padding: 48px 42px; }
.login-form h2 { margin: 0; font-size: 26px; }
.login-form label { display: block; margin-block: 20px 8px; font-weight: 600; }
.code-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.submit { width: 100%; margin-block-start: 30px; }
.support { margin-block-start: 24px; color: var(--muted); font-size: 13px; text-align: center; }
@media (max-width: 700px) {
  .login-card { grid-template-columns: 1fr; }
  .login-intro { padding: 28px; }
  .login-intro ul { display: none; }
  .login-intro h1 { margin-block-start: 10px; font-size: 26px; }
  .login-form { padding: 28px; }
}
</style>
