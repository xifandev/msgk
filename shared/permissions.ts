export interface PermissionDefinition {
  code: string
  name: string
  group: string
}

export const PERMISSIONS: PermissionDefinition[] = [
  { code: 'dashboard:view', name: '查看工作台', group: '工作台' },
  { code: 'venues:view', name: '查看场所', group: '场所管理' },
  { code: 'venues:edit', name: '编辑场所与介绍', group: '场所管理' },
  { code: 'venues:delete', name: '删除场所', group: '场所管理' },
  { code: 'venues:review', name: '审核场所介绍', group: '场所管理' },
  { code: 'venues:publish', name: '设置场所公开状态', group: '场所管理' },
  { code: 'personnel:view', name: '查看人员', group: '人员公开' },
  { code: 'personnel:edit', name: '编辑人员', group: '人员公开' },
  { code: 'personnel:review', name: '审核人员', group: '人员公开' },
  { code: 'personnel:publish', name: '设置人员公开状态', group: '人员公开' },
  // 场所安全：仅县级可发布/编辑/删除/设置公开，镇级与场所仅查看；不设审核
  { code: 'safety:view', name: '查看安全文章', group: '场所安全' },
  { code: 'safety:edit', name: '编辑安全文章', group: '场所安全' },
  { code: 'safety:delete', name: '删除安全文章', group: '场所安全' },
  { code: 'safety:publish', name: '设置安全公开状态', group: '场所安全' },
  { code: 'news:view', name: '查看政策法规', group: '政策法规' },
  { code: 'news:edit', name: '编辑政策文章与分类', group: '政策法规' },
  { code: 'news:delete', name: '删除政策文章与分类', group: '政策法规' },
  { code: 'news:publish', name: '发布政策文章', group: '政策法规' },
  { code: 'notices:view', name: '查看公告', group: '公告通知' },
  { code: 'notices:edit', name: '编辑公告', group: '公告通知' },
  { code: 'notices:delete', name: '删除公告', group: '公告通知' },
  { code: 'notices:publish', name: '发布公告', group: '公告通知' },
  { code: 'finance:view', name: '查看财务', group: '财务公开' },
  { code: 'finance:edit', name: '编辑账单与明细', group: '财务公开' },
  { code: 'finance:delete', name: '删除账单与明细', group: '财务公开' },
  { code: 'finance:review', name: '审核财务', group: '财务公开' },
  { code: 'finance:publish', name: '设置财务公开状态', group: '财务公开' },
  { code: 'system:admins', name: '管理管理员', group: '系统设置' },
  { code: 'system:roles', name: '管理角色', group: '系统设置' }
  // system:logs（操作日志）仅系统管理员可见，不对外开放，故不在可分配权限列表中
]

export const COUNTY_PERMISSIONS = PERMISSIONS
  .map((item) => item.code)
  .filter((code) => !['system:admins', 'system:roles'].includes(code))

export const TOWN_PERMISSIONS = [
  'dashboard:view',
  'venues:view', 'venues:review', 'venues:publish',
  'personnel:view', 'personnel:review', 'personnel:publish',
  // 场所安全：镇级仅查看/阅读
  'safety:view',
  'news:view', 'notices:view',
  'finance:view', 'finance:review', 'finance:publish'
]

export const VENUE_PERMISSIONS = [
  'dashboard:view',
  'venues:view', 'venues:edit',
  'personnel:view', 'personnel:edit',
  // 场所安全：场所仅查看/阅读
  'safety:view',
  'news:view', 'notices:view',
  'finance:view', 'finance:edit'
]

export const REVIEW_STATES = ['draft', 'pending_town', 'pending_county', 'approved', 'rejected'] as const
export type ReviewState = typeof REVIEW_STATES[number]
