<script setup lang="ts">
import { computed, ref } from 'vue'
import { store, choose, campaign } from '../../store/game'

const ui = computed(() => store.ui!)
const selected = ref<string>('')
const pct = computed(() => {
  const total = campaign.difficulty[store.difficulty].decisionSeconds
  return Math.max(0, Math.min(100, (ui.value.decisionSeconds / total) * 100))
})
function confirm() {
  if (!selected.value) return
  choose(selected.value)
}
</script>

<template>
  <div v-if="ui.pendingNode" class="overlay">
    <div class="sheet">
      <header class="head">
        <span class="kicker">关键决策</span>
        <h2>{{ ui.nodeTitle }}</h2>
        <div class="timer"><span :style="{ width: pct + '%' }" /></div>
      </header>
      <p class="prompt">{{ ui.nodePrompt }}</p>
      <div class="options">
        <button
          v-for="(opt, i) in ui.options"
          :key="opt.id"
          class="option"
          :class="{ selected: selected === opt.id, recommended: opt.recommended }"
          @click="selected = opt.id"
        >
          <span class="index">{{ String.fromCharCode(65 + i) }}</span>
          <span class="body">
            <span class="label">{{ opt.label }}<em v-if="opt.recommended">荐</em></span>
            <span class="desc">{{ opt.desc }}</span>
            <span v-if="opt.hint" class="hint">{{ opt.hint }}</span>
          </span>
        </button>
      </div>
      <footer class="foot">
        <span class="count">还剩 {{ ui.decisionSeconds }} 秒，逾时将依令而行</span>
        <button class="btn primary" :disabled="!selected" @click="confirm">确认此策</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(24, 24, 22, 0.42); display: flex; align-items: center; justify-content: center; padding: 18px; z-index: 40; }
.sheet { width: min(760px, 100%); max-height: 92vh; overflow-y: auto; background: #fffdf8; border-radius: 14px; padding: 22px 24px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25); }
.head { display: flex; flex-direction: column; gap: 4px; }
.kicker { font-size: 11px; letter-spacing: 0.2em; color: var(--seal); }
.head h2 { font-size: 22px; font-family: var(--serif); letter-spacing: 0.06em; }
.timer { height: 3px; background: var(--line); border-radius: 2px; margin-top: 8px; overflow: hidden; }
.timer span { display: block; height: 100%; background: var(--seal); transition: width 1s linear; }
.prompt { font-size: 14px; color: var(--ink-2); line-height: 1.8; margin: 14px 0 16px; }
.options { display: flex; flex-direction: column; gap: 10px; }
.option { display: flex; gap: 14px; text-align: left; padding: 14px 16px; border: 1px solid var(--line-2); border-radius: 10px; background: #fff; transition: border-color 0.15s, background 0.15s; }
.option:hover { border-color: var(--ink-3); }
.option.selected { border-color: var(--ink); background: var(--paper-2); }
.index { width: 26px; height: 26px; flex: none; border-radius: 50%; border: 1px solid var(--line-2); display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--ink-2); }
.option.selected .index { background: var(--ink); color: #fff; border-color: var(--ink); }
.body { display: flex; flex-direction: column; gap: 3px; }
.label { font-size: 15px; font-weight: 600; color: var(--ink); }
.label em { font-style: normal; font-size: 10px; color: var(--seal); border: 1px solid var(--seal); border-radius: 3px; padding: 0 4px; margin-left: 8px; vertical-align: 2px; }
.desc { font-size: 12.5px; color: var(--ink-2); }
.hint { font-size: 12px; color: var(--ink-3); }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; }
.count { font-size: 12px; color: var(--ink-3); }
@media (max-width: 600px) { .sheet { padding: 18px; } .foot { flex-direction: column; align-items: stretch; } }
</style>
