import { ElMessageBox } from 'element-plus'

/**
 * 编辑弹窗防误关：打开弹窗时 snapshot() 记录表单快照；
 * 关闭时（ESC、点击遮罩、右上角 X、取消按钮）对比快照，有改动则弹确认。
 * 用法：
 *   const { snapshot, confirmClose } = useDirtyClose(form)
 *   <el-dialog :before-close="confirmClose" ...>
 *   <el-button @click="confirmClose(() => editorVisible = false)">取消</el-button>
 */
export function useDirtyClose<T extends Record<string, any>>(form: T) {
  let original = ''
  const snapshot = () => { original = JSON.stringify(form) }
  const isDirty = () => JSON.stringify(form) !== original
  async function confirmClose(done: () => void) {
    if (!isDirty()) { done(); return }
    try {
      await ElMessageBox.confirm('当前内容已编辑，关闭后未保存的修改将丢失。', '是否关闭？', {
        type: 'warning',
        confirmButtonText: '关闭',
        cancelButtonText: '继续编辑'
      })
      done()
    } catch { /* 用户选择继续编辑，保持弹窗 */ }
  }
  return { snapshot, isDirty, confirmClose }
}
