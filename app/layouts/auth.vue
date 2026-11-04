<template>
  <main class="auth-layout">
    <div class="auth-glow" aria-hidden="true" />
    <slot />
  </main>
</template>

<style scoped>
.auth-layout {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
  background:
    radial-gradient(900px 520px at 8% -10%, #e6eefb 0%, transparent 62%),
    radial-gradient(760px 460px at 102% 106%, #e8f0fb 0%, transparent 58%),
    linear-gradient(180deg, #f7f9fd 0%, #eef3fa 100%);
}
.auth-layout::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgb(23 84 156 / 5%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(23 84 156 / 5%) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 40%, #000 20%, transparent 78%);
  pointer-events: none;
}
.auth-glow {
  position: absolute;
  inset-block-start: -220px;
  inset-inline-end: -180px;
  width: 620px;
  height: 620px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(23 84 156 / 12%) 0%, transparent 68%);
  pointer-events: none;
}
</style>
