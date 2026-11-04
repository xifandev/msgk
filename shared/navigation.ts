export interface NavigationItem {
  path: string
  label: string
  permission: string
  icon: string
  /** 导航分组标题（目前仅用于底部运维工具组） */
  group?: string
  /** 仅系统管理员（super）可见和访问 */
  superOnly?: boolean
}

export const NAVIGATION: NavigationItem[] = [
  { path: '/dashboard', label: '工作台', permission: 'dashboard:view', icon: 'DataAnalysis' },
  { path: '/venues', label: '场所配置', permission: 'venues:view', icon: 'OfficeBuilding' },
  { path: '/profiles', label: '场所介绍', permission: 'venues:edit', icon: 'Document' },
  { path: '/profiles/review', label: '介绍审核', permission: 'venues:review', icon: 'DocumentChecked' },
  { path: '/personnel', label: '人员公开', permission: 'personnel:edit', icon: 'User' },
  { path: '/personnel/review', label: '人员审核', permission: 'personnel:review', icon: 'UserFilled' },
  { path: '/safety', label: '场所安全', permission: 'safety:view', icon: 'Warning' },
  { path: '/finance', label: '财务公开', permission: 'finance:view', icon: 'Wallet' },
  { path: '/news', label: '新闻与法规', permission: 'news:view', icon: 'Reading' },
  { path: '/notices', label: '公告管理', permission: 'notices:edit', icon: 'Bell' },
  { path: '/my-notices', label: '我的通知', permission: 'notices:view', icon: 'Message' },
  { path: '/admins', label: '管理员', permission: 'system:admins', icon: 'Avatar' },
  { path: '/manual', label: '使用手册', permission: 'dashboard:view', icon: 'Guide' },
  { path: '/settings', label: '个人设置', permission: 'dashboard:view', icon: 'Setting' },
  { path: '/logs', label: '操作日志', permission: 'system:logs', icon: 'List', group: '运维工具', superOnly: true },
  { path: '/roles', label: '角色权限', permission: 'system:roles', icon: 'Key', group: '运维工具', superOnly: true }
]
