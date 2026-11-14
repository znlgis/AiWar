<script setup lang="ts">
import { computed } from 'vue'
import { store, stop, toggle, setSpeed, step, openOrder, abandon } from '../store/game'
import { audioState, toggleAudio } from '../audio/sfx'
import MapStage from '../components/map/MapStage.vue'
import ReportStream from '../components/reports/ReportStream.vue'
import DecisionModal from '../components/decisions/DecisionModal.vue'
import OrderComposer from '../components/decisions/OrderComposer.vue'

const ui = computed(() => store.ui!)
const speedLabel = computed(() => ui.value.speed === 1 ? '×1' : ui.value.speed === 0.5 ? '×2' : '×4')
function pause(): void { stop() }
function cycleSpeed(): void {
  if (!store.ui) return
  const next = store.ui.speed === 1 ? 0.5 : store.ui.speed === 0.5 ? 0.25 : 1
  setSpeed(next)
}
</script>

<template>
  <div v-if="ui" class="battle">
    <header class="topbar">
      <div class="left">
        <span class="date">{{ ui.date }}</span>
        <span class="dot" />
        <span class="weather">{{ ui.weather }}</span>
        <span class="dot" />
        <span class="status">{{ ui.objectiveText }}</span>
        <span class="dot" />
        <span class="pressure" :class="{ high: ui.pressureText !== '魏廷未动' }">{{ ui.pressureText }}</span>
      </div>
      <div class="right">
        <span class="tokens">军令牌 <b>{{ ui.tokens }}</b></span>
        <button class="ctl" :class="{ playing: !ui.paused }" @click="toggle" :aria-label="ui.paused ? '继续' : '暂停'">
          {{ ui.paused ? '继续' : '暂停' }}
        </button>
        <button class="ctl" @click="step" :disabled="!ui.paused">单步</button>
        <button class="ctl" @click="cycleSpeed">{{ speedLabel }}</button>
        <button class="ctl primary" @click="openOrder">军令</button>
        <button class="ctl ghost" :title="audioState.enabled ? '关闭音效' : '开启音效'" @click="toggleAudio">{{ audioState.enabled ? '音效开' : '音效关' }}</button>
        <button class="ctl ghost" @click="abandon">放弃</button>
      </div>
    </header>

    <div class="stage">
      <div class="map-col">
        <MapStage />
        <div class="situation">
          <div class="sit-row"><span class="sit-label">战局</span><span>{{ ui.objectiveText }}</span><span class="sep">·</span><span>{{ ui.pressureText }}</span></div>
          <div class="sit-row muted">战场只显示已探明的控制区与敌军最后出现位置。军令有传令延迟，战报有来源与可信度。</div>
        </div>
        <div class="units">
          <div v-for="a in ui.armies" :key="a.id" class="unit">
            <b>{{ a.name }}</b>
            <span class="muted">{{ a.task }}{{ a.target ? ' · ' + a.target : '' }}</span>
            <span class="chips">
              <em>粮 {{ a.food }}</em><em>气 {{ a.morale }}</em><em>道 {{ a.supply }}</em>
            </span>
          </div>
        </div>
      </div>
      <ReportStream class="report-col" />
    </div>

    <DecisionModal />
    <OrderComposer v-if="store.orderOpen" />
  </div>
</template>

<style scoped>
.battle { height: 100%; display: flex; flex-direction: column; background: var(--paper); }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--line); background: #fffdf8; flex-wrap: wrap; }
.left, .right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.date { font-size: 13px; font-weight: 600; }
.dot { width: 3px; height: 3px; border-radius: 50%; background: var(--line-2); }
.weather, .status, .pressure { font-size: 12px; color: var(--ink-2); }
.pressure.high { color: var(--seal); }
.tokens { font-size: 12px; color: var(--ink-2); }
.tokens b { color: var(--seal); font-size: 14px; }
.ctl { border: 1px solid var(--line-2); background: #fff; border-radius: 7px; padding: 5px 11px; font-size: 12px; color: var(--ink-2); }
.ctl.playing { border-color: var(--ink); color: var(--ink); }
.ctl.primary { background: var(--ink); color: #fff; border-color: var(--ink); }
.ctl.ghost { border-color: transparent; color: var(--ink-3); }
.ctl:disabled { opacity: .4; }
.stage { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: 0; }
.map-col { position: relative; min-height: 0; display: flex; flex-direction: column; }
.situation { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(520px, 76%); background: rgba(255,253,248,.92); border: 1px solid var(--line); border-radius: 10px; padding: 9px 14px; backdrop-filter: blur(2px); }
.sit-row { font-size: 12px; color: var(--ink-2); display: flex; gap: 6px; align-items: center; }
.sit-row + .sit-row { margin-top: 3px; font-size: 11px; }
.sit-label { color: var(--ink-3); letter-spacing: .1em; }
.sep { color: var(--line-2); }
.units { position: absolute; left: 12px; top: 12px; display: flex; flex-direction: column; gap: 5px; pointer-events: none; }
.unit { background: rgba(255, 253, 248, .92); border: 1px solid var(--line); border-radius: 8px; padding: 5px 9px; font-size: 11.5px; display: flex; align-items: center; gap: 8px; }
.unit .chips { display: flex; gap: 6px; }
.unit em { font-style: normal; color: var(--ink-3); }
.report-col { min-height: 0; }
@media (max-width: 860px) {
  .stage { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .map-col { aspect-ratio: 5 / 3; max-height: 46vh; }
  .situation { display: none; }
  .units { display: none; }
  .topbar { padding: 7px 10px; }
}
@media (max-width: 480px) {
  .topbar { padding: 6px 8px; gap: 6px; }
  .left, .right { gap: 5px; }
  .date { font-size: 12px; }
  .weather, .status, .pressure { font-size: 11px; }
  .tokens { font-size: 11px; }
  .tokens b { font-size: 12px; }
  .ctl { padding: 4px 7px; font-size: 11px; border-radius: 6px; }
  .stage { grid-template-rows: 34vh minmax(0, 1fr); }
  .map-col { aspect-ratio: auto; max-height: none; }
}
</style>