export interface NavigationItem {
  path: string
  label: string
  /** 顶部标题栏展示的页面说明，一句话讲清这个页面做什么 */
  description: string
  permission: string
  icon: string
  /** 导航分组标题（目前仅用于底部运维工具组） */
  group?: string
  /** 仅系统管理员（super）可见和访问 */
  superOnly?: boolean
}

export const NAVIGATION: NavigationItem[] = [
  { path: '/dashboard', label: '工作台', description: '全县公开报送进度、待办事项与本月数据总览。', permission: 'dashboard:view', icon: 'DataAnalysis' },
  { path: '/venues', label: '场所管理', description: '维护宗教活动场所的基础信息、图片与二维码，按乡镇和排序值排列。', permission: 'venues:view', icon: 'OfficeBuilding' },
  { path: '/profiles', label: '场所介绍', description: '按场所维护登记信息与简介，提交审核通过后可向公众公开。', permission: 'venues:edit', icon: 'Document' },
  { path: '/profiles/review', label: '场所介绍审核', description: '查看场所登记资料，完成镇级或县级审核。', permission: 'venues:review', icon: 'DocumentChecked' },
  { path: '/personnel', label: '人员公开', description: '按场所维护教职与工作人员名册，审核通过后向公众公开。', permission: 'personnel:edit', icon: 'User' },
  { path: '/personnel/review', label: '人员审核', description: '按场所核对人员名册，审核通过后由场所自行决定是否公开。', permission: 'personnel:review', icon: 'UserFilled' },
  { path: '/safety', label: '场所安全', description: '编写安全知识文章并关联场所，两级审核通过后向公众公开。', permission: 'safety:view', icon: 'Warning' },
  { path: '/finance', label: '财务公开', description: '按月维护收支明细与结余，提交审核通过后向公众公开。', permission: 'finance:view', icon: 'Wallet' },
  { path: '/news', label: '新闻与法规', description: '维护新闻与法规文章及分类，发布后在小程序展示。', permission: 'news:view', icon: 'Reading' },
  { path: '/notices', label: '公告管理', description: '小程序公告面向公众展示，内部公告仅后台管理员可见。', permission: 'notices:edit', icon: 'Bell' },
  { path: '/my-notices', label: '我的通知', description: '面向管理员的内部公告，打开详情后自动标记为已读。', permission: 'notices:view', icon: 'Message' },
  { path: '/admins', label: '管理员', description: '配置登录手机号、功能角色和可管理的场所。', permission: 'system:admins', icon: 'Avatar' },
  { path: '/manual', label: '使用手册', description: '按步骤了解各栏目的录入、审核与公开流程。', permission: 'dashboard:view', icon: 'Guide' },
  { path: '/settings', label: '个人设置', description: '查看当前账号信息、数据权限范围与通知偏好。', permission: 'dashboard:view', icon: 'Setting' },
  { path: '/logs', label: '操作日志', description: '记录登录用户在后台执行的数据变更和审核操作。', permission: 'system:logs', icon: 'List', group: '运维工具', superOnly: true },
  { path: '/roles', label: '角色权限', description: '功能权限与场所数据范围分开管理，修改后实时生效。', permission: 'system:roles', icon: 'Key', group: '运维工具', superOnly: true }
]

/** 按路由匹配导航项：优先精确匹配，其次取最长前缀匹配 */
export function navigationFor(path: string): NavigationItem | undefined {
  const clean = path.replace(/\/+$/, '') || '/'
  const exact = NAVIGATION.find((item) => item.path === clean)
  if (exact) return exact
  return NAVIGATION
    .filter((item) => clean.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}
