<template>
  <div class="acct-view">
    <section class="acct-card">
      <header class="acct-head">
        <h2>Gateway API</h2>
        <p>
          Read the refined results and the consolidated scan data straight from the ScanLake Gateway:
          from a script, a notebook or your own tool. Anyone logged in with Discord can make a key.
        </p>
      </header>

      <div v-if="!auth.isLoggedIn" class="acct-login">
        <p v-if="auth.status === 'idle' || auth.status === 'loading'" class="acct-note">Checking login…</p>
        <template v-else>
          <p>Log in with Discord to create a key.</p>
          <button class="btn-primary" @click="auth.login()">Login with Discord</button>
        </template>
      </div>

      <p v-else-if="!keys.mine && keys.status === 'loading'" class="acct-note">Loading your keys…</p>

      <template v-else-if="keys.mine">
        <dl class="acct-limits">
          <div><dt>Tier</dt><dd>{{ keys.mine.tier }}</dd></div>
          <div><dt>Requests / minute</dt><dd>{{ formatCount(limits.perMinute) }}</dd></div>
          <div><dt>Requests / day</dt><dd>{{ formatCount(limits.perDay) }}</dd></div>
          <div><dt>Keys</dt><dd>{{ activeKeys.length }} / {{ limits.maxKeys }}</dd></div>
        </dl>
        <p class="acct-note">The limits count for your account: all your keys share them.</p>

        <p v-if="keys.mine.tier === 'blocked'" class="acct-warn">This account can't create API keys.</p>
        <p v-else-if="!keys.mine.issuing" class="acct-warn">New keys are paused at the moment. Keys you already have keep working.</p>
        <p v-else-if="atLimit" class="acct-note">You have {{ limits.maxKeys }} active keys. Revoke one to make another.</p>
        <form v-else class="acct-create" @submit.prevent="onCreate">
          <input v-model="label" maxlength="64" placeholder="What is it for? (optional)" aria-label="Key label" />
          <button class="btn-primary" type="submit" :disabled="keys.busy">Create key</button>
        </form>
      </template>

      <p v-if="keys.error" class="panel-error">{{ keys.error }}</p>
    </section>

    <section v-if="keys.created" class="acct-card acct-token">
      <header class="acct-head">
        <h3>Your new key</h3>
        <p>Copy it now: it is shown only this once. ScanLake keeps only a hash of it.</p>
      </header>
      <div class="token-row">
        <code class="token">{{ keys.created.token }}</code>
        <button class="btn-secondary" @click="copy(keys.created.token)">{{ copied ? 'Copied' : 'Copy' }}</button>
        <button class="btn-ghost" @click="keys.created = null">Done</button>
      </div>
    </section>

    <section v-if="auth.isLoggedIn && keys.mine?.keys.length" class="acct-card">
      <header class="acct-head"><h3>Your keys</h3></header>
      <div class="acct-table-wrap">
        <table class="result-table">
          <thead>
            <tr><th>Label</th><th>Key</th><th>Created</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="k in keys.mine.keys" :key="k.id" :class="{ revoked: k.revokedAt }">
              <td>{{ k.label || '–' }}</td>
              <td><code>{{ k.prefix }}…</code></td>
              <td>{{ formatDate(k.createdAt) }}</td>
              <td>{{ k.revokedAt ? `revoked ${formatDate(k.revokedAt)}` : 'active' }}</td>
              <td class="num">
                <button v-if="!k.revokedAt" class="btn-ghost" :disabled="keys.busy" @click="onRevoke(k)">Revoke</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="acct-card">
      <header class="acct-head">
        <h3>Using a key</h3>
        <p>
          Send the key in the <code>X-API-Key</code> header (or <code>Authorization: Bearer</code>).
          Base URL <code>{{ GATEWAY_BASE }}</code>. All files are read-only.
        </p>
      </header>

      <div class="acct-table-wrap">
        <table class="result-table acct-files">
          <thead><tr><th>GET</th><th>What</th></tr></thead>
          <tbody>
            <tr v-for="f in PUBLIC_FILES" :key="f.path">
              <td><code>{{ f.path }}</code></td>
              <td>{{ f.what }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="resultNames.length" class="acct-note">Results published right now: {{ resultNames.join(', ') }}.</p>

      <h4>curl</h4>
      <pre class="acct-code">{{ examples.curl }}</pre>
      <h4>Python</h4>
      <pre class="acct-code">{{ examples.python }}</pre>
      <h4>DuckDB</h4>
      <pre class="acct-code">{{ examples.duckdb }}</pre>

      <h4>Limits</h4>
      <ul class="acct-list">
        <li>Responses carry <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code> (seconds until that window starts over) for the limit you are closest to.</li>
        <li>Over a limit the answer is <code>429</code> with <code>Retry-After</code> (seconds): wait that long before the next request.</li>
        <li>The Refinery publishes about once an hour. Poll <code>manifest.json</code> and download a file only when its <code>sha256</code> changed.</li>
        <li>A revoked key stops working within about a minute. Access may be paused for everyone if traffic gets too high.</li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useApiKeysStore } from '@/stores/apiKeys'
import { useDbStore } from '@/stores/db'
import { GATEWAY_BASE, PUBLIC_FILES, formatCount, formatDate } from '@/lib/apiKeys'

const auth = useAuthStore()
const keys = useApiKeysStore()
const db = useDbStore()

const label = ref('')
const copied = ref(false)

const limits = computed(() => keys.mine?.limits ?? { maxKeys: 0, perMinute: 0, perDay: 0 })
const activeKeys = computed(() => (keys.mine?.keys ?? []).filter((k) => !k.revokedAt))
const atLimit = computed(() => activeKeys.value.length >= limits.value.maxKeys)
const resultNames = computed(() => [...db.resultTables].sort())

const examples = {
  curl: `curl -H "X-API-Key: $SCANLAKE_KEY" ${GATEWAY_BASE}/api/derived/manifest.json
curl -H "X-API-Key: $SCANLAKE_KEY" -o scans.parquet \\
     ${GATEWAY_BASE}/api/derived/consolidated/scans.parquet`,
  python: `import io, os, requests, pandas as pd

BASE = "${GATEWAY_BASE}/api/derived"
HEADERS = {"X-API-Key": os.environ["SCANLAKE_KEY"]}

res = requests.get(f"{BASE}/results/location_stats.parquet", headers=HEADERS)
res.raise_for_status()
stats = pd.read_parquet(io.BytesIO(res.content))`,
  duckdb: `CREATE SECRET scanlake (
  TYPE http,
  EXTRA_HTTP_HEADERS MAP {'X-API-Key': 'slk_…'}
);
SET force_download = true;  -- the Gateway sends whole files
SELECT * FROM '${GATEWAY_BASE}/api/derived/consolidated/scans.parquet' LIMIT 10;`,
}

async function onCreate() {
  copied.value = false
  if (await keys.create(label.value.trim())) label.value = ''
}

async function onRevoke(k) {
  const name = k.label ? `"${k.label}" (${k.prefix}…)` : `${k.prefix}…`
  if (!confirm(`Revoke key ${name}? Anything using it stops working within a minute.`)) return
  if (keys.created?.key.id === k.id) keys.created = null
  await keys.revoke(k.id)
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
  } catch {
    // No clipboard access (e.g. denied): the key stays on screen to copy by hand
    copied.value = false
  }
}

// Load when a login appears, forget everything on logout
watch(
  () => auth.isLoggedIn,
  (loggedIn) => (loggedIn ? keys.loadMine() : keys.reset()),
)
onMounted(() => {
  if (auth.isLoggedIn) keys.loadMine()
})
</script>
