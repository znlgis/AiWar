<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { store } from '../../store/game'

const ui = computed(() => store.ui!)
const pointsStr = (pts: [number, number][]) => pts.map(p => p[0] + ',' + p[1]).join(' ')
const roads = computed(() => ui.value.roads.filter(r => {
  const a = ui.value.cities.find(c => c.id === r.from)
  const b = ui.value.cities.find(c => c.id === r.to)
  return !!a && !!b && (a.known || b.known)
}))

// —— 视口：平移 + 缩放（拖动 / 滚轮 / 双指 / 双击复位）——
// 视野按战役地图尺寸推导：写死 900×540 会把四渡赤水的皎平渡等南部城邑裁在画外
const baseView = computed(() => {
  const w = ui.value.mapWidth || 1000
  const h = ui.value.mapHeight || 700
  const pad = Math.round(Math.min(w, h) * 0.07)
  return { x: -pad, y: -pad, w: w + pad * 2, h: h + pad * 2 }
})
const MIN_K = 1
const MAX_K = 4.5
const view = reactive({ x: 0, y: 0, k: 1 })
const svgRef = ref<SVGSVGElement | null>(null)

// 城名标签做重叠剔除：城邑密集时（如淮海、淝水寿阳周边）标签会压在一起，
// 优先保留都城、被围之城与玩家城，其余按顺序放置，放不下就不画名字（标记仍在）。
const labelIds = computed(() => {
  const placed: { x1: number; y1: number; x2: number; y2: number }[] = []
  const out = new Set<string>()
  const priority = (c: { kind: string; besieged: boolean; owner: string }) =>
    c.kind === 'capital' ? 0 : c.besieged ? 1 : c.owner === ui.value.playerFaction ? 2 : 3
  const list = ui.value.cities
    .filter(c => c.known || c.owner === ui.value.playerFaction)
    .slice()
    .sort((a, b) => priority(a) - priority(b))
  const fs = 13.5
  for (const c of list) {
    const w = c.name.length * fs + 6
    const h = fs + 5
    const x1 = c.x - w / 2
    const x2 = c.x + w / 2
    const y1 = c.y + 12
    const y2 = y1 + h
    if (placed.some(r => !(x2 < r.x1 || x1 > r.x2 || y2 < r.y1 || y1 > r.y2))) continue
    placed.push({ x1, y1, x2, y2 })
    out.add(c.id)
  }
  return out
})

// 同城多支部队时把标记扇形排开：否则「北府兵」与「水军」会叠在同一个点上，谁也看不清
const armyMarkers = computed(() => {
  const groups = new Map<string, number>()
  return ui.value.armies.map(a => {
    const key = Math.round(a.x) + ':' + Math.round(a.y)
    const index = groups.get(key) ?? 0
    groups.set(key, index + 1)
    const total = ui.value.armies.filter(o => Math.round(o.x) === Math.round(a.x) && Math.round(o.y) === Math.round(a.y)).length
    if (total <= 1) return { ...a, x: a.x, y: a.y, labelY: -22 }
    // 同城多军：横向排开，标签上下交错，避免两个名字叠在一起看不清
    return {
      ...a,
      x: a.x + (index - (total - 1) / 2) * 34,
      y: a.y,
      labelY: index % 2 === 0 ? -22 : 32,
    }
  })
})
const dragging = ref(false)
const pointers = new Map<number, { x: number; y: number }>()
let pinchStart: { dist: number; k: number; cx: number; cy: number; tx: number; ty: number } | null = null

function clampView(): void {
  const { x: vx, y: vy, w, h } = baseView.value
  const k = Math.min(MAX_K, Math.max(MIN_K, view.k))
  view.k = k
  view.x = Math.min(vx - k * vx, Math.max(vx + w - k * (vx + w), view.x))
  view.y = Math.min(vy - k * vy, Math.max(vy + h - k * (vy + h), view.y))
}

