<template>
  <div class="acct-view acct-view-wide">
    <p v-if="!auth.isAdmin" class="no-results">
      {{ auth.status === 'idle' || auth.status === 'loading' ? 'Checking login…' : 'Admins only.' }}
    </p>

    <template v-else>
      <section class="acct-card">
        <header class="acct-head acct-head-row">
          <div>
            <h2>API keys</h2>
            <p>Keys people made in the /API tab, with their Discord account and Gateway usage over 30 days.</p>
          </div>
          <button class="btn-secondary" :disabled="keys.adminStatus === 'loading'" @click="keys.loadAdmin()">
            {{ keys.adminStatus === 'loading' ? 'Loading…' : 'Refresh' }}
          </button>
        </header>
        <p v-if="keys.adminError" class="panel-error">{{ keys.adminError }}</p>

        <template v-if="data">
          <div class="loc-stats">
            <div><strong>{{ formatCount(data.summary.activeKeys) }}</strong><span>active keys ({{ formatCount(data.summary.totalKeys) }} made)</span></div>
            <div><strong>{{ formatCount(data.summary.accountsWithKeys) }}</strong><span>accounts with keys</span></div>
            <div><strong>{{ usageText(data.summary.requests24h) }}</strong><span>requests, last 24 h</span></div>
            <div><strong>{{ usageText(data.summary.requests30d) }}</strong><span>requests, last 30 days</span></div>
          </div>

          <div class="acct-switches">
            <div class="acct-switch">
              <span class="acct-switch-name">New keys</span>
              <div class="seg" role="group" aria-label="New keys">
                <button class="seg-btn" :class="{ active: data.settings.issuing }" :disabled="keys.busy" @click="setSwitch('issuing', true)">On</button>
                <button class="seg-btn" :class="{ active: !data.settings.issuing }" :disabled="keys.busy" @click="setSwitch('issuing', false)">Off</button>
              </div>
              <small>{{ data.settings.issuing ? 'Users can create keys.' : 'Nobody can create keys.' }}</small>
            </div>
            <div class="acct-switch">
              <span class="acct-switch-name">Gateway access</span>
              <div class="seg" role="group" aria-label="Gateway access for user keys">
                <button class="seg-btn" :class="{ active: data.settings.serving }" :disabled="keys.busy" @click="setSwitch('serving', true)">On</button>
                <button class="seg-btn" :class="{ active: !data.settings.serving }" :disabled="keys.busy" @click="setSwitch('serving', false)">Off</button>
              </div>
              <small>{{ data.settings.serving ? 'The Gateway accepts user keys.' : 'The Gateway refuses every user key.' }}</small>
            </div>
          </div>

          <p class="acct-note">
            Tiers: <span v-for="(t, name) in data.tiers" :key="name" class="acct-tier">
              <strong>{{ name }}</strong> {{ t.maxKeys }} keys, {{ formatCount(t.perMinute) }}/min, {{ formatCount(t.perDay) }}/day
            </span>
          </p>
          <p v-if="!data.usageAvailable" class="acct-warn">Usage unavailable: {{ data.usageError || 'no data' }}</p>
        </template>
      </section>

      <section v-if="data?.usageAvailable" class="acct-card">
        <header class="acct-head">
          <h3>Requests per day</h3>
          <p>User keys, last 30 days (UTC). The five busiest keys; the rest summed.</p>
        </header>
        <p v-if="chartSeries.length === 0" class="no-results">No requests with user keys yet.</p>
        <div v-show="chartSeries.length > 0" ref="chartEl" class="acct-chart" />
      </section>

      <section v-if="data" class="acct-card">
        <header class="acct-head acct-head-row">
          <h3>User keys</h3>
          <label class="acct-check"><input v-model="showRevoked" type="checkbox" /> Show revoked</label>
        </header>
        <div class="acct-table-wrap">
          <table class="result-table">
            <thead>
              <tr>
                <th>Key</th><th>Discord</th><th>Discord ID</th><th>ScanLake user ID</th><th>Tier</th>
                <th>Created</th><th>Last used</th>
                <th class="num">24 h</th><th class="num">7 d</th><th class="num">30 d</th><th class="num">Data 30 d</th><th class="num">429s</th>
                <th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="k in visibleKeys" :key="k.id" :class="{ revoked: k.status !== 'active' }">
                <td><code>{{ k.prefix }}…</code><small v-if="k.label" class="acct-sub">{{ k.label }}</small></td>
                <td>{{ discordLabel(k.globalName, k.username) }}</td>
                <td><code>{{ k.discordId }}</code></td>
                <td><code v-if="k.userId">{{ k.userId }}</code><span v-else class="empty">–</span></td>
                <td>
                  <select :value="k.tier" :disabled="keys.busy" :aria-label="`Tier of ${k.username}`" @change="onTier(k, $event)">
                    <option v-for="name in tierNames" :key="name" :value="name">{{ name }}</option>
                  </select>
                </td>
                <td>{{ formatDate(k.createdAt) }}</td>
                <td>{{ k.usage ? formatAgo(k.usage.lastUsedAt) : '–' }}</td>
                <td class="num">{{ k.usage ? formatCount(k.usage.requests24h) : '–' }}</td>
                <td class="num">{{ k.usage ? formatCount(k.usage.requests7d) : '–' }}</td>
                <td class="num">{{ k.usage ? formatCount(k.usage.requests30d) : '–' }}</td>
                <td class="num">{{ k.usage ? formatBytes(k.usage.bytes30d) : '–' }}</td>
                <td class="num">{{ k.usage ? formatCount(k.usage.limited30d) : '–' }}</td>
                <td>{{ k.status === 'active' ? 'active' : `revoked by ${k.revokedBy}` }}</td>
                <td class="num">
                  <button v-if="k.status === 'active'" class="btn-ghost" :disabled="keys.busy" @click="onRevoke(k)">Revoke</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="visibleKeys.length === 0" class="no-results">No keys{{ showRevoked ? '' : ' active' }}.</p>
        <p class="acct-note">The tier is per account and applies to all its keys. Blocked revokes every key of the account.</p>
      </section>

      <section v-if="data?.internal.length" class="acct-card">
        <header class="acct-head">
          <h3>Other Gateway keys</h3>
          <p>Keys made by hand (Dashboard proxy, Refinery), by owner.</p>
        </header>
        <div class="acct-table-wrap">
          <table class="result-table">
            <thead>
              <tr>
                <th>Owner</th><th>Key hash</th><th>Last used</th>
                <th class="num">24 h</th><th class="num">7 d</th><th class="num">30 d</th><th class="num">Data 30 d</th><th class="num">429s</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="k in data.internal" :key="k.id">
                <td>{{ k.ownerId || '–' }}</td>
                <td><code>{{ k.prefix }}…</code></td>
                <td>{{ formatAgo(k.usage.lastUsedAt) }}</td>
                <td class="num">{{ formatCount(k.usage.requests24h) }}</td>
                <td class="num">{{ formatCount(k.usage.requests7d) }}</td>
                <td class="num">{{ formatCount(k.usage.requests30d) }}</td>
                <td class="num">{{ formatBytes(k.usage.bytes30d) }}</td>
                <td class="num">{{ formatCount(k.usage.limited30d) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Plotly from 'plotly.js-dist-min'
import { useAuthStore } from '@/stores/auth'
import { useApiKeysStore } from '@/stores/apiKeys'
import { CATEGORICAL, SURFACE_GAP, plotlyBase } from '@/lib/chartTheme'
import { discordLabel, formatAgo, formatBytes, formatCount, formatDate, usageSeries } from '@/lib/apiKeys'

// Neutral for the summed "other keys" bar: not one of the categorical hues
const OTHER_COLOR = '#7a6a55'

const auth = useAuthStore()
const keys = useApiKeysStore()

const showRevoked = ref(false)
const chartEl = ref(null)

const data = computed(() => keys.admin)
const tierNames = computed(() => Object.keys(data.value?.tiers ?? {}))
const visibleKeys = computed(() => (data.value?.keys ?? []).filter((k) => showRevoked.value || k.status === 'active'))
const chartSeries = computed(() => (data.value?.usageAvailable ? usageSeries(data.value.keys, data.value.days.length) : []))

function usageText(n) {
  return data.value?.usageAvailable ? formatCount(n) : '–'
}

async function setSwitch(field, value) {
  if (data.value.settings[field] === value) return
  if (field === 'serving' && !value && !confirm('Refuse every user key at the Gateway? Takes effect within about a minute.')) return
  await keys.setSettings({ [field]: value })
}

async function onTier(k, event) {
  const tier = event.target.value
  const who = discordLabel(k.globalName, k.username)
  const question =
    tier === 'blocked'
      ? `Block ${who}? Every key of the account is revoked and no new ones can be made.`
      : `Set ${who} to ${tier}? This applies to all keys of the account.`
  if (!confirm(question)) {
    event.target.value = k.tier
    return
  }
  await keys.setTier(k.discordId, tier)
}

async function onRevoke(k) {
  if (!confirm(`Revoke ${k.prefix}… of ${discordLabel(k.globalName, k.username)}?`)) return
  await keys.adminRevoke(k.id)
}

function drawChart() {
  const el = chartEl.value
  if (!el || !data.value?.usageAvailable || chartSeries.value.length === 0) return
  const base = plotlyBase()
  const traces = chartSeries.value.map((s, i) => ({
    type: 'bar',
    name: s.name,
    x: data.value.days,
    y: s.counts,
    marker: { color: s.id === 'other' ? OTHER_COLOR : CATEGORICAL[i % CATEGORICAL.length], line: SURFACE_GAP },
    hovertemplate: '%{y:,} requests<extra>%{fullData.name}</extra>',
  }))
  const layout = {
    ...base,
    barmode: 'stack',
    bargap: 0.35,
    height: 280,
    margin: { l: 56, r: 16, t: 8, b: 40 },
    hovermode: 'x unified',
    showlegend: traces.length > 1,
    legend: { orientation: 'h', x: 0, y: 1.12, font: { color: '#d4921c' } },
    xaxis: { ...base.xaxis, type: 'date', tickformat: '%b %d', showgrid: false },
    yaxis: { ...base.yaxis, tickformat: ',d', rangemode: 'tozero', title: { text: 'Requests' } },
  }
  Plotly.react(el, traces, layout, { responsive: true, displayModeBar: false })
}

watch(chartSeries, () => nextTick(drawChart))
watch(
  () => auth.isAdmin,
  (isAdmin) => {
    if (isAdmin && keys.adminStatus === 'idle') keys.loadAdmin()
  },
)
onMounted(() => {
  if (auth.isAdmin) keys.loadAdmin().then(() => nextTick(drawChart))
})
onBeforeUnmount(() => {
  if (chartEl.value) Plotly.purge(chartEl.value)
})
</script>
