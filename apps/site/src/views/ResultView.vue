<script setup lang="ts">
import { computed, ref } from 'vue'
import { store, newCampaign, toTitle, toAbout, currentPack, discardAndExit } from '../store/game'
import { debriefToText } from '@aiwar/sim'

const ui = computed(() => store.ui!)
const score = computed(() => ui.value.score!)
const debrief = computed(() => ui.value.debrief)
const pack = computed(() => currentPack())
const filter = ref<'all' | 'key'>('key')
const copied = ref('')

// 编年表：默认只看决策与战斗，切「全部」才把城邑易手与杂项都列出来
const chronicle = computed(() => {
  const lines = debrief.value?.chronicle ?? []
  if (filter.value === 'all') return lines
  return lines.filter(l => l.kind === 'decision' || l.kind === 'battle' || l.kind === 'city')
})

const kindLabel: Record<string, string> = {
  decision: '定策', battle: '战', city: '城', order: '令', other: '报',
}

async function copyText(): Promise<void> {
  if (!debrief.value) return
  const text = debriefToText(debrief.value, {
    campaignTitle: pack.value.meta.title,
    grade: score.value.grade,
    total: score.value.total,
  })
  try {
    await navigator.clipboard.writeText(text)
    copied.value = '已复制'
  } catch {
    copied.value = '复制失败，可长按选择'
  }
  window.setTimeout(() => { copied.value = '' }, 2400)
}
</script>