function svgPoint(evt: { clientX: number; clientY: number }): { x: number; y: number } {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const pt = svg.createSVGPoint()
  pt.x = evt.clientX
  pt.y = evt.clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

function zoomAt(cx: number, cy: number, factor: number): void {
  const next = Math.min(MAX_K, Math.max(MIN_K, view.k * factor))
  if (next === view.k) return
  const px = (cx - view.x) / view.k
  const py = (cy - view.y) / view.k
  view.k = next
  view.x = cx - px * next
  view.y = cy - py * next
  clampView()
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const p = svgPoint(e)
  zoomAt(p.x, p.y, e.deltaY < 0 ? 1.18 : 1 / 1.18)
}

function onPointerDown(e: PointerEvent): void {
  const el = e.currentTarget as SVGSVGElement
  el.setPointerCapture?.(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  dragging.value = true
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    if (a && b) {
      const mid = svgPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        k: view.k, cx: mid.x, cy: mid.y, tx: view.x, ty: view.y,
      }
    }
  }
}

function onPointerMove(e: PointerEvent): void {
  const prev = pointers.get(e.pointerId)
  if (!prev) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()]
    if (!a || !b) return
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const nextK = Math.min(MAX_K, Math.max(MIN_K, pinchStart.k * (dist / Math.max(1, pinchStart.dist))))
    const px = (pinchStart.cx - pinchStart.tx) / pinchStart.k
    const py = (pinchStart.cy - pinchStart.ty) / pinchStart.k
    view.k = nextK
    view.x = pinchStart.cx - px * nextK
    view.y = pinchStart.cy - py * nextK
    clampView()
    return
  }
  if (pointers.size !== 1) return
  const svg = svgRef.value
  if (!svg) return
  const ctm = svg.getScreenCTM()
  if (!ctm) return
  const scale = ctm.a || 1
  view.x += (e.clientX - prev.x) / scale
  view.y += (e.clientY - prev.y) / scale
  clampView()
}

function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchStart = null
  if (pointers.size === 0) dragging.value = false
}

function resetView(): void {
  view.x = 0
  view.y = 0
  view.k = 1
}

function zoomButton(factor: number): void {
  const v = baseView.value
  zoomAt(v.x + v.w / 2, v.y + v.h / 2, factor)
}

onBeforeUnmount(() => {
  pointers.clear()
})
</script>

