import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const AUTH_BASE = import.meta.env.VITE_AUTH_URL ?? 'https://auth.scanlake.rocks'

/**
 * Optional Discord login, shared by every *.scanlake.rocks app through the
 * sl_session cookie that auth.scanlake.rocks sets. Login is never required:
 * when the auth service is unreachable the dashboard just runs logged out.
 */
export const useAuthStore = defineStore('auth', () => {
  // { discord: { id, username, globalName, avatarUrl }, primaryUserId, userIds, profile: { userName, org } }
  const me = ref(null)
  const status = ref('idle') // 'idle' | 'loading' | 'ready' | 'error'

  const isLoggedIn = computed(() => me.value !== null)
  const userIds = computed(() => me.value?.userIds ?? [])

  async function load() {
    status.value = 'loading'
    try {
      const res = await fetch(`${AUTH_BASE}/api/me`, { credentials: 'include' })
      me.value = res.ok ? await res.json() : null
      status.value = res.ok || res.status === 401 ? 'ready' : 'error'
    } catch (err) {
      // Auth is optional — treat an unreachable service as logged out
      console.warn('[auth] /api/me failed:', err.message)
      me.value = null
      status.value = 'error'
    }
  }

  function login() {
    location.href = `${AUTH_BASE}/login?return_to=${encodeURIComponent(location.href)}`
  }

  async function logout() {
    try {
      await fetch(`${AUTH_BASE}/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      console.warn('[auth] logout failed:', err.message)
    }
    // Ask the server rather than assume: the cookie may still be there if the call failed
    await load()
  }

  return { me, status, isLoggedIn, userIds, load, login, logout }
})
