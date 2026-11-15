<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { store } from '../../store/game'
import { curvedRoadPath } from '../../store/mapGeometry'

const ui = computed(() => store.ui!)
const roads = computed(() => ui.value.roads.filter(r => {
  const a = ui.value.cities.find(c => c.id === r.from)
  const b = ui.value.cities.find(c => c.id === r.to)
  return !!a && !!b && (a.known || b.known)
}).map(r => ({
  ...r,
  // 道路走一条轻微弧线：直线在密集的路网上像网格，弧线更像手绘
  d: curvedRoadPath(r.x1, r.y1, r.x2, r.y2, r.kind === 'river' ? 0.05 : 0.07),
})))

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

// 城名标签放置：城邑密集时（淮海、淝水寿阳周边）名字会压在一起。
// 原来的做法是「只试正下方一个位置，压到就整条不画」，城区一密就有一半城名消失。
// 改成：按优先级依次放置，每个城试下/上/右/左四个候选位，取重叠面积最小的那个；
// 四个位置都压得厉害时仍保留标记、放弃文字，避免糊成一团。
type Box = { x1: number; y1: number; x2: number; y2: number }
const LABEL_FS = 13.5

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
  return w > 0 && h > 0 ? w * h : 0
}

const labelPlacement = computed(() => {
  const placed: Box[] = []
  const labels: { id: string; x: number; y: number; anchor: string }[] = []
  const priority = (c: { kind: string; besieged: boolean; owner: string }) =>
    c.kind === 'capital' ? 0 : c.besieged ? 1 : c.owner === ui.value.playerFaction ? 2 : 3
  const list = ui.value.cities
    .filter(c => c.known || c.owner === ui.value.playerFaction)
    .slice()
    .sort((a, b) => priority(a) - priority(b))
  for (const c of list) {
    const w = c.name.length * LABEL_FS + 6
    const h = LABEL_FS + 5
    const candidates = [
      { dx: 0, dy: 12 + h, anchor: 'middle' },   // 正下方
      { dx: 0, dy: -10 - h, anchor: 'middle' },  // 正上方
      { dx: 10, dy: -h / 2, anchor: 'start' },   // 右侧
      { dx: -10, dy: -h / 2, anchor: 'end' },    // 左侧
    ]
    let best: { box: Box; x: number; y: number; anchor: string; cost: number } | null = null
    for (const cand of candidates) {
      const left = cand.anchor === 'start' ? c.x + cand.dx : cand.anchor === 'end' ? c.x + cand.dx - w : c.x - w / 2
      const top = c.y + cand.dy
      const box: Box = { x1: left, y1: top, x2: left + w, y2: top + h }
      // 与已放置标签的重叠 + 与城邑标记（半径 8）的重叠，都算代价
      let cost = placed.reduce((sum, r) => sum + overlapArea(box, r), 0)
      for (const other of list) {
        if (other.id === c.id) continue
        const marker: Box = { x1: other.x - 8, y1: other.y - 8, x2: other.x + 8, y2: other.y + 8 }
        cost += overlapArea(box, marker) * 3
      }
      if (!best || cost < best.cost) best = { box, x: left, y: top + h - 6, anchor: cand.anchor, cost }
    }
    if (!best) continue
    // 代价超过标签面积的 60% 就不画文字（标记仍在），否则字会压成一团
    if (best.cost > (w * h) * 0.6) continue
    placed.push(best.box)
    labels.push({ id: c.id, x: best.anchor === 'middle' ? c.x : best.x + (best.anchor === 'end' ? w : 0), y: best.y, anchor: best.anchor })
  }
  return labels
})

const labelIds = computed(() => new Set(labelPlacement.value.map(l => l.id)))
const labelBox = computed(() => new Map(labelPlacement.value.map(l => [l.id, l])))

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
        <!-- 地形层：山系笔触、河流、湖泊。压在势力区之下，先读地理再读战线 -->
        <g class="terrain">
          <template v-for="t in ui.terrain" :key="t.key">
            <path
              v-if="t.kind === 'lake' || t.kind === 'coast'"
              :d="t.d"
              fill="#dbe6ea"
              fill-opacity="0.55"
              stroke="#9fb8c0"
              stroke-opacity="0.5"
              stroke-width="0.8"
            />
            <path
              v-else-if="t.kind === 'ridge'"
              :d="t.d"
              fill="none"
              stroke="#a89c86"
              stroke-opacity="0.35"
              stroke-width="1"
            />
            <path
              v-else
              :d="t.d"
              fill="none"
              :stroke="t.kind === 'pass' ? '#9a7f5a' : '#7fa3ad'"
              :stroke-opacity="t.kind === 'pass' ? 0.75 : 0.85"
              :stroke-width="t.weight === 3 ? 2 : t.weight === 2 ? 1.4 : 1"
              :stroke-dasharray="t.kind === 'pass' ? '5 4' : undefined"
              stroke-linecap="round"
            />
            <path
              v-if="t.kind === 'ridge' && t.hatch"
              :d="t.hatch"
              fill="none"
              stroke="#9c8f78"
              stroke-opacity="0.7"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </template>
          <text
            v-for="t in ui.terrain.filter(x => x.labelAt && x.name)"
            :key="t.key + '-label'"
            class="terrain-label"
            :x="t.labelAt!.x + 2"
            :y="t.labelAt!.y - 7"
            text-anchor="middle"
            font-size="10.5"
            fill="#8b9aa0"
          >{{ t.name }}</text>
        </g>
        <g>
          <!-- 势力区按「最近城邑」划分：同势力相邻格只填色不描边，接成一片；
               描边会在格子之间留下接缝，看着像一堆泡泡而不是疆域。 -->
          <template v-for="area in ui.areas" :key="area.faction">
            <path
              v-for="cell in area.cells"
              :key="cell.key"
              :d="cell.path"
              :fill="area.color"
              fill-opacity="0.13"
              :stroke="area.color"
              stroke-opacity="0.13"
              stroke-width="2.5"
              stroke-linejoin="round"
            />
          </template>
        </g>
        <g>
          <path
            v-for="r in roads"
            :key="r.id"
            :d="r.d"
            fill="none"
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
              <text
                v-if="labelBox.get(c.id)"
                class="city-label"
                :x="labelBox.get(c.id)!.x - c.x"
                :y="labelBox.get(c.id)!.y - c.y"
                :text-anchor="labelBox.get(c.id)!.anchor"
                font-size="13.5" fill="#24262a" font-weight="600"
              >{{ c.name }}</text>
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
.terrain { pointer-events: none; }
.terrain-label { font-family: var(--font); user-select: none; letter-spacing: .16em; opacity: .8; }
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
