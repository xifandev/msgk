export interface NavigationItem {
  path: string
  label: string
  /** 顶部标题栏展示的页面说明，一句话讲清这个页面做什么 */
  description: string
  permission: string | string[]
  icon: string
  /** 导航分组标题（目前仅用于底部运维工具组） */
  group?: string
  /** 仅系统管理员（super）可见和访问 */
  superOnly?: boolean
  /** 对列出的角色隐藏导航并禁止访问（按角色 code） */
  excludeRoleCodes?: string[]
}

export const NAVIGATION: NavigationItem[] = [
  { path: '/dashboard', label: '工作台', description: '全县公开上报进度、待办事项与本月数据总览。', permission: 'dashboard:view', icon: 'DataAnalysis' },
  { path: '/finance', label: '财务公开', description: '按月维护收支明细与结余，提交审核通过后向公众公开。', permission: 'finance:view', icon: 'Wallet' },
  { path: '/profiles', label: '场所介绍', description: '按场所维护登记信息与简介，提交审核通过后可向公众公开。', permission: 'venues:edit', icon: 'Document' },
  { path: '/personnel', label: '人员公开', description: '按场所维护教职与工作人员名册，审核通过后向公众公开。', permission: 'personnel:edit', icon: 'User' },
  { path: '/review', label: '场所信息审核', description: '统一处理场所介绍与人员名册审核，按待办和状态快速定位。', permission: ['venues:review', 'personnel:review'], icon: 'DocumentChecked' },
  { path: '/safety', label: '场所安全', description: '县级统一发布安全知识文章，发布后自动向全部场所公开；镇级和场所仅阅读。', permission: 'safety:view', icon: 'Reading' },
  { path: '/news', label: '政策法规', description: '维护政策法规文章及分类，发布后在小程序展示；镇级、场所管理员可在本页学习。', permission: 'news:view', icon: 'Reading' },
  { path: '/notices', label: '公告管理', description: '小程序公告面向公众展示，内部公告仅后台管理员可见。', permission: 'notices:edit', icon: 'Bell' },
  { path: '/my-notices', label: '我的通知', description: '面向管理员的内部公告，打开详情后自动标记为已读。', permission: 'notices:view', icon: 'Message', excludeRoleCodes: ['county'] },
  { path: '/admins', label: '管理员', description: '配置登录手机号、功能角色和可管理的场所。', permission: 'system:admins', icon: 'Avatar' },
  { path: '/venues', label: '场所管理', description: '维护宗教活动场所的基础信息，实时获取场所二维码和高清海报。', permission: 'venues:view', icon: 'OfficeBuilding' },
  { path: '/manual', label: '使用手册', description: '按步骤了解各栏目的录入、审核与公开流程。', permission: 'dashboard:view', icon: 'Guide' },
  { path: '/handover', label: '账号交接', description: '将本账号的角色与场所管理权限整体交接给新管理员。', permission: 'dashboard:view', icon: 'Switch' },
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
