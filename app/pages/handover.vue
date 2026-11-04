<script setup lang="ts">
import { ElMessage } from 'element-plus'

const { admin, venues, impersonator, fetchMe } = useAdmin()

const form = reactive({ name: '', phone: '' })
const confirming = ref(false)
const submitting = ref(false)

function startHandover() {
  if (!form.name.trim()) { ElMessage.warning('请填写新管理员姓名'); return }
  if (!/^1[3-9]\d{9}$/.test(form.phone.trim())) { ElMessage.warning('请填写正确的新管理员手机号'); return }
  confirming.value = true
}

async function confirmHandover() {
  submitting.value = true
  try {
    const result = await $fetch<{ ok: boolean, switchedBack: boolean }>('/api/auth/handover', { method: 'POST', body: { name: form.name.trim(), phone: form.phone.trim() } })
    if (result.switchedBack) {
      ElMessage.success('交接完成，已切回你的账号')
      impersonator.value = null
      await fetchMe(true)
      await navigateTo('/dashboard')
    } else {
      ElMessage.success('交接完成，请使用新管理员账号登录')
      admin.value = null
      venues.value = []
      impersonator.value = null
      await navigateTo('/login')
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
    submitting.value = false
    confirming.value = false
  }
}
</script>

<template>
  <div class="page">
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-head-title">账号交接</h2>
        <p class="panel-head-desc">将本账号的角色与场所管理权限整体交接给新管理员，交接后本账号停用并退出登录。</p>
      </div>
      <el-alert v-if="impersonator" type="info" :closable="false" :title="`当前为切换身份状态，交接的是 ${admin?.name} 的账号，完成后将自动切回你的账号。`" class="handover-alert" />
      <div class="handover-grid">
        <div class="handover-side">
          <h3 class="handover-heading">当前登录账号</h3>
          <p class="handover-line"><span class="muted">姓名</span>{{ admin?.name }}</p>
          <p class="handover-line"><span class="muted">手机号</span>{{ admin?.phone }}</p>
          <p class="handover-line"><span class="muted">角色</span>{{ admin?.roleName }}</p>
          <p class="handover-line handover-venues">
            <span class="muted">管辖场所</span>
            <span v-if="admin?.allVenues">全部场所</span>
            <template v-else>
              <el-tag v-for="venue in venues" :key="venue.id" class="venue-tag" effect="plain">{{ venue.name }}</el-tag>
            </template>
          </p>
        </div>
        <el-form class="handover-side" label-position="top" @submit.prevent="startHandover">
          <h3 class="handover-heading">交接给新管理员</h3>
          <el-form-item label="姓名">
            <el-input v-model="form.name" maxlength="50" placeholder="接任管理员姓名" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="form.phone" maxlength="11" placeholder="接任管理员手机号（用于短信登录）" />
          </el-form-item>
          <el-button type="primary" native-type="submit">发起交接</el-button>
        </el-form>
      </div>
    </section>

    <el-dialog
      v-model="confirming"
      title="确认账号交接"
      width="480px"
      class="handover-dialog"
      :close-on-click-modal="false"
    >
      <p class="handover-confirm-text">
        是否将<template v-if="!admin?.allVenues">以下 {{ venues.length }} 个场所</template><template v-else>全部场所</template>的管理员由
        <strong>{{ admin?.name }}（{{ admin?.phone }}）</strong>
        更换为
        <strong>{{ form.name }}（{{ form.phone }}）</strong>？
      </p>
      <div v-if="!admin?.allVenues" class="handover-confirm-venues">
        <el-tag v-for="venue in venues" :key="venue.id" class="venue-tag" effect="plain">{{ venue.name }}</el-tag>
      </div>
      <p class="handover-confirm-warn">交接后{{ impersonator ? '被交接账号将被停用' : '你的账号将被停用并立即退出登录' }}，此操作无法撤销。</p>
      <template #footer>
        <el-button :disabled="submitting" @click="confirming = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmHandover">确认交接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.handover-alert { margin-bottom: 16px; }
.handover-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.handover-heading { margin: 0 0 12px; font-size: 14px; font-weight: 650; color: #344054; }
.handover-line { margin: 8px 0; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
.handover-line .muted { flex: none; min-width: 56px; }
.handover-venues { align-items: center; }
.venue-tag { margin: 3px; }
@media (max-width: 720px) { .handover-grid { grid-template-columns: 1fr; } }
</style>

<style>
/* 确认弹窗 teleport 到 body，scoped 无效，需非 scoped + 前缀限定 */
.handover-dialog .handover-confirm-text { margin: 0 0 12px; line-height: 1.7; }
.handover-dialog .handover-confirm-venues { margin-bottom: 12px; }
.handover-dialog .handover-confirm-warn { margin: 0; color: #b42318; font-size: 13px; }
.handover-dialog .venue-tag { margin: 3px; }
</style>
