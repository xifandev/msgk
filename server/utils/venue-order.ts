import { TOWNSHIPS } from '../../shared/townships'

/**
 * 生成按固定乡镇顺序排序的 SQL 表达式。
 * MySQL 对中文字段的默认排序是按编码，与业务要求（旧系统乡镇顺序）不一致，
 * 因此所有场所列表统一使用该表达式排序，保证后台与小程序顺序一致。
 */
export function townshipOrderSql(column = 'township'): string {
  const cases = TOWNSHIPS.map((township, index) => `WHEN '${township}' THEN ${index}`).join(' ')
  return `CASE ${column} ${cases} ELSE ${TOWNSHIPS.length} END`
}
