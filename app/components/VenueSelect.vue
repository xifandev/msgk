<script setup lang="ts">
const props = withDefaults(defineProps<{ modelValue: number | number[] | null, multiple?: boolean, clearable?: boolean, placeholder?: string }>(), { multiple: false, clearable: false, placeholder: '请选择场所' })
const emit = defineEmits<{ 'update:modelValue': [value: number | number[] | null] }>()
const { venues } = useAdmin()
const value = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) })
</script>

<template>
  <el-select v-model="value" :multiple="multiple" :clearable="clearable" filterable :placeholder="placeholder" aria-label="选择场所">
    <el-option v-for="venue in venues" :key="venue.id" :value="venue.id" :label="`${venue.name}（${venue.township}）`" />
  </el-select>
</template>
