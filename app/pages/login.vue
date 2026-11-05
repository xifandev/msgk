<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChatLineSquare, Edit, InfoFilled, Iphone, Tools } from '@element-plus/icons-vue'

definePageMeta({ layout: 'auth' })
const { admin } = useAdmin()
const form = reactive({ phone: '', code: '' })
const sending = ref(false)
const submitting = ref(false)
const loginSuccess = ref(false)
const loginFailed = ref(false)
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
const maintenanceMode = true
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
  if (submitting.value || loginSuccess.value) return
  submitting.value = true
  try {
    const response = await $fetch<{ admin: any, redirect: string }>('/api/auth/login', { method: 'POST', body: form })
    admin.value = response.admin
    loginSuccess.value = true
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await navigateTo(response.redirect, { replace: true })
  } catch (error) {
    ElMessage.error(errorMessage(error))
    loginFailed.value = true
    setTimeout(() => { loginFailed.value = false }, 650)
  } finally {
    submitting.value = false
  }
}

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="login-stage">
    <img class="login-illustration" src="/images/login-illustration.png" alt="" aria-hidden="true" width="400" height="400">

    <section v-if="!maintenanceMode" class="login-card" :class="{ shake: loginFailed }" aria-labelledby="login-title">
      <transition name="success-fade">
        <div v-if="loginSuccess" class="success-overlay" role="status" aria-live="polite">
          <svg class="success-mark" viewBox="0 0 72 72" fill="none" aria-hidden="true">
            <circle class="success-circle" cx="36" cy="36" r="32" />
            <path class="success-check" d="M22 37.5 32 47l18-21" />
          </svg>
          <p class="success-text">登录成功</p>
          <p class="success-sub">正在进入管理系统…</p>
        </div>
      </transition>

      <form class="login-form" method="post" @submit.prevent="submit">
        <h1 id="login-title">
          <el-icon><Edit /></el-icon>
          <span>欢迎登录</span>
        </h1>

        <label class="sr-only" for="login-phone">手机号</label>
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

        <label class="sr-only" for="login-code">验证码</label>
        <div class="code-row">
          <el-input
            id="login-code"
            v-model="form.code"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="请输入验证码"
            size="large"
            :prefix-icon="ChatLineSquare"
            @keyup.enter="submit"
          />
          <el-button class="code-btn" type="primary" plain size="large" :loading="sending" :disabled="countdown > 0" @click="sendCode">
            {{ countdown > 0 ? `${countdown}s 后重试` : '获取验证码' }}
          </el-button>
        </div>

        <el-button class="submit" type="primary" native-type="submit" size="large" :loading="submitting">登录</el-button>
        <el-button class="contacts-btn" type="primary" size="large" @click="openContacts">查询各场所管理员信息</el-button>
      </form>
    </section>

    <section v-else class="login-card maintenance-card" aria-labelledby="maintenance-title">
      <div class="maintenance-symbol" aria-hidden="true">
        <el-icon><Tools /></el-icon>
      </div>
      <h1 id="maintenance-title">系统优化升级中</h1>
      <p class="maintenance-description">
        预计 <strong>11月9日之前</strong> 完成<br>
        请稍后登录，感谢支持
      </p>
      <div class="maintenance-contact-card">
        <div class="maintenance-contact-icon" aria-hidden="true">
          <el-icon><ChatLineSquare /></el-icon>
        </div>
        <div>
          <p>有紧急问题可联系技术人员</p>
          <p class="maintenance-wechat">微信：<strong>15224499331</strong></p>
        </div>
      </div>
    </section>

    <el-drawer v-model="contactVisible" class="contact-drawer" title="场所管理员信息" size="min(480px, 94vw)">
      <el-select v-model="contactVenueId" filterable placeholder="请选择场所" style="width: 100%" @change="loadContacts">
        <el-option v-for="venue in contactVenues" :key="venue.id" :value="venue.id" :label="`${venue.name}（${venue.township}）`" />
      </el-select>
      <el-empty v-if="contactVenueId && !contacts.length" description="暂无已开通的管理员联系方式" />
      <el-descriptions v-for="(contact, index) in contacts" :key="index" :title="contact.roleName" :column="1" border class="contact-card">
        <el-descriptions-item label="姓名">{{ contact.name }}</el-descriptions-item>
        <el-descriptions-item label="电话">{{ contact.phone }}</el-descriptions-item>
      </el-descriptions>

      <div class="contact-note" role="note">
        <el-icon class="contact-note__icon"><InfoFilled /></el-icon>
        <div class="contact-note__body">
          <p class="contact-note__title">温馨提示</p>
          <p class="contact-note__text">
            如需更改管理员信息，请联系技术人员，重新录入。
          </p>
          <p class="contact-note__wechat">微信号：<strong>15224499331</strong></p>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.login-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(48px, 7vw, 128px);
  width: 100%;
  max-width: 1120px;
  margin-inline: auto;
}

/* 左侧插画（与老系统一致，窄屏隐藏） */
.login-illustration {
  flex: none;
  width: auto;
  height: clamp(240px, 40vh, 360px);
  aspect-ratio: 1 / 1;
  object-fit: contain;
}
@media (max-width: 980px) {
  .login-illustration { display: none; }
}

/* 白色登录卡片 */
.login-card {
  position: relative;
  flex: 0 0 auto;
  width: min(28rem, 100%);
  overflow: hidden;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 18px 48px -12px rgb(0 0 0 / 28%);
}