<template>
  <main v-if="score" class="page result-page">
    <div class="wrap">
      <header class="head">
        <span class="eyebrow">
          战局结束 · {{ pack.meta.title }}
          <em v-if="debrief" class="verdict" :data-verdict="debrief.verdict">{{ debrief.verdictLabel }}</em>
        </span>
        <h1 class="serif">{{ score.endingTitle }}</h1>
        <p class="ending">{{ debrief?.headline || score.endingText }}</p>
        <div class="grade-row">
          <span class="seal grade">{{ score.grade }}</span>
          <div class="meta">
            <span class="total">{{ Math.round(score.total) }} <small>分</small></span>
            <span class="muted">{{ score.deviation }}</span>
          </div>
        </div>
      </header>

      <template v-if="debrief">
        <!-- 上：战报 -->
        <section class="card">
          <div class="card-head">
            <h2>战报</h2>
            <div class="head-tools">
              <button :class="{ on: filter === 'key' }" @click="filter = 'key'">要点</button>
              <button :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</button>
              <button class="copy" @click="copyText">{{ copied || '复制文本' }}</button>
            </div>
          </div>
          <ol class="chronicle">
            <li v-for="(line, i) in chronicle" :key="i" :data-kind="line.kind">
              <span class="day">第{{ line.tick }}日</span>
              <span class="tag" :data-kind="line.kind">{{ kindLabel[line.kind] ?? '报' }}</span>
              <span class="text">{{ line.text }}</span>
            </li>
            <li v-if="chronicle.length === 0" class="empty">本局没有留下记录。</li>
          </ol>
        </section>

        <!-- 下：战役分析 -->
        <section class="card">
          <h2>战役分析</h2>
          <div class="metrics">
            <div v-for="m in debrief.metrics" :key="m.label" class="metric" :title="m.hint">
              <span class="k">{{ m.label }}</span>
              <span class="v">{{ m.value }}</span>
            </div>
          </div>
        </section>

        <section class="grid-2">
          <div class="card">
            <h2>分项解读</h2>
            <div v-for="p in debrief.reading" :key="p.label" class="reading">
              <b>{{ p.label }}</b>
              <span>{{ p.text }}</span>
            </div>
          </div>
          <div class="card">
            <h2>关键转折</h2>
            <p class="turn">
              <span v-if="debrief.turningPoint.tick" class="turn-day">第{{ debrief.turningPoint.tick }}日</span>
              {{ debrief.turningPoint.text }}
            </p>
            <h2 class="mt">与史实对照</h2>
            <div class="compare">
              <ul class="same">
                <li v-for="(s, i) in debrief.historyCompare.same" :key="'s' + i">{{ s }}</li>
              </ul>
              <ul class="diff">
                <li v-for="(s, i) in debrief.historyCompare.diff" :key="'d' + i">{{ s }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section v-if="debrief.decisions.length" class="card">
          <h2>决策复盘</h2>
          <table class="decisions">
            <thead>
              <tr><th>日</th><th>节点</th><th>选择</th><th>之后</th></tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in debrief.decisions" :key="i">
                <td class="num">{{ d.tick }}</td>
                <td>{{ d.title }}</td>
                <td>
                  {{ d.label }}
                  <em v-if="d.recommended" class="badge">史实</em>
                  <em v-if="d.timeout" class="badge warn">逾时</em>
                </td>
                <td class="echo">{{ d.echo || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="debrief.hintIfLose" class="card loss">
          <h2>如果当时</h2>
          <p>{{ debrief.hintIfLose }}</p>
        </section>
      </template>

      <!-- 旧存档 / 无账本时的兜底：仍然给出评分的分项与要点 -->
      <template v-else>
        <section class="card">
          <h2>评分</h2>
          <div v-for="p in score.parts" :key="p.key" class="part">
            <span class="label">{{ p.label }}</span>
            <span class="bar"><i :style="{ width: (p.max ? (p.value / p.max) * 100 : 0) + '%' }" /></span>
            <span class="val">{{ Math.round(p.value) }}<small>/{{ p.max }}</small></span>
            <span class="note muted">{{ p.note }}</span>
          </div>
        </section>
      </template>

      <section class="card">
        <h2>史实参照</h2>
        <p class="history">{{ pack.meta.objective }} 本局与史实未必一致：你的每一个关键决策，都只是诸多可能中的一种。</p>
        <p class="disclaimer">{{ pack.meta.disclaimer }}</p>
      </section>

      <div class="actions">
        <button v-if="debrief?.verdict === 'abandoned'" class="btn ghost" @click="discardAndExit">丢弃本局</button>
        <button class="btn ghost" @click="toAbout">玩法与史料</button>
        <button class="btn" @click="toTitle">返回标题</button>
        <button class="btn primary big" @click="newCampaign">再战一局</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.result-page { overflow-y: auto; }
.wrap { width: min(900px, 100%); margin: 0 auto; padding: 34px 22px 44px; display: flex; flex-direction: column; gap: 16px; }
.eyebrow { font-size: 12px; letter-spacing: .28em; color: var(--seal); display: inline-flex; align-items: center; gap: 8px; }
.verdict { font-style: normal; letter-spacing: .1em; border: 1px solid currentColor; border-radius: 4px; padding: 0 6px; font-size: 11px; }
.verdict[data-verdict="lose"] { color: #7d2a1f; }
.verdict[data-verdict="win"] { color: #3f6b46; }
.verdict[data-verdict="abandoned"] { color: var(--ink-3); }
head h1 { font-size: 44px; letter-spacing: .12em; margin: 8px 0 6px; }
h1 { font-size: clamp(28px, 5vw, 42px); letter-spacing: .1em; margin: 8px 0 6px; }
.ending { color: var(--ink-2); line-height: 1.9; font-size: 14px; margin: 0 0 14px; }
.grade-row { display: flex; align-items: center; gap: 16px; }
.seal.grade { width: 64px; height: 64px; font-size: 34px; }
.meta { display: flex; flex-direction: column; gap: 2px; }
.total { font-size: 26px; font-weight: 700; }
.total small { font-size: 12px; font-weight: 400; color: var(--ink-3); }
h2 { font-size: 14px; letter-spacing: .08em; color: var(--ink-2); margin-bottom: 12px; }
h2.mt { margin-top: 16px; }
.card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.card-head h2 { margin-bottom: 0; }
.head-tools { display: flex; gap: 5px; align-items: center; }
.head-tools button { border: 1px solid transparent; background: transparent; color: var(--ink-3); font-size: 12px; padding: 3px 8px; border-radius: 6px; }
.head-tools button.on { border-color: var(--line-2); color: var(--ink); background: var(--paper-2); }
.head-tools button.copy { border-color: var(--line-2); color: var(--ink-2); }
.chronicle { list-style: none; margin: 0; padding: 0; max-height: 46vh; overflow-y: auto; }
.chronicle li { display: grid; grid-template-columns: 60px 34px 1fr; gap: 8px; align-items: baseline; padding: 6px 2px; border-bottom: 1px dashed var(--line); font-size: 13px; line-height: 1.7; }
.chronicle li.empty { display: block; color: var(--ink-3); border: none; }
.day { color: var(--ink-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.tag { font-size: 11px; text-align: center; border-radius: 3px; padding: 0 2px; border: 1px solid var(--line-2); color: var(--ink-2); white-space: nowrap; }
.tag[data-kind="battle"] { color: #7d2a1f; border-color: #d8b8b0; }
.tag[data-kind="decision"] { color: #4a6741; border-color: #b9c9b0; }
.tag[data-kind="city"] { color: #7a5a3a; border-color: #d6c4ad; }
.text { color: #2a2c30; }
li[data-kind="battle"] .text { font-weight: 600; }
.metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.metric { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; background: var(--paper-2); border-radius: 8px; }
.metric .k { font-size: 11.5px; color: var(--ink-3); }
.metric .v { font-size: 13.5px; font-weight: 600; color: var(--ink); }
.reading { font-size: 12.5px; line-height: 1.8; padding: 5px 0; border-bottom: 1px dashed var(--line); display: flex; flex-direction: column; gap: 2px; }
.reading b { font-weight: 600; color: var(--ink-2); }
.reading span { color: var(--ink-2); }
.turn { font-size: 13px; line-height: 1.9; color: var(--ink-2); margin: 0; }
.turn-day { color: var(--seal); font-weight: 600; margin-right: 6px; }
.compare { display: flex; flex-direction: column; gap: 8px; }
.compare ul { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.85; color: var(--ink-2); }
.compare .same li::marker { color: #3f6b46; }
.compare .diff li::marker { color: #8a3b3b; }
.decisions { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.decisions th { text-align: left; font-weight: 500; color: var(--ink-3); font-size: 11.5px; padding: 4px 6px; border-bottom: 1px solid var(--line); }
.decisions td { padding: 6px; border-bottom: 1px dashed var(--line); vertical-align: top; color: var(--ink-2); }
.decisions td.num { font-variant-numeric: tabular-nums; color: var(--ink-3); }
.decisions td.echo { color: var(--ink-3); }
.badge { font-style: normal; font-size: 10px; border: 1px solid currentColor; border-radius: 3px; padding: 0 3px; margin-left: 4px; color: #3f6b46; }
.badge.warn { color: #8a5a2b; }
.loss p { font-size: 13px; line-height: 1.9; color: var(--ink-2); margin: 0; }
.part { display: grid; grid-template-columns: 88px 1fr 64px 1fr; align-items: center; gap: 10px; padding: 5px 0; font-size: 12.5px; }
.part .bar { height: 6px; background: var(--paper-2); border-radius: 3px; overflow: hidden; }
.part .bar i { display: block; height: 100%; background: var(--ink); border-radius: 3px; }
.part .val { text-align: right; font-weight: 600; }
.part .val small { color: var(--ink-3); font-weight: 400; }
.part .note { font-size: 11.5px; }
.history { font-size: 13px; color: var(--ink-2); line-height: 1.9; margin: 0; }
.disclaimer { font-size: 11.5px; color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 10px; margin-top: 12px; line-height: 1.8; }
.actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.btn.big { padding: 12px 30px; font-size: 15px; }
@media (max-width: 680px) {
  .part { grid-template-columns: 76px 1fr 56px; }
  .part .note { display: none; }
  .chronicle li { grid-template-columns: 56px 24px 1fr; }
  .decisions th:nth-child(4), .decisions td:nth-child(4) { display: none; }
}
</style>
