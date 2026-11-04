<script setup lang="ts">
import { ElMessage } from 'element-plus'

const props = defineProps<{ modelValue: string | null, label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const uploading = ref(false)

async function upload(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    ElMessage.warning('请选择5MB以内的 JPG、PNG、WebP 或 GIF 图片')
    return
  }
  uploading.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const result = await $fetch<{ url: string }>('/api/upload', { method: 'POST', body })
    emit('update:modelValue', result.url)
    ElMessage.success('图片上传成功')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="image-upload">
    <el-image v-if="modelValue" :src="modelValue" :preview-src-list="[modelValue]" fit="contain" class="preview" :alt="label ?? '已上传图片'" />
    <div v-else class="placeholder">尚未上传图片</div>
    <el-upload :show-file-list="false" accept="image/jpeg,image/png,image/webp,image/gif" :auto-upload="false" :on-change="(file) => file.raw && upload(file.raw)">
      <el-button :loading="uploading">{{ modelValue ? '更换图片' : '上传图片' }}</el-button>
    </el-upload>
  </div>
</template>

<style scoped>
.image-upload { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.preview, .placeholder { width: 104px; height: 136px; border-radius: 10px; border: 1px solid var(--line); background: #f3f5f8; }
.preview { display: block; }
.placeholder { display: grid; place-items: center; color: var(--muted); font-size: 12px; text-align: center; line-height: 1.5; }
</style>
