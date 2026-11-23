import { defineStore } from 'pinia'
import { ref } from 'vue'
import { AUTH_BASE } from '@/stores/auth'
import { authRequest } from '@/lib/apiKeys'

const call = (path, options) => authRequest(AUTH_BASE, path, options)

/**
 * Gateway API keys of the logged-in account (/API tab) and, for admins, of
 * everybody (/ADMIN tab). Auth issues and revokes the keys; the Gateway checks them.
 */
export const useApiKeysStore = defineStore('apiKeys', () => {
  // { tier, limits: { maxKeys, perMinute, perDay }, issuing, keys: [...] }
  const mine = ref(null)
  const status = ref('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const error = ref(null)
  // { token, key } right after creating a key; the token is never shown again
  const created = ref(null)
  const busy = ref(false)

  // GET /api/admin/api-keys
  const admin = ref(null)
  const adminStatus = ref('idle')
  const adminError = ref(null)

  function reset() {
    mine.value = null
    created.value = null
    admin.value = null
    status.value = 'idle'
    adminStatus.value = 'idle'
    error.value = null
    adminError.value = null
  }

  async function loadMine() {
    status.value = 'loading'
    try {
      mine.value = await call('/api/me/api-keys')
      error.value = null
      status.value = 'ready'
    } catch (err) {
      error.value = err.message
      status.value = 'error'
    }
  }

  /** Runs a change, shows its error, and reloads the list either way. */
  async function change(action, reload) {
    busy.value = true
    try {
      await action()
      error.value = null
      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      busy.value = false
      await reload()
    }
  }

  function create(label) {
    return change(async () => {
      created.value = await call('/api/me/api-keys', { method: 'POST', body: { label } })
    }, loadMine)
  }

  function revoke(id) {
    return change(() => call(`/api/me/api-keys/${id}`, { method: 'DELETE' }), loadMine)
  }

  async function loadAdmin() {
    adminStatus.value = 'loading'
    try {
      admin.value = await call('/api/admin/api-keys')
      adminError.value = null
      adminStatus.value = 'ready'
    } catch (err) {
      adminError.value = err.message
      adminStatus.value = 'error'
    }
  }

  async function adminChange(action) {
    busy.value = true
    try {
      await action()
      adminError.value = null
    } catch (err) {
      adminError.value = err.message
    } finally {
      busy.value = false
      await loadAdmin()
    }
  }

  const adminRevoke = (id) => adminChange(() => call(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' }))
  const setTier = (discordId, tier) =>
    adminChange(() => call(`/api/admin/accounts/${discordId}/tier`, { method: 'PUT', body: { tier } }))
  const setSettings = (patch) => adminChange(() => call('/api/admin/settings', { method: 'PUT', body: patch }))

  return {
    mine, status, error, created, busy, admin, adminStatus, adminError,
    reset, loadMine, create, revoke, loadAdmin, adminRevoke, setTier, setSettings,
  }
})
