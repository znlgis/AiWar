<script setup lang="ts">
import { computed, ref } from 'vue'
import { store } from '../../store/game'

const ui = computed(() => store.ui!)
const filter = ref<'all' | 'important' | 'scout'>('all')
const list = computed(() => {
  const all = ui.value.reports
  if (filter.value === 'important') return all.filter(r => r.important)
  if (filter.value === 'scout') return all.filter(r => r.source === 'scout' || r.source === 'border')
  return all
})
const sourceIcon: Record<string, string> = {
  scout: '候', border: '亭', deserter: '卒', merchant: '商', envoy: '使', court: '廷', counsel: '谋', note: '报',
}
</script>

<template>
  <section class="report-panel">
    <header class="panel-head">
      <h2>前线战报</h2>
      <div class="filters">
        <button :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button :class="{ on: filter === 'important' }" @click="filter = 'important'">要报</button>
        <button :class="{ on: filter === 'scout' }" @click="filter = 'scout'">斥候</button>
      </div>
    </header>
    <div class="feed scroll hide-scroll">
      <article v-for="r in list" :key="r.id" class="report" :class="{ important: r.important }">
        <div class="meta">
          <span class="source" :data-source="r.source">{{ sourceIcon[r.source] ?? '报' }} · {{ r.sourceName }}</span>
          <span class="place">{{ r.place }}</span>
          <span class="time">发出 第{{ r.tick + 1 }}日<template v-if="r.arriveTick > r.tick"> · 送达 第{{ r.arriveTick + 1 }}日</template></span>
        </div>
        <p class="text">{{ r.text }}</p>
        <div class="foot">
          <span class="conf" :data-conf="r.confidence">{{ r.confidenceText }}</span>
          <span v-if="r.important" class="tag">要报</span>
        </div>
      </article>
      <p v-if="list.length === 0" class="empty">暂无战报。推演开始后，前线消息会陆续送达。</p>
    </div>
  </section>
</template>

<style scoped>
.report-panel { display: flex; flex-direction: column; height: 100%; background: #fffdf8; border-left: 1px solid var(--line); min-height: 0; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; border-bottom: 1px solid var(--line); }
.panel-head h2 { font-size: 15px; letter-spacing: 0.08em; }
.filters { display: flex; gap: 4px; }
.filters button { border: 1px solid transparent; background: transparent; color: var(--ink-3); font-size: 12px; padding: 4px 8px; border-radius: 6px; }
.filters button.on { border-color: var(--line-2); color: var(--ink); background: var(--paper-2); }
.feed { padding: 10px 12px 20px; flex: 1; }
.report { border-bottom: 1px solid var(--line); padding: 10px 4px 12px; }
.report.important .text { color: #7d2a1f; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--ink-3); align-items: center; }
.source { border: 1px solid var(--line-2); border-radius: 4px; padding: 1px 6px; color: var(--ink-2); background: var(--paper-2); }
.source[data-source="court"] { border-color: #b9a58e; color: #7a5a3a; }
.source[data-source="counsel"] { border-color: #a9b7a2; color: #4a6741; }
.place { color: var(--ink-2); }
.text { margin: 7px 0 8px; font-size: 13.5px; line-height: 1.7; color: #2a2c30; }
.foot { display: flex; gap: 8px; align-items: center; font-size: 11px; }
.conf[data-conf="high"] { color: #3f6b46; }
.conf[data-conf="mid"] { color: #7a6a3a; }
.conf[data-conf="low"] { color: #8a3b3b; }
.tag { color: var(--seal); border: 1px solid currentColor; border-radius: 3px; padding: 0 4px; font-size: 10px; }
.empty { color: var(--ink-3); font-size: 13px; padding: 24px 8px; text-align: center; }
@media (max-width: 860px) { .report-panel { border-left: none; border-top: 1px solid var(--line); } }
</style>
