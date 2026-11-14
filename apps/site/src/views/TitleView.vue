<script setup lang="ts">
import { computed } from 'vue'
import { store, PACKS, currentPack, startGame, toBriefing, toAbout, checkSave, hasSaveFor } from '../store/game'
import type { DifficultyId } from '@aiwar/sim'

const diffs: { id: DifficultyId; name: string; label: string }[] = [
  { id: 'hist', name: '史实', label: '情报较准 · 决策窗口宽' },
  { id: 'normal', name: '普通', label: '有噪声 · 敌方会用计' },
  { id: 'hard', name: '困难', label: '假报多 · 会被识破' },
  { id: 'hell', name: '地狱', label: '情报含混 · 多重反制' },
]
const selected = computed(() => currentPack())
const selectedSave = computed(() => hasSaveFor(store.packId))
function pick(id: string) {
  store.packId = id
  checkSave()
}
function begin() {
  checkSave()
  toBriefing()
}
function cont() {
  startGame(true, store.packId)
}
</script>

<template>
  <main class="page title-page">
    <div class="wrap">
      <header class="hero">
        <span class="eyebrow">AI 战争模拟器</span>
        <h1 class="serif">五战</h1>
        <p class="sub">围魏救赵 · 赤壁之战 · 淝水之战 · 四渡赤水 · 淮海战役</p>
        <p class="lede">只凭前线战报与势力范围，在关键节点做出决策。战场由推演内核与敌方 AI 决定——结局不必与史书相同。</p>
      </header>

      <section class="campaigns">
        <button
          v-for="pack in PACKS"
          :key="pack.id"
          class="campaign card"
          :class="{ on: store.packId === pack.id }"
          @click="pick(pack.id)"
        >
          <span class="era">{{ pack.meta.era }}</span>
          <span class="title serif">{{ pack.meta.title }}</span>
          <span class="sub">{{ pack.meta.subtitle }}</span>
          <span class="blurb">{{ pack.meta.blurb }}</span>
          <span v-if="hasSaveFor(pack.id)" class="saved">有存档</span>
        </button>
      </section>

      <section class="diff-card card">
        <div class="diff-head">
          <h2>难度</h2>
          <span class="muted">当前：{{ selected.meta.title }}</span>
        </div>
        <div class="diff-grid">
          <button v-for="d in diffs" :key="d.id" class="diff" :class="{ on: store.difficulty === d.id }" @click="store.difficulty = d.id">
            <span class="name">{{ d.name }}</span>
            <span class="label">{{ d.label }}</span>
          </button>
        </div>
        <p class="note">难度影响情报质量、决策窗口与敌方判断力，不给敌方战斗数值加成。</p>
      </section>

      <div class="actions">
        <button class="btn primary big" @click="begin">开始战役</button>
        <button v-if="selectedSave" class="btn big" @click="cont">继续本战役</button>
        <button class="btn ghost big" @click="toAbout">玩法与史料</button>
      </div>

      <footer class="foot">
        <span>历史写意改编 · 地图与兵力经游戏化处理</span>
        <span class="muted">单局约 20–30 分钟</span>
      </footer>
    </div>
  </main>
</template>

<style scoped>
.title-page { background: radial-gradient(1200px 600px at 50% -10%, #fffdf8 0%, var(--paper) 60%); overflow-y: auto; }
.wrap { width: min(980px, 100%); margin: 0 auto; padding: 40px 24px 32px; display: flex; flex-direction: column; gap: 22px; }
.hero { text-align: center; }
.eyebrow { font-size: 12px; letter-spacing: 0.32em; color: var(--seal); }
.hero h1 { font-size: clamp(38px, 7vw, 64px); letter-spacing: 0.18em; margin: 8px 0 6px; }
.sub { color: var(--ink-2); font-size: 13.5px; letter-spacing: 0.06em; }
.lede { max-width: 600px; margin: 14px auto 0; color: var(--ink-2); font-size: 14px; line-height: 1.9; }
.campaigns { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.campaign { text-align: left; display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--line); background: #fff; border-radius: 10px; position: relative; }
.campaign.on { border-color: var(--ink); background: var(--paper-2); }
.campaign .era { font-size: 11px; color: var(--seal); letter-spacing: 0.1em; }
.campaign .title { font-size: 18px; letter-spacing: 0.08em; }
.campaign .sub { font-size: 10.5px; color: var(--ink-3); }
.campaign .blurb { font-size: 11px; color: var(--ink-2); line-height: 1.6; margin-top: 4px; }
.campaign .saved { position: absolute; right: 8px; top: 8px; font-size: 10px; color: #3f6b46; border: 1px solid #9db8a2; border-radius: 3px; padding: 0 4px; }
.diff-card h2 { font-size: 14px; color: var(--ink-2); letter-spacing: 0.08em; }
.diff-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.diff-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.diff { text-align: left; border: 1px solid var(--line); background: #fff; border-radius: 9px; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
.diff.on { border-color: var(--ink); background: var(--paper-2); }
.diff .name { font-size: 15px; font-weight: 600; }
.diff .label { font-size: 11.5px; color: var(--ink-3); }
.note { margin: 10px 0 0; font-size: 12px; color: var(--ink-3); }
.actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
.btn.big { padding: 12px 30px; font-size: 15px; }
.foot { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 14px; }
@media (max-width: 900px) { .campaigns { grid-template-columns: repeat(2, 1fr); } .diff-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .campaigns { grid-template-columns: 1fr; } .wrap { padding-top: 26px; } }
</style>
