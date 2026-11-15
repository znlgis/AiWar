<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
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

// —— 字号随容器反算 ——
// SVG 的 viewBox 是地图坐标系（约 1000x700），字号写死 13.5 会被整体缩放：
// 390px 手机上实际只有 5px 出头，靠 @media 调 CSS 字号没用（那改的是用户单位）。
// 所以先量容器实际宽度，再按「想要的 CSS 像素 / 缩放比」反算用户单位。
const containerWidth = ref(0)
const unitScale = computed(() => {
  const w = containerWidth.value
  const boxW = baseView.value.w
  if (!w || !boxW) return 1
  // 夹住上下限，避免极端容器宽度把字放大成标题
  return Math.max(0.8, Math.min(4, boxW / w))
})
const narrow = computed(() => containerWidth.value > 0 && containerWidth.value < 520)
const labelFs = computed(() => Math.round(( narrow.value ? 12.5 : 13.5 ) * unitScale.value * 10) / 10)

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
  return w > 0 && h > 0 ? w * h : 0
}

// 部队名布局：同城多军先扇形排开；不同城的标签挨太近时再换一侧。
// 只按「同一坐标」分组是不够的——两座城离得近时，两个都在 -22 偏移的
// 部队名会纵向叠上（实测「齐城军」压「轻车」）。这里落位前查一次碰撞。
const armyLayout = computed(() => {
  const fs = Math.round(12.5 * unitScale.value * 10) / 10
  const seen = new Map<string, number>()
  const totals = new Map<string, number>()
  for (const a of ui.value.armies) {
    const key = Math.round(a.x) + ":" + Math.round(a.y)
    totals.set(key, (totals.get(key) ?? 0) + 1)
  }
  const taken: Box[] = []
  const items: { id: string; x: number; y: number; labelY: number }[] = []
  for (const a of ui.value.armies) {
    const key = Math.round(a.x) + ":" + Math.round(a.y)
    const index = seen.get(key) ?? 0
    seen.set(key, index + 1)
    const total = totals.get(key) ?? 1
    // 扇形间距跟着标签宽度走：写死 34 而手机字号已到 35，两个名会直接叠上
    const span = Math.max(34, a.name.length * fs * 1.15)
    const x = total <= 1 ? a.x : a.x + (index - (total - 1) / 2) * span
    const preferred = total <= 1 ? -22 : (index % 2 === 0 ? -22 : 32)
    // 依次试：原侧 → 另一侧 → 更远的上/下
    const options = [preferred, preferred > 0 ? -22 : 32, -fs * 1.6 - 22, fs * 1.6 + 32]
    let chosen = preferred
    for (const dy of options) {
      const box = boxesOf([{ x, y: a.y + dy, anchor: "middle" }], fs, () => a.name)[0]!
      const area = (box.x2 - box.x1) * (box.y2 - box.y1)
      let clash = false
      for (const other of taken) {
        const otherArea = (other.x2 - other.x1) * (other.y2 - other.y1)
        if (overlapArea(box, other) > Math.min(area, otherArea) * 0.12) { clash = true; break }
      }
      if (!clash) { chosen = dy; taken.push(box); break }
    }
    items.push({ id: a.id, x, y: a.y, labelY: chosen })
  }
  return items
})

const armyLabelBoxes = computed<Box[]>(() => {
  const fs = Math.round(12.5 * unitScale.value * 10) / 10
  return armyLayout.value.map(it =>
    boxesOf([{ x: it.x, y: it.y + it.labelY, anchor: "middle" }], fs, () => ui.value.armies.find(a => a.id === it.id)?.name ?? "")[0]!,
  )
})

