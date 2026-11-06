<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ChatLineSquare, Check, CopyDocument, InfoFilled } from '@element-plus/icons-vue'

const WECHAT_ID = '15224499331'
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyWechat() {
  try {
    await navigator.clipboard.writeText(WECHAT_ID)
    copied.value = true
    ElMessage.success('微信号已复制')
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 1600)
  } catch {
    ElMessage.error('复制失败，请手动记录微信号')
  }
}

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="page support-page">
    <section class="support-card" aria-labelledby="support-title">
      <header class="support-hero">
        <div class="support-symbol" aria-hidden="true">
          <el-icon><ChatLineSquare /></el-icon>
        </div>
        <div>
          <p class="support-kicker">系统使用支持</p>
          <h2 id="support-title">遇到问题，随时联系工程师</h2>
          <p class="support-intro">如果您在使用系统时遇到任何操作问题、功能疑问或不明白的地方，请随时联系工程师，我们会协助您解决。</p>
        </div>
      </header>

      <div class="support-content">
        <section class="wechat-card" aria-labelledby="wechat-title">
          <span class="contact-tag">方式一 · 搜索微信号</span>
          <div class="contact-icon" aria-hidden="true">
            <el-icon><ChatLineSquare /></el-icon>
          </div>
          <h3 id="wechat-title">搜索添加工程师</h3>
          <strong class="wechat-number">{{ WECHAT_ID }}</strong>
          <p>打开微信搜索该号码，添加工程师后即可咨询。</p>
          <el-button type="primary" @click="copyWechat">
            <el-icon><Check v-if="copied" /><CopyDocument v-else /></el-icon>
            {{ copied ? '已复制' : '复制微信号' }}
          </el-button>
        </section>

        <figure class="qr-card">
          <span class="contact-tag">方式二 · 微信扫码</span>
          <div class="qr-frame">
            <img src="/images/manual-support.png" width="220" height="220" alt="技术支持工程师微信二维码">
          </div>
          <figcaption>
            <strong>微信扫码添加</strong>
            <span>扫一扫即可添加工程师为好友</span>
          </figcaption>
        </figure>
      </div>

      <footer class="support-note">
        <el-icon aria-hidden="true"><InfoFilled /></el-icon>
        <p>咨询时请说明所在场所；如涉及页面异常，建议同时提供页面截图。</p>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.support-page { max-width: 1080px; }
.support-card {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: 0 4px 18px rgb(16 24 40 / 4%);
}
.support-hero {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 36px 40px 32px;
  border-block-end: 1px solid #e9eef5;
  background: #f8fafd;
}
.support-symbol {
  display: grid;
  place-items: center;
  flex: none;
  width: 56px;
  height: 56px;
  border: 1px solid #d6e4f3;
  border-radius: 15px;
  background: #edf4fb;
  color: var(--brand);
  font-size: 28px;
}
.support-kicker {
  margin: 0 0 4px;
  color: var(--brand);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 2px;
}
.support-hero h2 {
  margin: 0;
  color: #182230;
  font-size: 26px;
  font-weight: 650;
  line-height: 1.45;
  letter-spacing: .5px;
}
.support-intro {
  max-width: 740px;
  margin: 10px 0 0;
  color: #667085;
  font-size: 15px;
  line-height: 1.9;
}
.support-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  align-items: stretch;
  gap: 28px;
  padding: 34px 40px 36px;
}
.wechat-card,
.qr-card {
  min-height: 344px;
  padding: 26px 28px;
  border: 1px solid #e5eaf0;
  border-radius: 14px;
  background: #fbfcfe;
  text-align: center;
}
.wechat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.contact-tag {
  color: #667085;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 1.5px;
}
.contact-icon {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin-block-start: 16px;
  border: 1px solid #d6e4f3;
  border-radius: 50%;
  background: #edf4fb;
  color: var(--brand);
  font-size: 34px;
}
.wechat-card h3 {
  margin: 18px 0 8px;
  color: #344054;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: .5px;
}
.wechat-number {
  color: #173f70;
  font-size: 32px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
  user-select: all;
}
.wechat-card p {
  margin: 12px 0 20px;
  color: #667085;
  font-size: 13px;
  line-height: 1.7;
}
.wechat-card .el-button { min-width: 160px; margin: 0; }
.wechat-card .el-icon { margin-inline-end: 6px; }
.qr-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
}
.qr-frame {
  width: min(220px, 100%);
  margin-block-start: 16px;
  padding: 9px;
  border: 1px solid #e7ebf0;
  border-radius: 10px;
  background: #fff;
}
.qr-frame img { display: block; width: 100%; height: auto; aspect-ratio: 1; object-fit: contain; }
.qr-card figcaption { display: grid; gap: 4px; margin-block-start: 14px; }
.qr-card figcaption strong { color: #344054; font-size: 16px; font-weight: 650; }
.qr-card figcaption span { color: #667085; font-size: 12px; line-height: 1.6; }
.support-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 40px;
  border-block-start: 1px solid var(--line);
  background: #fcfcfd;
  color: #667085;
  font-size: 13px;
}
.support-note .el-icon { flex: none; margin-block-start: 4px; color: #7b8da3; }
.support-note p { margin: 0; line-height: 1.7; }

@media (max-width: 1000px) {
  .support-content { grid-template-columns: minmax(0, 1fr) 280px; gap: 22px; padding-inline: 28px; }
  .support-hero { padding-inline: 28px; }
  .support-note { padding-inline: 28px; }
  .wechat-number { font-size: 28px; }
}
@media (max-width: 760px) {
  .support-hero { gap: 14px; padding: 26px 22px; }
  .support-symbol { width: 46px; height: 46px; font-size: 23px; }
  .support-hero h2 { font-size: 22px; }
  .support-content { grid-template-columns: 1fr; padding: 26px 22px; }
  .wechat-card,
  .qr-card { min-height: 0; }
  .qr-card { width: min(320px, 100%); margin-inline: auto; }
  .support-note { padding-inline: 22px; }
}
</style>
