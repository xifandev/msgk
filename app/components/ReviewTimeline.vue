<script setup lang="ts">
import { REVIEW_LABELS, REVIEW_TAG_TYPES } from '~~/shared/review'

const props = defineProps<{ record: Record<string, any> }>()
const items = computed(() => [
  { label: '提交审核', value: props.record.submitted_at, note: '内容已提交' },
  { label: '镇级审核', value: props.record.town_reviewed_at, note: props.record.town_note },
  { label: '县级审核', value: props.record.county_reviewed_at, note: props.record.county_note }
].filter((item) => item.value || item.note))
</script>

<template>
  <div class="review-status">
    <el-tag :type="REVIEW_TAG_TYPES[record.state] ?? 'info'" size="large">{{ REVIEW_LABELS[record.state] ?? record.state }}</el-tag>
    <el-tag v-if="record.state === 'approved'" :type="record.published ? 'success' : 'info'" effect="plain">
      {{ record.published ? '已公开' : '未公开' }}
    </el-tag>
    <el-timeline v-if="items.length" class="timeline">
      <el-timeline-item v-for="item in items" :key="item.label" :timestamp="String(item.value)">
        <strong>{{ item.label }}</strong><p v-if="item.note">{{ item.note }}</p>
      </el-timeline-item>
    </el-timeline>
    <p v-else class="muted">保存内容后提交审核，审核记录会显示在这里。</p>
  </div>
</template>

<style scoped>
.review-status { display: grid; gap: 16px; }
.timeline { margin-block-start: 12px; }
.timeline p { margin: 5px 0 0; color: var(--muted); white-space: pre-wrap; }
</style>
