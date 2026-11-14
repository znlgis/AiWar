<script setup lang="ts">
import { computed } from 'vue'
import { store, newCampaign, toTitle, toAbout, currentPack } from '../store/game'

const ui = computed(() => store.ui!)
const score = computed(() => ui.value.score!)
const pack = computed(() => currentPack())
const sides = computed(() => score.value.sides ?? { player: '我军', enemy: '敌军' })
const facts = computed(() => (score.value as unknown as { facts?: { qiLost: number; weiLost: number; zhaoSurvived: boolean; ambush: boolean; citiesTaken: string[] } }).facts)
const highlights = computed(() => score.value.highlights ?? [])
const lines = computed(() => (score.value as unknown as { lines?: string[] }).lines ?? facts.value?.citiesTaken ?? [])
</script>

<template>
  <main v-if="score" class="page result-page">
    <div class="wrap">
      <header class="head">
        <span class="eyebrow">战役结束 · {{ pack.meta.title }}</span>
        <h1 class="serif">{{ score.endingTitle }}</h1>
        <p class="ending">{{ score.endingText }}</p>
        <div class="grade-row">
          <span class="seal grade">{{ score.grade }}</span>
          <div class="meta">
            <span class="total">{{ Math.round(score.total) }} <small>分</small></span>
            <span class="muted">{{ score.deviation }}</span>
          </div>
        </div>
      </header>

      <section class="card">
        <h2>评分</h2>
        <div v-for="p in score.parts" :key="p.key" class="part">
          <span class="label">{{ p.label }}</span>
          <span class="bar"><i :style="{ width: (p.max ? (p.value / p.max) * 100 : 0) + '%' }" /></span>
          <span class="val">{{ Math.round(p.value) }}<small>/{{ p.max }}</small></span>
          <span class="note muted">{{ p.note }}</span>
        </div>
      </section>

      <section class="grid-2">
        <div class="card">
          <h2>战果</h2>
          <dl class="facts">
            <template v-if="facts">
              <div><dt>{{ sides.player }}折损</dt><dd>{{ Math.round(facts.qiLost).toLocaleString() }} 人</dd></div>
              <div><dt>{{ sides.enemy }}折损</dt><dd>{{ Math.round(facts.weiLost).toLocaleString() }} 人</dd></div>
              <div><dt>邯郸</dt><dd>{{ facts.zhaoSurvived ? '保全' : '陷落' }}</dd></div>
              <div><dt>伏击</dt><dd>{{ facts.ambush ? '成功' : '未成' }}</dd></div>
            </template>
            <template v-else>
              <div v-for="h in highlights" :key="h.label"><dt>{{ h.label }}</dt><dd>{{ h.value }}</dd></div>
            </template>
          </dl>
        </div>
        <div class="card">
          <h2>关键节点</h2>
          <ul class="lines">
            <li v-for="(line, i) in lines.slice(-10)" :key="i">{{ line }}</li>
          </ul>
        </div>
      </section>

      <section class="card">
        <h2>史实参照</h2>
        <p class="history">{{ pack.meta.objective }} 本局与史实未必一致：你的每一个关键决策，都只是诸多可能中的一种。</p>
      </section>

      <div class="actions">
        <button class="btn ghost" @click="toAbout">玩法与史料</button>
        <button class="btn" @click="toTitle">返回标题</button>
        <button class="btn primary big" @click="newCampaign">再战一局</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.result-page { overflow-y: auto; }
.wrap { width: min(860px, 100%); margin: 0 auto; padding: 34px 22px 44px; display: flex; flex-direction: column; gap: 16px; }
.eyebrow { font-size: 12px; letter-spacing: .28em; color: var(--seal); }
head h1 { font-size: 44px; letter-spacing: .12em; margin: 8px 0 6px; }
.ending { color: var(--ink-2); line-height: 1.9; font-size: 14px; margin: 0 0 14px; }
.grade-row { display: flex; align-items: center; gap: 16px; }
.seal.grade { width: 64px; height: 64px; font-size: 34px; }
.meta { display: flex; flex-direction: column; gap: 2px; }
.total { font-size: 26px; font-weight: 700; }
.total small { font-size: 12px; font-weight: 400; color: var(--ink-3); }
h2 { font-size: 14px; letter-spacing: .08em; color: var(--ink-2); margin-bottom: 12px; }
.part { display: grid; grid-template-columns: 88px 1fr 64px 1fr; align-items: center; gap: 10px; padding: 5px 0; font-size: 12.5px; }
.part .bar { height: 6px; background: var(--paper-2); border-radius: 3px; overflow: hidden; }
.part .bar i { display: block; height: 100%; background: var(--ink); border-radius: 3px; }
.part .val { text-align: right; font-weight: 600; }
.part .val small { color: var(--ink-3); font-weight: 400; }
.part .note { font-size: 11.5px; }
.facts { margin: 0; display: grid; gap: 8px; }
.facts div { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 1px dashed var(--line); padding-bottom: 6px; }
.facts dt { color: var(--ink-3); }
.facts dd { margin: 0; font-weight: 600; }
.lines { margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--ink-2); line-height: 1.9; }
.history { font-size: 13px; color: var(--ink-2); line-height: 1.9; margin: 0; }
.actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.btn.big { padding: 12px 30px; font-size: 15px; }
@media (max-width: 680px) { .part { grid-template-columns: 76px 1fr 56px; } .part .note { display: none; } }
</style>