<template>
  <div class="map-wrap" :class="{ dragging }">
    <svg
      ref="svgRef"
      class="map-svg"
      :viewBox="baseView.x + ' ' + baseView.y + ' ' + baseView.w + ' ' + baseView.h"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="势力范围图，可拖动缩放"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerUp"
      @dblclick="resetView"
    >
      <rect :x="-40" :y="-40" :width="ui.mapWidth + 80" :height="ui.mapHeight + 80" fill="#f7f6f1" />
      <g :transform="'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')'">
        <g>
          <polygon
            v-for="area in ui.areas"
            :key="area.faction"
            :points="pointsStr(area.points)"
            :fill="area.color"
            fill-opacity="0.10"
            :stroke="area.color"
            stroke-opacity="0.28"
            stroke-width="1"
          />
        </g>
        <g>
          <line
            v-for="r in roads"
            :key="r.id"
            :x1="r.x1" :y1="r.y1" :x2="r.x2" :y2="r.y2"
            :stroke="r.kind === 'river' ? '#7fa3ad' : r.kind === 'pass' ? '#9a7f5a' : '#c4c1b6'"
            :stroke-width="r.kind === 'river' ? 2.2 : r.kind === 'pass' ? 1.6 : 1.2"
            :stroke-dasharray="r.kind === 'pass' ? '6 4' : undefined"
            stroke-linecap="round"
          />
          <text v-for="r in roads.filter(x => x.kind === 'river' && x.name)" :key="r.id + '-label'"
            class="river-label" :x="(r.x1 + r.x2) / 2" :y="(r.y1 + r.y2) / 2 - 5" font-size="11" fill="#7295a0" text-anchor="middle">{{ r.name }}</text>
        </g>
        <g>
          <g v-for="c in ui.cities" :key="c.id" :transform="'translate(' + c.x + ',' + c.y + ')'">
            <template v-if="c.known || c.owner === ui.playerFaction">
              <circle v-if="c.kind === 'capital'" r="7.5" :fill="c.color" stroke="#fffdf8" stroke-width="2" />
              <rect v-else-if="c.kind === 'fort'" x="-5" y="-5" width="10" height="10" :fill="c.color" stroke="#fffdf8" stroke-width="2" />
              <circle v-else r="5.2" :fill="c.color" stroke="#fffdf8" stroke-width="1.8" />
              <circle v-if="c.besieged" r="13" fill="none" :stroke="c.color" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.8" />
              <text v-if="labelIds.has(c.id)" class="city-label" y="22" text-anchor="middle" font-size="13.5" fill="#24262a" font-weight="600">{{ c.name }}</text>
            </template>
            <template v-else>
              <circle r="4.5" fill="#d6d3c9" stroke="#bdb9ad" stroke-width="1" stroke-dasharray="2 2" />
              <text y="20" text-anchor="middle" font-size="11" fill="#a8a49a">?</text>
            </template>
          </g>
        </g>
        <g>
          <g v-for="t in ui.traces" :key="t.id" :transform="'translate(' + t.x + ',' + t.y + ')'">
            <circle r="17" fill="none" :stroke="ui.traceColor" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75" />
            <text class="trace-label" y="-24" text-anchor="middle" font-size="11.5" :fill="ui.traceColor">{{ ui.enemyLabel }} · {{ t.text }}</text>
          </g>
        </g>
        <g>
          <g v-for="a in armyMarkers" :key="a.id" :transform="'translate(' + a.x + ',' + a.y + ')'">
            <circle r="15" fill="#fffdf8" :stroke="ui.playerColor" stroke-width="2" />
            <circle r="5" :fill="ui.playerColor" />
            <text class="unit-label" :y="a.labelY" text-anchor="middle" font-size="12.5" fill="#24586f" font-weight="600">{{ a.name }}</text>
          </g>
        </g>
      </g>
    </svg>

    <div class="map-tools" @pointerdown.stop @wheel.stop>
      <button type="button" aria-label="放大" @click="zoomButton(1.3)">+</button>
      <button type="button" aria-label="缩小" @click="zoomButton(1 / 1.3)">−</button>
      <button type="button" class="reset" aria-label="复位" @click="resetView">复位</button>
    </div>
    <p class="map-hint">拖动平移 · 滚轮 / 双指缩放 · 双击复位</p>
  </div>
</template>

<style scoped>
.map-wrap { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f7f6f1; overflow: hidden; }
.map-wrap.dragging { cursor: grabbing; }
.map-svg { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; user-select: none; }
.map-svg:active { cursor: grabbing; }
text { font-family: var(--font); user-select: none; }
.map-tools { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 6px; align-items: center; }
.map-tools button {
  width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--line-2);
  background: rgba(255, 253, 248, 0.94); color: var(--ink-2); font-size: 17px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.map-tools button.reset { width: auto; padding: 0 10px; font-size: 12px; }
.map-tools button:hover { border-color: var(--ink-3); }
.map-hint { position: absolute; left: 12px; top: 10px; margin: 0; font-size: 11px; color: var(--ink-3); background: rgba(255, 253, 248, 0.82); border-radius: 6px; padding: 2px 7px; pointer-events: none; }
@media (max-width: 860px) {
  /* 小屏上字体单位被整体缩得更小，标签反而更容易糊在一起：略放大，靠上面的重叠剔除保证可读 */
  .city-label { font-size: 15px; }
  .unit-label { font-size: 13px; }
  .trace-label { font-size: 12px; }
  .river-label { font-size: 11px; }
  .map-hint { display: none; }
  .map-tools { right: 8px; bottom: 8px; }
}
</style>
