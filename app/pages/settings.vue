<script setup lang="ts">
import { ElMessage } from 'element-plus'
const { admin, venues, fetchMe } = useAdmin()
const noticeEnabled = ref(true)
watch(() => admin.value?.noticeEnabled, (value) => { noticeEnabled.value = value ?? true }, { immediate: true })
async function save() { try { await $fetch('/api/auth/settings', { method: 'PUT', body: { noticeEnabled: noticeEnabled.value } }); ElMessage.success('设置已保存'); await fetchMe(true) } catch (error) { ElMessage.error(errorMessage(error)) } }
</script>

<template>
  <div class="page">
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-head-title">账号信息</h2>
      </div>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="姓名">{{ admin?.name }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ admin?.phone }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ admin?.roleName }}</el-descriptions-item>
        <el-descriptions-item label="管辖场所">
          <span v-if="admin?.allVenues">全部场所</span>
          <el-tag v-else v-for="venue in venues" :key="venue.id" class="venue-tag">{{ venue.name }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-head-title">通知偏好</h2>
      </div>
      <div class="setting-row">
        <div>
          <strong>内部通知</strong>
          <p class="muted">控制是否接收内部公告提醒。</p>
        </div>
        <el-switch v-model="noticeEnabled" aria-label="内部通知开关" @change="save" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.venue-tag { margin: 3px; }
.setting-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.setting-row p { margin: 4px 0 0; }
</style>
