<script setup lang="ts">
export interface StateTabItem { value: string, label: string, count: number }

withDefaults(defineProps<{ tabs: StateTabItem[], modelValue: string, ariaLabel?: string }>(), {
  ariaLabel: '审核状态筛选'
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <nav class="state-tabs" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="tab in tabs"
      :key="tab.value || 'all'"
      type="button"
      role="tab"
      class="state-tab"
      :class="{ active: modelValue === tab.value }"
      :aria-selected="modelValue === tab.value"
      @click="emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}<em>{{ tab.count }}</em>
    </button>
  </nav>
</template>

<style scoped>
.state-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.state-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: #475467;
  cursor: pointer;
  font-size: 13px;
  transition: border-color .15s, background-color .15s, color .15s;
}
.state-tab em { min-width: 22px; padding: 0 6px; border-radius: 999px; background: #eef1f5; color: var(--muted); font-style: normal; font-size: 11px; line-height: 20px; text-align: center; font-variant-numeric: tabular-nums; }
.state-tab:hover { border-color: var(--el-color-primary-light-5); color: var(--brand); }
.state-tab.active { border-color: var(--brand); background: var(--brand); color: #fff; }
.state-tab.active em { background: rgb(255 255 255 / 20%); color: #fff; }
.state-tab:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .state-tab { transition: none; } }
</style>
