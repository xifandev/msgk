<script setup lang="ts">
// 兜底路由：所有未匹配的路径（乱写地址、页面不存在）统一重定向到首页
await navigateTo('/', { redirectCode: 302 })
</script>

<template>
  <div />
</template>
