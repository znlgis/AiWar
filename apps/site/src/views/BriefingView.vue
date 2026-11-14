<script setup lang="ts">
import { computed } from 'vue'
import { store, currentPack, startGame, toTitle, toAbout } from '../store/game'

const pack = computed(() => currentPack())
</script>

<template>
  <main class="page">
    <div class="wrap">
      <button class="back" @click="toTitle">返回</button>
      <header>
        <span class="eyebrow">战前简报</span>
        <h1 class="serif">{{ pack.meta.title }}</h1>
        <p class="subtitle">{{ pack.meta.subtitle }} · {{ pack.difficulty[store.difficulty].name }}难度</p>
        <p class="role">你是：{{ pack.meta.playerRole }}</p>
      </header>

      <section class="card">
        <h2>局势</h2>
        <p class="body">{{ pack.meta.background }}</p>
      </section>

      <section class="grid-3">
        <div class="card mini">
          <h3>你的目标</h3>
          <p>{{ pack.meta.objective }}</p>
        </div>
        <div class="card mini">
          <h3>你只能看到</h3>
          <p>前线战报（来源 / 延迟 / 可信度）与最新势力范围。没有兵力表，没有精确伤亡。</p>
        </div>
        <div class="card mini">
          <h3>决策与军令</h3>
          <p>关键节点做取舍；节点之间用军令牌调兵、侦察、筹粮。军令有传令延迟。</p>
        </div>
      </section>

      <section class="card">
        <h2>史料</h2>
        <div v-for="h in pack.meta.history" :key="h.title" class="history">
          <h3>{{ h.title }}</h3>
          <p>{{ h.text }}</p>
        </div>
        <p class="disclaimer">{{ pack.meta.disclaimer }}</p>
      </section>

      <div class="actions">
        <button class="btn ghost" @click="toAbout">详细规则</button>
        <button class="btn primary big" @click="startGame(false, pack.id)">开始推演</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.page { overflow-y: auto; }
.wrap { width: min(820px, 100%); margin: 0 auto; padding: 26px 22px 40px; display: flex; flex-direction: column; gap: 16px; }
.back { align-self: flex-start; background: none; border: none; color: var(--ink-3); font-size: 13px; padding: 0; }
.eyebrow { font-size: 12px; letter-spacing: 0.3em; color: var(--seal); }
header h1 { font-size: 40px; letter-spacing: 0.1em; margin: 8px 0 4px; }
.subtitle { font-size: 13px; color: var(--ink-3); }
.role { font-size: 12.5px; color: var(--ink-2); margin: 6px 0 0; }
h2 { font-size: 14px; letter-spacing: 0.08em; color: var(--ink-2); margin-bottom: 10px; }
h3 { font-size: 13px; color: var(--ink); margin-bottom: 6px; }
.body { font-size: 14.5px; line-height: 1.95; color: #2a2c30; margin: 0; }
.card.mini { padding: 16px 18px; }
.card.mini p { font-size: 12.5px; color: var(--ink-2); margin: 0; line-height: 1.8; }
.history { padding: 8px 0; border-top: 1px dashed var(--line); }
.history:first-of-type { border-top: none; }
.history p { font-size: 13px; color: var(--ink-2); margin: 0; line-height: 1.85; }
.disclaimer { font-size: 11.5px; color: var(--ink-3); margin: 14px 0 0; border-top: 1px solid var(--line); padding-top: 10px; }
.actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn.big { padding: 12px 32px; font-size: 15px; }
@media (max-width: 680px) { .grid-3 { grid-template-columns: 1fr; } header h1 { font-size: 34px; } }
</style>
