export type ReviewAction = 'submit' | 'approve' | 'reject' | 'reopen'

export function nextReviewState(state: string, roleCode: string, action: ReviewAction): string {
  if (action === 'reopen') {
    if (!['approved', 'rejected', 'pending_town', 'pending_county'].includes(state)) {
      throw createError({ statusCode: 409, message: '当前状态不能重新编辑' })
    }
    return 'draft'
  }
  if (action === 'submit') {
    if (!['draft', 'rejected'].includes(state)) {
      throw createError({ statusCode: 409, message: '只有编辑中或审核失败的内容可以提交' })
    }
    if (['county', 'super'].includes(roleCode)) return 'approved'
    if (roleCode === 'town') return 'pending_county'
    return 'pending_town'
  }
  if (action === 'approve') {
    if (state === 'pending_town' && !['county', 'super'].includes(roleCode)) return 'pending_county'
    if (['county', 'super', 'custom'].includes(roleCode) || roleCode.startsWith('custom-')) {
      if (state === 'pending_county') return 'approved'
    }
    if (['county', 'super'].includes(roleCode) && state === 'pending_county') return 'approved'
    throw createError({ statusCode: 409, message: '当前账号不能审核这个阶段的内容' })
  }
  if (action === 'reject') {
    if (roleCode === 'town' && state === 'pending_town') return 'rejected'
    if (['county', 'super'].includes(roleCode) && state === 'pending_county') return 'rejected'
    if (roleCode.startsWith('custom-') && ['pending_town', 'pending_county'].includes(state)) return 'rejected'
    throw createError({ statusCode: 409, message: '当前账号不能驳回这个阶段的内容' })
  }
  throw createError({ statusCode: 400, message: '不支持的审核操作' })
}

export function reviewUpdate(action: ReviewAction, nextState: string, reason = '', roleCode = '', previousState = '') {
  const data: Record<string, unknown> = { state: nextState }
  if (action === 'submit') {
    data.submitted_at = new Date()
    data.town_note = null
    data.town_reviewed_at = null
    data.county_note = null
    data.county_reviewed_at = null
  } else if (action === 'reopen') {
    data.published = 0
    data.submitted_at = null
    data.town_note = null
    data.town_reviewed_at = null
    data.county_note = null
    data.county_reviewed_at = null
  } else if (nextState === 'pending_county') {
    data.town_note = reason || '审核通过'
    data.town_reviewed_at = new Date()
  } else if (nextState === 'approved') {
    data.county_note = reason || '审核通过'
    data.county_reviewed_at = new Date()
  } else if (nextState === 'rejected') {
    if (roleCode === 'town' || previousState === 'pending_town') {
      data.town_note = reason
      data.town_reviewed_at = new Date()
    } else {
      data.county_note = reason
      data.county_reviewed_at = new Date()
    }
  }
  return data
}
