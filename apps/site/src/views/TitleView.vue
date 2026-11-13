<script setup lang="ts">
import { computed } from 'vue'
import { store, campaign, startGame, toAbout, toBriefing, checkSave } from '../store/game'
import type { DifficultyId } from '@aiwar/sim'

const diffs: { id: DifficultyId; name: string; label: string }[] = [
  { id: 'hist', name: '史实', label: '情报较准 · 决策窗口宽' },
  { id: 'normal', name: '普通', label: '有噪声 · 魏军会用计' },
  { id: 'hard', name: '困难', label: '假报多 · 会识破佯动' },
  { id: 'hell', name: '地狱', label: '情报含混 · 可能反设伏' },
]
const canContinue = computed(() => store.hasSave)
function begin() {
  checkSave()
  store.difficulty = store.difficulty
  toBriefing()
}
function cont() {
  startGame(true)
}
</script>

<template>
  <main class="page title-page">
    <div class="wrap">
      <header class="hero">
        <span class="eyebrow">AI 战争模拟器 · 第一战</span>
        <h1 class="serif">围魏救赵</h1>
        <p class="sub">{{ campaign.meta.subtitle }}</p>
        <p class="lede">只凭前线战报与势力范围，在七个关键节点做出决策。战场由推演内核与敌方 AI 决定——结局不必与史书相同。</p>
      </header>

      <section class="diff-card card">
        <h2>选择难度</h2>
        <div class="diff-grid">
          <button
            v-for="d in diffs"
            :key="d.id"
            class="diff"
            :class="{ on: store.difficulty === d.id }"
            @click="store.difficulty = d.id"
          >
            <span class="name">{{ d.name }}</span>
            <span class="label">{{ d.label }}</span>
          </button>
        </div>
        <p class="note">难度影响情报质量、决策窗口与魏军判断力，不给敌方战斗数值加成。</p>
      </section>

      <div class="actions">
        <button class="btn primary big" @click="begin">开始战役</button>
        <button v-if="canContinue" class="btn big" @click="cont">继续上局</button>
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
.title-page { background: radial-gradient(1200px 600px at 50% -10%, #fffdf8 0%, var(--paper) 60%); }
.wrap { width: min(820px, 100%); margin: 0 auto; padding: 48px 24px 32px; display: flex; flex-direction: column; gap: 26px; }
.hero { text-align: center; }
.eyebrow { font-size: 12px; letter-spacing: 0.32em; color: var(--seal); }
.hero h1 { font-size: clamp(44px, 9vw, 76px); letter-spacing: 0.12em; margin: 10px 0 6px; }
.sub { color: var(--ink-2); font-size: 14px; letter-spacing: 0.08em; }
.lede { max-width: 560px; margin: 16px auto 0; color: var(--ink-2); font-size: 14px; line-height: 1.9; }
.diff-card { margin-top: 4px; }
.diff-card h2 { font-size: 14px; color: var(--ink-2); margin-bottom: 12px; letter-spacing: 0.08em; }
.diff-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.diff { text-align: left; border: 1px solid var(--line); background: #fff; border-radius: 9px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
.diff.on { border-color: var(--ink); background: var(--paper-2); }
.diff .name { font-size: 15px; font-weight: 600; }
.diff .label { font-size: 11.5px; color: var(--ink-3); }
.note { margin: 12px 0 0; font-size: 12px; color: var(--ink-3); }
.actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
.btn.big { padding: 12px 30px; font-size: 15px; }
.foot { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 14px; }
@media (max-width: 680px) { .diff-grid { grid-template-columns: repeat(2, 1fr); } .wrap { padding-top: 30px; } }
</style>