.login-form {
  padding: 34px 30px 40px;
  display: flex;
  flex-direction: column;
}
.login-form h1 {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 0 26px;
  font-size: 30px;
  font-weight: 600;
  color: #303133;
}
.login-form h1 .el-icon { font-size: 28px; color: #409eff; }

.maintenance-card {
  padding: 38px 34px 30px;
  text-align: center;
}
.maintenance-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: linear-gradient(90deg, #e3a83e, #f0ca7d, #e3a83e);
}
.maintenance-symbol {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin: 8px auto 22px;
  border: 1px solid #dceafa;
  border-radius: 20px;
  background: linear-gradient(145deg, #f2f8ff, #e6f1fd);
  color: #347fc4;
  font-size: 37px;
}
.maintenance-card h1 {
  margin: 0;
  font-size: 27px;
  font-weight: 650;
  letter-spacing: 1px;
  color: #263b52;
}
.maintenance-description {
  margin: 16px 0 25px;
  font-size: 16px;
  line-height: 1.9;
  color: #637387;
}
.maintenance-description strong {
  font-weight: 650;
  color: #a16a15;
}
.maintenance-contact-card {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 16px 18px;
  border: 1px solid #e2ebf4;
  border-radius: 13px;
  background: #f7fafd;
  text-align: left;
}
.maintenance-contact-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: #e5f0fb;
  color: #3c83c4;
  font-size: 21px;
}
.maintenance-contact-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #718196;
}
.maintenance-contact-card .maintenance-wechat {
  margin-block-start: 2px;
  font-size: 15px;
  color: #40546b;
}
.maintenance-wechat strong {
  font-size: 19px;
  font-weight: 650;
  letter-spacing: .6px;
  color: #263f58;
}

.login-form .el-input { margin-block-end: 20px; }
.login-form :deep(.el-input__wrapper) {
  min-height: 56px;
  padding: 0 16px;
  border-radius: 10px;
}
.login-form :deep(.el-input__inner) { font-size: 19px; }
.login-form :deep(.el-input__prefix) { font-size: 20px; }

.code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 10px;
  margin-block-end: 28px;
}
.code-row .el-input { margin-block-end: 0; }
.code-btn {
  height: 100%;
  min-width: 126px;
  border-radius: 10px;
  font-size: 16px;
}

.submit,
.contacts-btn {
  width: 100%;
  margin: 0;
  height: 56px;
  border-radius: 10px;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 2px;
}
.contacts-btn { margin-block-start: 16px; margin-inline-start: 0; letter-spacing: 0; font-size: 17px; }
/* Element Plus 给相邻按钮加了左外边距，会导致 100% 宽度按钮挤出卡片 */
.login-form :deep(.el-button + .el-button) { margin-inline-start: 0; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* 登录失败抖动 */
.shake { animation: shake .6s cubic-bezier(.36, .07, .19, .97); }
@keyframes shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-7px); }
  40%, 60% { transform: translateX(7px); }
}

/* 登录成功全屏动画 */
.success-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: inherit;
  background: linear-gradient(158deg, #0f5fb8 0%, #1278e4 55%, #3a90ee 100%);
}
.success-mark { width: 88px; height: 88px; }
.success-circle {
  stroke: rgb(255 255 255 / 90%);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 202;
  stroke-dashoffset: 202;
  animation: draw .55s ease-out forwards;
}
.success-check {
  stroke: #fff;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 44;
  stroke-dashoffset: 44;
  animation: draw .4s .5s ease-out forwards;
}
@keyframes draw { to { stroke-dashoffset: 0; } }
.success-text {
  margin: 18px 0 0;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: 3px;
  color: #fff;
  animation: rise .45s .55s ease-out both;
}
.success-sub {
  margin: 8px 0 0;
  font-size: 13px;
  letter-spacing: 1.5px;
  color: rgb(255 255 255 / 72%);
  animation: rise .45s .7s ease-out both;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.success-fade-enter-active { transition: opacity .28s ease; }
.success-fade-enter-from { opacity: 0; }

@media (max-width: 760px) {
  .login-stage { gap: 0; }
  .login-card { border-radius: 18px; }
  .login-form { padding: 26px 22px 32px; }
  .login-form h1 { font-size: 24px; margin-block-end: 20px; }
  .maintenance-card { padding: 32px 22px 26px; }
  .maintenance-card h1 { font-size: 24px; }
  .maintenance-symbol { width: 68px; height: 68px; margin-block-start: 24px; }
  .maintenance-description { font-size: 15px; }
  .maintenance-contact-card { padding: 14px; }
  .submit,
  .contacts-btn { height: 52px; font-size: 17px; }
  .contacts-btn { font-size: 16px; }
}
@media (max-height: 720px) and (min-width: 981px) {
  .login-illustration { height: clamp(180px, 30vh, 260px); }
}

/* 抽屉内的联系提示（drawer 传送到 body，需全局选择器） */
:global(.contact-drawer .el-drawer__body) { padding-block-start: 22px; }
:global(.contact-drawer .el-descriptions) { margin-block-start: 22px; }
:global(.contact-note) {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-block-start: 18px;
  padding: 14px 16px;
  border: 1px solid #d9e5f2;
  border-radius: 10px;
  background: #f3f8fd;
  color: #3a4a5c;
}
:global(.contact-note__icon) {
  flex: none;
  margin-block-start: 2px;
  font-size: 20px;
  color: #409eff;
}
:global(.contact-note__body) { min-width: 0; }
:global(.contact-note__title) {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: #2f3f52;
}
:global(.contact-note__text) {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
}
:global(.contact-note__wechat) {
  margin: 6px 0 0;
  font-size: 15px;
  line-height: 1.6;
}
:global(.contact-note__wechat strong) {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: .5px;
  color: #1f2d3d;
}
</style>
