<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <main class="auth-layout">
    <header class="auth-logo">沂水宗教码上公开管理系统</header>
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
  padding: 90px 24px 110px;
  overflow: hidden;
  background-color: #1278e4;
}

/* 左上角系统名称 */
.auth-logo {
  position: absolute;
  top: 33px;
  left: 35px;
  color: #fff;
  font-size: clamp(22px, 2.2vw, 30px);
  font-weight: 900;
  letter-spacing: -.8px;
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
