<template>
  <main class="auth-layout">
    <slot />
  </main>
</template>

<style scoped>
.auth-layout { min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: linear-gradient(145deg, #7f1d2d, #b7202e 45%, #f4e8e8); }
</style>
