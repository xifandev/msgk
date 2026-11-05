<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { TOWNSHIPS } from '~~/shared/townships'
const { admin, hasPerm } = useAdmin()
const loading = ref(false)
const saving = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const filters = reactive({ page: 1, pageSize: 10, search: '' })
const editVisible = ref(false)
const editForm = reactive({
  id: 0,
  name: '',
  township: '',
  sort_order: 0,
  image_url: null as string | null,
  safety_note: ''
})
const qrVisible = ref(false)
const qrRow = ref<Record<string, any> | null>(null)
const qrLoading = ref(false)
const qrError = ref('')
const qrBlob = ref<Blob | null>(null)
const qrImageUrl = ref('')
const posterCanvas = ref<HTMLCanvasElement | null>(null)
const posterReady = ref(false)
const posterError = ref('')
const posterDownloading = ref(false)
let qrRequestId = 0

async function load() {
  loading.value = true
  try {
    const response = await $fetch<{ list: any[], total: number }>('/api/admin/venues', { query: filters })
    list.value = response.list
    total.value = response.total
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { loading.value = false }
}
function rowIndex(index: number) {
  return (filters.page - 1) * filters.pageSize + index + 1
}
function editVenue(row?: any) {
  Object.assign(editForm, row
    ? {
        id: row.id,
        name: row.name,
        township: row.township,
        sort_order: row.sort_order,
        image_url: row.image_url,
        safety_note: row.safety_note ?? ''
      }
    : { id: 0, name: '', township: '', sort_order: 0, image_url: null, safety_note: '' })
  editVisible.value = true
}
async function saveVenue() {
  if (!editForm.name.trim()) {
    ElMessage.warning('请填写场所名称')
    return
  }
  if (!editForm.township.trim()) {
    ElMessage.warning('请选择所在乡镇')
    return
  }
  saving.value = true
  try {
    const body = {
      name: editForm.name,
      township: editForm.township,
      // 排序值不在表单中展示：编辑时保留原值，新增时传 null 由服务端排到乡镇末尾
      sort_order: editForm.id ? editForm.sort_order : null,
      image_url: editForm.image_url,
      safety_note: editForm.safety_note
    }
    if (editForm.id) {
      await $fetch(`/api/admin/venues/${editForm.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/venues', { method: 'POST', body })
    }
    ElMessage.success('保存成功')
    editVisible.value = false
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) } finally { saving.value = false }
}
async function remove(row: any) {
  try {
    await ElMessageBox.confirm(`是否要删除场所“${row.name}”？删除后其介绍、人员名册将一并删除，且不可恢复。`, '警告', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
  } catch { return }
  try {
    await $fetch(`/api/admin/venues/${row.id}`, { method: 'DELETE' })
    ElMessage.success('删除成功')
    await load()
  } catch (error) { ElMessage.error(errorMessage(error)) }
}
function clearQr() {
  qrRequestId += 1
  if (qrImageUrl.value) URL.revokeObjectURL(qrImageUrl.value)
  qrImageUrl.value = ''
  qrBlob.value = null
  qrError.value = ''
  posterReady.value = false
  posterError.value = ''
}
function resetQr() {
  clearQr()
  qrRow.value = null
}
async function openQr(row: any) {
  clearQr()
  qrRow.value = row
  qrVisible.value = true
  qrLoading.value = true
  const requestId = qrRequestId
  try {
    const blob = await $fetch<Blob>(`/api/admin/venues/${row.id}/qrcode`, { responseType: 'blob' })
    if (requestId !== qrRequestId) return
    qrBlob.value = blob
    qrImageUrl.value = URL.createObjectURL(blob)
  } catch (error) {
    if (requestId === qrRequestId) qrError.value = errorMessage(error)
  } finally {
    if (requestId === qrRequestId) qrLoading.value = false
  }
  if (requestId !== qrRequestId || !qrBlob.value) return
  await nextTick()
  try {
    await renderPoster()
  } catch {
    if (requestId === qrRequestId) posterError.value = '海报合成失败，仍可单独下载二维码后重试'
  }
}
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}
// 微信 createwxaqrcode 返回的图片里，二维码本体之外还有上下留白和底部“微信扫一扫，使用小程序”提示条。
// 逐行/逐列扫描深色像素密度，取最长的连续高密度区段即为二维码本体，裁出正方形区域；失败时回退为整图顶部正方形。
function detectQrSquare(image: HTMLImageElement): { x: number, y: number, size: number } {
  const width = image.naturalWidth
  const height = image.naturalHeight
  const fallback = { x: 0, y: 0, size: Math.min(width, height) }
  if (!width || !height) return fallback
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, width, height)
    const rowRange = longestDarkRun(data, width, height, true)
    const colRange = longestDarkRun(data, width, height, false)
    if (!rowRange || !colRange) return fallback
    const size = Math.min(Math.max(rowRange.end - rowRange.start, colRange.end - colRange.start), width, height)
    if (size < fallback.size * 0.5) return fallback
    const centerX = (colRange.start + colRange.end) / 2
    const centerY = (rowRange.start + rowRange.end) / 2
    return {
      x: Math.min(Math.max(Math.round(centerX - size / 2), 0), width - size),
      y: Math.min(Math.max(Math.round(centerY - size / 2), 0), height - size),
      size
    }
  } catch {
    return fallback
  }
}
function longestDarkRun(data: Uint8ClampedArray, width: number, height: number, byRow: boolean): { start: number, end: number } | null {
  const step = 4
  const outer = byRow ? height : width
  const inner = byRow ? width : height
  let best: { start: number, end: number } | null = null
  let current: { start: number, end: number } | null = null
  for (let o = 0; o < outer; o += step) {
    let dark = 0
    let total = 0
    for (let i = 0; i < inner; i += step) {
      const x = byRow ? i : o
      const y = byRow ? o : i
      const p = (y * width + x) * 4
      total++
      if (data[p]! + data[p + 1]! + data[p + 2]! < 384) dark++
    }
    if (total > 0 && dark / total >= 0.1) {
      current = current ? { start: current.start, end: o } : { start: o, end: o }
    } else if (current) {
      if (!best || current.end - current.start > best.end - best.start) best = current
      current = null
    }
  }
  if (current && (!best || current.end - current.start > best.end - best.start)) best = current
  return best
}
async function renderPoster() {
  const canvas = posterCanvas.value
  const row = qrRow.value
  if (!canvas || !row || !qrImageUrl.value) return
  const [background, qrImage] = await Promise.all([
    loadImage('/api/public/venue-poster-background'),
    loadImage(qrImageUrl.value),
    document.fonts.ready
  ])
  canvas.width = background.naturalWidth
  canvas.height = background.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持海报合成')
  ctx.drawImage(background, 0, 0)

  const title = {
    x: canvas.width * 0.1475,
    y: canvas.height * 0.286,
    width: canvas.width * 0.724,
    height: canvas.height * 0.056
  }
  const titleGradient = ctx.createLinearGradient(0, title.y, 0, title.y + title.height)
  titleGradient.addColorStop(0, '#5c98dc')
  titleGradient.addColorStop(1, '#3475ce')
  ctx.fillStyle = titleGradient
  ctx.fillRect(title.x, title.y, title.width, title.height)
  let fontSize = canvas.width * 0.04
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  do {
    ctx.font = `bold ${fontSize}px "Songti SC", "STSong", "SimSun", serif`
    fontSize -= 2
  } while (ctx.measureText(row.name).width > title.width - 140 && fontSize > 44)
  ctx.fillStyle = '#fff'
  ctx.fillText(row.name, title.x + title.width / 2, title.y + title.height / 2)

  const qrBox = {
    x: canvas.width * 0.268,
    y: canvas.height * 0.357,
    size: canvas.width * 0.477
  }
  ctx.fillStyle = '#fff'
  ctx.fillRect(qrBox.x, qrBox.y, qrBox.size, qrBox.size)
  const padding = canvas.width * 0.009
  ctx.imageSmoothingEnabled = false
  const qrSquare = detectQrSquare(qrImage)
  ctx.drawImage(qrImage, qrSquare.x, qrSquare.y, qrSquare.size, qrSquare.size, qrBox.x + padding, qrBox.y + padding, qrBox.size - padding * 2, qrBox.size - padding * 2)
  posterReady.value = true
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
async function downloadQr() {
  const row = qrRow.value
  if (!qrBlob.value || !row || !qrImageUrl.value) return
  // 裁掉微信接口自带的底部提示条，导出纯二维码（保留中间小程序头像图标）
  try {
    const image = await loadImage(qrImageUrl.value)
    const square = detectQrSquare(image)
    const canvas = document.createElement('canvas')
    canvas.width = square.size
    canvas.height = square.size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器不支持图片裁剪')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(image, square.x, square.y, square.size, square.size, 0, 0, square.size, square.size)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('二维码导出失败')
    downloadBlob(blob, `${row.name}-场所二维码.png`)
  } catch {
    ElMessage.warning('二维码裁剪失败，已下载原始图片')
    downloadBlob(qrBlob.value, `${row.name}-场所二维码.jpg`)
  }
}
async function downloadPoster() {
  const canvas = posterCanvas.value
  if (!canvas || !qrRow.value || !posterReady.value) return
  posterDownloading.value = true
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('海报导出失败')), 'image/png')
    })
    downloadBlob(blob, `${qrRow.value.name}-场所海报.png`)
  } catch {
    ElMessage.error('海报下载失败，请稍后重试')
  } finally {
    posterDownloading.value = false
  }
}
function search() {
  filters.page = 1
  load()
}
watch(() => filters.page, load)
watch(() => filters.pageSize, () => { filters.page = 1; load() })
onMounted(load)
</script>

<template>
  <div class="page">
    <section class="panel">
      <div class="toolbar">
        <el-input v-model="filters.search" placeholder="搜索场所名称或乡镇" clearable aria-label="搜索场所" @keyup.enter="search" @clear="search" />
        <el-button plain @click="search">查询</el-button>
        <div class="toolbar-actions">
          <el-button v-if="hasPerm('venues:edit') && admin?.allVenues" type="primary" :icon="Plus" @click="editVenue()">添加场所</el-button>
        </div>
      </div>
      <div class="table-region" tabindex="0" role="region" aria-label="场所列表">
        <el-table v-loading="loading" :data="list">
          <el-table-column type="index" label="序号" width="64" :index="rowIndex" />
          <el-table-column prop="name" label="场所名称" min-width="150" />
          <el-table-column prop="township" label="所在乡镇" min-width="110" />
          <el-table-column label="操作" width="280" fixed="right" align="right">
            <template #default="{ row }">
              <TableActions>
                <el-button size="small" type="primary" plain :aria-label="`下载${row.name}的场所二维码`" @click="openQr(row)">下载场所二维码</el-button>
                <el-button v-if="hasPerm('venues:edit')" size="small" type="primary" :aria-label="`编辑${row.name}`" @click="editVenue(row)">编辑</el-button>
                <el-button v-if="hasPerm('venues:delete')" size="small" type="danger" plain :aria-label="`删除${row.name}`" @click="remove(row)">删除</el-button>
              </TableActions>
            </template>
          </el-table-column>
          <template #empty>
            <p class="muted">{{ filters.search ? '没有找到匹配的场所，换个关键词试试' : '暂无场所，点击上方“添加场所”开始配置' }}</p>
          </template>
        </el-table>
      </div>
      <div class="pagination"><el-pagination v-model:current-page="filters.page" v-model:page-size="filters.pageSize" :total="total" :page-sizes="[5, 10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper" /></div>
    </section>

    <el-dialog v-model="editVisible" :title="editForm.id ? '修改场所' : '添加场所'" width="min(640px, 94vw)">
      <el-form label-position="top" @submit.prevent="saveVenue">
        <el-form-item label="场所名称" required><el-input v-model="editForm.name" maxlength="100" placeholder="请输入场所名称" /></el-form-item>
        <el-form-item label="所在乡镇" required>
          <el-select v-model="editForm.township" filterable allow-create default-first-option placeholder="选择所在乡镇">
            <el-option v-for="township in TOWNSHIPS" :key="township" :value="township" :label="township" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="editVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveVenue">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="qrVisible" :title="qrRow ? `${qrRow.name} · 二维码与海报` : '场所二维码与海报'" width="min(620px, 94vw)" @closed="resetQr">
      <div v-if="qrRow" class="qr-body">
        <div v-if="qrLoading" v-loading="true" element-loading-text="正在生成中，请稍等" class="qr-status" role="status" />
        <el-empty v-else-if="qrError" :description="qrError" :image-size="90">
          <el-button type="primary" @click="openQr(qrRow)">重新获取</el-button>
        </el-empty>
        <template v-else-if="qrBlob">
          <canvas v-show="posterReady" ref="posterCanvas" class="poster-preview" role="img" :aria-label="`${qrRow.name}场所海报预览`">当前浏览器不支持海报预览，可单独下载二维码。</canvas>
          <p v-if="!posterReady && !posterError" class="qr-hint" role="status">正在合成高清海报…</p>
          <p v-if="posterError" class="poster-error" role="alert">{{ posterError }}</p>
          <p class="qr-hint">扫码直达该场所公开信息。重复获取不会使已经张贴的旧二维码失效。</p>
          <div class="qr-actions">
            <el-button type="primary" :disabled="!posterReady" :loading="posterDownloading" @click="downloadPoster">下载高清海报</el-button>
            <el-button @click="downloadQr">仅下载二维码</el-button>
          </div>
        </template>
      </div>
      <template #footer>
        <div class="dialog-actions">
          <el-button @click="qrVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar .el-input { min-width: 200px; }
.el-select { width: 100%; }
.muted { color: var(--muted); font-size: 13px; }
.qr-body { display: grid; justify-items: center; gap: 14px; }
.qr-status { width: 100%; min-height: 240px; }
.poster-preview { display: block; width: min(100%, 340px); height: auto; border: 1px solid var(--line); border-radius: 8px; }
.qr-hint { margin: 0; color: #1c88cf; font-size: 14px; line-height: 1.6; text-align: center; }
.poster-error { margin: 0; color: #c45656; font-size: 14px; }
.qr-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
</style>