const labelPlacement = computed(() => {
  const placed: Box[] = []
  const labels: { id: string; x: number; y: number; anchor: string }[] = []
  const priority = (c: { kind: string; besieged: boolean; owner: string }) =>
    c.kind === 'capital' ? 0 : c.besieged ? 1 : c.owner === ui.value.playerFaction ? 2 : 3
  const list = ui.value.cities
    .filter(c => c.known || c.owner === ui.value.playerFaction)
    .slice()
    .sort((a, b) => priority(a) - priority(b))
  // 碰撞检测必须用实际渲染的字号，否则算出来的框和画出来的字对不上
  const fs = labelFs.value
  const pad = Math.max(4, fs * 0.45)
  for (const c of list) {
    const w = c.name.length * fs + pad
    const h = fs + pad
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
      // 也要避开部队名：原先城名只看城名，于是「平陆」会直接压在「齐城军」上
      for (const unitBox of armyLabelBoxes.value) cost += overlapArea(box, unitBox) * 2
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

// —— 地形 / 河流标签的避让 ——
// 城名此前只在彼此之间做碰撞检测，地形名（太行、漳水）与河名是独立渲染的，
// 于是 "太行" 直接压在 "邯郸" 上。这里把已摆放的城名与部队名当作禁区，
// 地形/河名放不下就整条不画——少一个地名，好过两行字叠成墨块。
// spacing：CSS 的 letter-spacing（.terrain-label 是 .16em）。不算进去的话
// 盒子比真实文字窄一截，边缘的重叠会被漏判——实测正好差 15%。
function boxesOf(labels: { x: number; y: number; anchor: string }[], fs: number, textOf: (l: any) => string, spacing = 0): Box[] {
  const pad = Math.max(3, fs * 0.35)
  return labels.map(l => {
    const w = textOf(l).length * fs * (1 + spacing) + pad
    // 真实渲染高度含行高（约 1.3em），只按字号估算会让盒子偏小、
    // 于是 15% 的重叠被判成「没超阈值」而放行。这里按行高留够。
    const h = fs * 1.3 + pad
    const left = l.anchor === "start" ? l.x : l.anchor === "end" ? l.x - w : l.x - w / 2
    const top = l.y - h * 0.8
    return { x1: left, y1: top, x2: left + w, y2: top + h }
  })
}
const labelBox = computed(() => new Map(labelPlacement.value.map(l => [l.id, l])))

// 城名与部队名占掉的区域：地形名与河名都要绕开
const occupiedBoxes = computed<Box[]>(() => {
  const cityBoxes = labelPlacement.value.map(l => {
    const name = ui.value.cities.find(c => c.id === l.id)?.name ?? ""
    return boxesOf([l], labelFs.value, () => name)[0]!
  })
  const armyBoxes = armyMarkers.value.map(a => {
    const fs = Math.round(12.5 * unitScale.value * 10) / 10
    return boxesOf([{ x: a.x, y: a.y + a.labelY, anchor: "middle" }], fs, () => a.name)[0]!
  })
  return [...cityBoxes, ...armyBoxes]
})

function blocksOccupied(box: Box): boolean {
  // 阈值 12%：实测 15%~21% 的重叠在 390px 屏上已经明显压字，
  // 原先的 30% 等于放行。宁可少画一个地名，也不要两行字叠在一起。
  const area = (box.x2 - box.x1) * (box.y2 - box.y1)
  if (area <= 0) return false
  let overlap = 0
  for (const other of occupiedBoxes.value) overlap += overlapArea(box, other)
  return overlap > area * 0.12
}

// 地形名与河名共用一个顺序分配器：
// 它们原先各算各的，「太行东麓」（山脊）和「太行东麓道」（关隘）会并排叠着，
// 因为两者都只避让城名、看不见彼此。这里每放下一个就往 occupied 里记一笔。
const terrainAndRiverLabels = computed(() => {
  const fsT = Math.round(10.5 * unitScale.value * 10) / 10
  const fsR = Math.round(11 * unitScale.value * 10) / 10
  // 序号顺序 = 绘制顺序，先到先得；近处优先，远处兜底
  const NUDGES: { dx: number; dy: number }[] = [
    { dx: 0, dy: 0 },
    { dx: 0, dy: -1.4 }, { dx: 0, dy: 1.4 },
    { dx: 1.8, dy: 0 }, { dx: -1.8, dy: 0 },
    { dx: 0, dy: -2.8 }, { dx: 0, dy: 2.8 },
    { dx: 3.2, dy: -1.4 }, { dx: -3.2, dy: -1.4 },
    { dx: 3.2, dy: 1.4 }, { dx: -3.2, dy: 1.4 },
  ]
  const taken: Box[] = [...occupiedBoxes.value]
  // 重叠按「较小一方面积」计：只按候选自身面积算，长地名压住短地名时
  // 比例会被摊薄（实测「邢」被压 21% 却因长名面积大而放行）
  const blocked = (box: Box): boolean => {
    const area = (box.x2 - box.x1) * (box.y2 - box.y1)
    if (area <= 0) return false
    for (const other of taken) {
      const otherArea = (other.x2 - other.x1) * (other.y2 - other.y1)
      const overlap = overlapArea(box, other)
      if (overlap > Math.min(area, otherArea) * 0.12) return true
    }
    return false
  }
  const terrain: (typeof ui.value.terrain[number])[] = []
  const rivers: (typeof roads.value[number] & { labelAt?: { x: number; y: number } })[] = []

  for (const t of ui.value.terrain) {
    if (!t.labelAt || !t.name) continue
    const base = t.labelAt
    for (const n of NUDGES) {
      const spot = { x: base.x + 2 + n.dx * fsT, y: base.y - 7 + n.dy * fsT }
      const box = boxesOf([{ x: spot.x, y: spot.y, anchor: "middle" }], fsT, () => t.name!, 0.16)[0]!
      if (blocked(box)) continue
      taken.push(box)
      terrain.push({ ...t, labelAt: spot })
      break
    }
  }

  for (const r of roads.value) {
    if (r.kind !== "river" || !r.name) continue
    const cx = (r.x1 + r.x2) / 2
    const cy = (r.y1 + r.y2) / 2 - 5
    for (const n of NUDGES) {
      const spot = { x: cx + n.dx * fsR, y: cy + n.dy * fsR }
      const box = boxesOf([{ x: spot.x, y: spot.y, anchor: "middle" }], fsR, () => r.name!)[0]!
      if (blocked(box)) continue
      taken.push(box)
      rivers.push({ ...r, labelAt: spot })
      break
    }
  }

  return { terrain, rivers }
})
const terrainLabels = computed(() => terrainAndRiverLabels.value.terrain)
const riverLabels = computed(() => terrainAndRiverLabels.value.rivers)

// 同城多支部队时把标记扇形排开：否则「北府兵」与「水军」会叠在同一个点上，谁也看不清
// 部队标记直接采用 armyLayout 的结果：位置与标签偏移都只有一份来源，
// 否则「算碰撞用的位置」和「画出来的位置」会各算各的，避让等于没做。
const armyMarkers = computed(() => {
  const byId = new Map(armyLayout.value.map(it => [it.id, it]))
  return ui.value.armies.map(a => {
    const it = byId.get(a.id)
    return { ...a, x: it?.x ?? a.x, y: it?.y ?? a.y, labelY: it?.labelY ?? -22 }
  })
})
// 道路样式：ops 战役有 rail（津浦线）/mountain（山道）/water，全部落到默认灰会让
// 铁路看起来和土路一样。抽成纯函数，模板里也能直接调。
type RoadStyle = { stroke: string; width: number; dash?: string }
const ROAD_STYLES: Record<string, RoadStyle> = {
  river: { stroke: '#7fa3ad', width: 2.2 },
  water: { stroke: '#7fa3ad', width: 2 },
  pass: { stroke: '#9a7f5a', width: 1.6, dash: '6 4' },
  mountain: { stroke: '#9a7f5a', width: 1.6 },
  rail: { stroke: '#6f6a5f', width: 1.8, dash: '8 3' },
  road: { stroke: '#c4c1b6', width: 1.2 },
}
function roadStyle(kind: string): RoadStyle {
  return ROAD_STYLES[kind] ?? ROAD_STYLES.road!
}

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

let resizeObserver: ResizeObserver | null = null
let onWindowResize: (() => void) | null = null
onMounted(() => {
  const el = svgRef.value
  if (!el) return
  const measure = () => { containerWidth.value = el.getBoundingClientRect().width }
  measure()
  if (typeof ResizeObserver !== "undefined") {
    // 只在宽度真的变化时写回，避免观察 → 重排 → 再观察的回环
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const next = entry.contentRect.width
        if (Math.abs(next - containerWidth.value) > 0.5) containerWidth.value = next
      }
    })
    resizeObserver.observe(el)
  } else {
    onWindowResize = measure
    window.addEventListener("resize", onWindowResize)
  }
})

