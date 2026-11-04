<script setup lang="ts">
const route = useRoute()
await navigateTo({ path: '/review', query: { ...route.query, type: 'personnel' } }, { replace: true })
</script>

<template>
  <div class="page" aria-label="正在前往场所信息审核" />
</template>
