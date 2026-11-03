import { ElLoading } from 'element-plus/es/components/loading/index'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { ElNotification } from 'element-plus/es/components/notification/index'

export default defineNuxtPlugin((nuxtApp) => {
  const context = nuxtApp.vueApp._context
  ;(ElMessage as any)._context = context
  ;(ElMessageBox as any)._context = context
  ;(ElNotification as any)._context = context
  ;(ElLoading as any)._context = context
})
