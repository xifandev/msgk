<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <main class="auth-layout">
    <header class="auth-logo">
      <span class="auth-logo-bar" aria-hidden="true" />
      <span class="auth-logo-text">
        <strong>沂水宗教码上公开管理系统</strong>
        <small>YISHUI RELIGIOUS AFFAIRS OPEN PLATFORM</small>
      </span>
    </header>
    <slot />
    <footer class="auth-footer">
      <p>技术支持：山东盖特网络有限公司</p>
      <p>
        Copyright © 2023-{{ year }} All Rights Reserved
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">鲁ICP备2023008080号</a>
      </p>
    </footer>
  </main>
</template>

<style scoped>
.auth-layout {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: clamp(80px, 12vh, 96px) 24px clamp(96px, 14vh, 116px);
  overflow-x: hidden;
  overflow-y: auto;
  background-color: #1278e4;
}

/* 左上角系统名称 */
.auth-logo {
  position: absolute;
  top: 36px;
  left: 38px;
  display: flex;
  align-items: stretch;
  gap: 14px;
  color: #fff;
}
.auth-logo-bar {
  width: 5px;
  border-radius: 3px;
  background: linear-gradient(180deg, #fff 0%, rgb(255 255 255 / 35%) 100%);
  box-shadow: 0 0 12px rgb(255 255 255 / 45%);
}
.auth-logo-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding-block: 2px;
}
.auth-logo-text strong {
  font-size: clamp(22px, 2.2vw, 30px);
  font-weight: 800;
  letter-spacing: 1.5px;
  line-height: 1.2;
  text-shadow: 0 2px 12px rgb(0 30 70 / 35%);
}
.auth-logo-text small {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 3.5px;
  color: rgb(255 255 255 / 55%);
}

/* 左下角备案信息 */
.auth-footer {
  position: absolute;
  left: 32px;
  bottom: 28px;
  color: #fff;
  opacity: .75;
  font-size: 13px;
  line-height: 1.8;
}
.auth-footer p { margin: 0; }
.auth-footer a { color: #fff; text-decoration: none; }
.auth-footer a:hover { text-decoration: underline; }

@media (max-width: 760px) {
  .auth-layout { padding: 84px 16px 120px; }
  .auth-logo { top: 24px; left: 20px; right: 20px; }
  .auth-footer { left: 20px; right: 20px; bottom: 20px; font-size: 12px; }
}
</style>
