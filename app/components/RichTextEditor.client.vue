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
/* Editor 组件根节点自带内联 height:100%，必须用 !important 才能让确定高度生效；
   高度生效后 wangEditor 会在内部 .w-e-scroll 上启用 overflow-y:auto，长文在编辑区内滚动，工具栏保持吸顶 */
.editor-content { height: clamp(200px, 42dvh, 480px) !important; overflow-y: hidden; }
</style>
