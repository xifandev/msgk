<script setup lang="ts">
useHead({ title: '使用手册 | 码上公开' })
const sections = [
  { title: '场所与介绍', body: '先在“场所配置”建立场所，再在“场所介绍”填写登记信息、地址和简介。保存后提交审核，审核通过并开启公开，小程序才会显示。' },
  { title: '人员公开', body: '按场所维护管理人员，上传照片并填写姓名、性别、教职和职务。人员信息以场所为单位统一提交审核。' },
  { title: '安全动态', body: '创建安全文章并选择关联场所。文章经过镇级、县级审核后，由有权限的管理员开启公开。' },
  { title: '财务公开', body: '为场所创建月度账单，录入收入和支出明细。系统自动汇总收入、支出和本月结余，明细日期必须属于账单月份。' },
  { title: '新闻与公告', body: '新闻与法规按分类发布；公告分为小程序公告和内部公告，内部公告可在“我的通知”中查看并标记已读。' },
  { title: '权限与审核', body: '角色决定能执行哪些功能，管理员的数据范围决定能管理哪些场所。镇级处理待镇级审核内容，县级处理待县级审核内容。' }
]
</script>

<template>
  <div class="page"><div class="page-header"><div><h1>使用手册</h1><p>码上公开后台常用操作流程。</p></div></div><section class="panel manual-grid"><article v-for="section in sections" :key="section.title"><h2>{{ section.title }}</h2><p>{{ section.body }}</p></article><article><h2>需要帮助</h2><p>如遇到账号未开通、场所权限缺失或短信无法接收，请联系系统管理员处理。</p></article></section></div>
</template>

<style scoped>
.manual-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
article h2 { margin: 0; color: var(--brand-dark); font-size: 20px; }
article p { margin-block-end: 0; color: var(--muted); }
@media (max-width: 700px) { .manual-grid { grid-template-columns: 1fr; } }
</style>
