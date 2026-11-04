<script setup lang="ts">
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const editorRef = shallowRef()
const toolbarConfig = { excludeKeys: ['uploadVideo', 'insertVideo', 'fullScreen'] }
const editorConfig = { placeholder: '请输入内容...', MENU_CONF: {} as Record<string, any> }
editorConfig.MENU_CONF.uploadImage = {
  async customUpload(file: File, insertFn: (url: string) => void) {
    try {
      const body = new FormData()
      body.append('file', file)
      const result = await $fetch<{ url: string }>('/api/upload', { method: 'POST', body })
      insertFn(result.url)
    } catch (error) {
      ElMessage.error(errorMessage(error))
    }
  }
}
const content = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) })
onBeforeUnmount(() => { editorRef.value?.destroy() })
</script>

<template>
  <div class="editor">
    <Toolbar class="toolbar" :editor="editorRef" :default-config="toolbarConfig" mode="default" />
    <Editor v-model="content" class="editor-content" :default-config="editorConfig" mode="default" @on-created="editorRef = $event" />
  </div>
</template>

<style scoped>
.editor { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.toolbar { border-block-end: 1px solid var(--line); }
/* 编辑区随视口高度自适应：矮屏也不会把弹窗撑出屏幕，同时保留可用的输入高度 */
.editor-content { min-height: clamp(160px, 32dvh, 320px); }
</style>
