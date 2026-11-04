import { NAVIGATION } from '~~/shared/navigation'

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return
  const { admin, fetchMe, hasPerm } = useAdmin()
  await fetchMe()
  if (!admin.value) return navigateTo('/login')
  if (to.path === '/') return navigateTo('/dashboard')
  const item = NAVIGATION.find((entry) => entry.path === to.path)
  const required = (to.meta.permission as string | string[] | undefined) ?? item?.permission
  if (item?.superOnly && admin.value?.roleCode !== 'super') return navigateTo('/dashboard')
  if (item?.excludeRoleCodes?.includes(admin.value.roleCode)) return navigateTo('/dashboard')
  const allowed = Array.isArray(required) ? required.some((code) => hasPerm(code)) : !required || hasPerm(required)
  if (!allowed) return navigateTo('/dashboard')
})
