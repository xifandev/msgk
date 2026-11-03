export function errorMessage(error: unknown) {
  return (error as { data?: { message?: string }, message?: string })?.data?.message
    ?? (error as { message?: string })?.message
    ?? '操作失败，请稍后重试'
}
