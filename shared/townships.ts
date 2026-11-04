/** 沂水县乡镇/街道固定枚举（沿用旧系统 place.vue 的 16 项，顺序即展示顺序）。 */
export const TOWNSHIPS = [
  '沂城街道',
  '龙家圈街道',
  '道托镇',
  '高桥镇',
  '马站镇',
  '杨庄镇',
  '富官庄镇',
  '圈里乡',
  '沙沟镇',
  '黄山铺镇',
  '夏蔚镇',
  '高庄镇',
  '泉庄镇',
  '院东头镇',
  '四十里堡镇',
  '崔家峪镇'
] as const

/** 乡镇名 → 排序序号，未知乡镇统一排在最后 */
export const TOWNSHIP_ORDER: Record<string, number> = TOWNSHIPS.reduce<Record<string, number>>(
  (map, township, index) => ({ ...map, [township]: index }),
  {}
)

export function townshipRank(township: string): number {
  return TOWNSHIP_ORDER[township] ?? TOWNSHIPS.length
}

/** 乡镇优先、其次场所名称的比较函数，用于前端对未排序的场所列表兜底 */
export function compareTownship(a: string, b: string): number {
  return townshipRank(a) - townshipRank(b) || a.localeCompare(b, 'zh-Hans-CN')
}
