export interface AdminUser {
  id: number
  phone: string
  name: string
  roleId: number
  roleName: string
  roleCode: string
  permissions: string[]
  venueIds: number[]
  allVenues: boolean
  noticeEnabled: boolean
}

export function useAdmin() {
  const admin = useState<AdminUser | null>('admin', () => null)
  const venues = useState<{ id: number, name: string, township: string }[]>('admin-venues', () => [])

  async function fetchMe(force = false) {
    if (admin.value && !force) return admin.value
    try {
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
      const response = await $fetch<{ admin: AdminUser, venues: typeof venues.value }>('/api/auth/me', { headers })
      admin.value = response.admin
      venues.value = response.venues
    } catch {
      admin.value = null
      venues.value = []
    }
    return admin.value
  }

  function hasPerm(code: string) {
    const permissions = admin.value?.permissions ?? []
    return permissions.includes('*') || permissions.includes(code)
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    admin.value = null
    venues.value = []
    await navigateTo('/login')
  }

  return { admin, venues, fetchMe, hasPerm, logout }
}