onBeforeUnmount(() => {
  pointers.clear()
  resizeObserver?.disconnect()
  resizeObserver = null
  if (onWindowResize) { window.removeEventListener("resize", onWindowResize); onWindowResize = null }
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
            v-for="t in terrainLabels"
            :key="t.key + '-label'"
            class="terrain-label"
            :x="t.labelAt!.x"
            :y="t.labelAt!.y"
            text-anchor="middle"
            :font-size="Math.round(10.5 * unitScale * 10) / 10"
            fill="#5f6d73"
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
            :stroke="roadStyle(r.kind).stroke"
            :stroke-width="roadStyle(r.kind).width"
            :stroke-dasharray="roadStyle(r.kind).dash"
            stroke-linecap="round"
          />
          <text v-for="r in riverLabels" :key="r.id + '-label'"
            class="river-label" :x="r.labelAt!.x" :y="r.labelAt!.y" :font-size="Math.round(11 * unitScale * 10) / 10" fill="#4c6f7a" text-anchor="middle">{{ r.name }}</text>
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
                :font-size="labelFs" fill="#24262a" font-weight="600"
              >{{ c.name }}</text>
            </template>
            <template v-else>
              <circle r="4.5" fill="#d6d3c9" stroke="#bdb9ad" stroke-width="1" stroke-dasharray="2 2" />
              <text y="20" text-anchor="middle" :font-size="Math.round(11 * unitScale * 10) / 10" fill="#7d7a72">?</text>
            </template>
          </g>
        </g>
        <g>
          <g v-for="t in ui.traces" :key="t.id" :transform="'translate(' + t.x + ',' + t.y + ')'">
            <circle r="17" fill="none" :stroke="ui.traceColor" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75" />
            <text class="trace-label" y="-24" text-anchor="middle" :font-size="Math.round(11.5 * unitScale * 10) / 10" :fill="ui.traceColor">{{ ui.enemyLabel }} · {{ t.text }}</text>
          </g>
        </g>
        <g>
          <g v-for="a in armyMarkers" :key="a.id" :transform="'translate(' + a.x + ',' + a.y + ')'">
            <circle r="15" fill="#fffdf8" :stroke="ui.playerColor" stroke-width="2" />
            <circle r="5" :fill="ui.playerColor" />
            <text class="unit-label" :y="a.labelY" text-anchor="middle" :font-size="Math.round(12.5 * unitScale * 10) / 10" fill="#24586f" font-weight="600">{{ a.name }}</text>
          </g>
        </g>
      </g>
    </svg>

    <div class="map-tools">
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
/* 部队卡片在 left:12px/top:12px（BattleView），提示文字必须让开，否则宽屏上两段文字叠在一起 */
.map-hint { position: absolute; left: 12px; bottom: 10px; margin: 0; font-size: 11px; color: var(--ink-3); background: rgba(255, 253, 248, 0.82); border-radius: 6px; padding: 2px 7px; pointer-events: none; }
@media (max-width: 860px) {
  /* 字号已按容器宽度反算（见 script 里的 unitScale），不再用 CSS 覆盖：
     这里改的是用户单位，会被 viewBox 缩放抵消，等于没改。 */
  .map-hint { display: none; }
  .map-tools { right: 8px; bottom: 8px; }
}
</style>
