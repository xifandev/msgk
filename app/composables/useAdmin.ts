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
  organization: string | null
  noticeEnabled: boolean
}

export interface Impersonator {
  id: number
  name: string
}

export function useAdmin() {
  const admin = useState<AdminUser | null>('admin', () => null)
  const venues = useState<{ id: number, name: string, township: string }[]>('admin-venues', () => [])
  const impersonator = useState<Impersonator | null>('admin-impersonator', () => null)

  async function fetchMe(force = false) {
    if (admin.value && !force) return admin.value
    try {
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
      const response = await $fetch<{ admin: AdminUser, venues: typeof venues.value, impersonator: Impersonator | null }>('/api/auth/me', { headers })
      admin.value = response.admin
      venues.value = response.venues
      impersonator.value = response.impersonator ?? null
    } catch {
      admin.value = null
      venues.value = []
      impersonator.value = null
    }
    return admin.value
  }

  function hasPerm(code: string) {
    const permissions = admin.value?.permissions ?? []
    return permissions.includes('*') || permissions.includes(code)
  }

  async function stopImpersonate() {
    await $fetch('/api/auth/stop-impersonate', { method: 'POST' })
    await fetchMe(true)
    await navigateTo('/dashboard')
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    admin.value = null
    venues.value = []
    impersonator.value = null
    await navigateTo('/login')
  }

  return { admin, venues, impersonator, fetchMe, hasPerm, stopImpersonate, logout }
}
