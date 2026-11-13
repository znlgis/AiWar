import { reactive } from 'vue'
import type {
  GameState, DifficultyId, Score, Report, Task, Modifier, OrderDraft, DecisionOptionDef, FactionId,
} from '@aiwar/sim'
import {
  advanceDay, canIssue, createGame, finalize, issueOrder, orderSentence,
  resolveDecision, seedOpening, timeoutNode, visibleReports,
} from '@aiwar/sim'
import { guilingCampaign as campaign, narrator } from '@aiwar/content'
import { sfx } from '../audio/sfx'

export type ViewName = 'title' | 'briefing' | 'battle' | 'result' | 'about'

export interface UiArmy {
  id: string; name: string; commander: string; task: string; target: string
  x: number; y: number; morale: string; food: string; supply: string
  strength: string; onRoad: boolean
}
export interface UiCity {
  id: string; name: string; x: number; y: number; owner: FactionId; color: string
  kind: string; known: boolean; besieged: boolean
}
export interface UiTrace { id: string; x: number; y: number; text: string; age: number }
export interface UiReport extends Report { sourceName: string; confidenceText: string }
export interface UiControlArea { faction: FactionId; color: string; points: [number, number][] }
export interface UiRoad {
  id: string; from: string; to: string; kind: string; days: number
  x1: number; y1: number; x2: number; y2: number; name?: string
}

export interface UiState {
  tick: number; date: string; weather: string
  tokens: number; paused: boolean; speed: number
  armies: UiArmy[]; cities: UiCity[]; traces: UiTrace[]; areas: UiControlArea[]; roads: UiRoad[]
  reports: UiReport[]
  pendingNode: string | null
  nodeTitle: string; nodePrompt: string; options: DecisionOptionDef[]
  decisionSeconds: number
  over: boolean
  score: Score | null
  pressureText: string
  objectiveText: string
}

const SOURCE_NAMES: Record<string, string> = {
  scout: '斥候', border: '边亭', deserter: '降卒', merchant: '商旅',
  envoy: '使节', court: '魏廷', counsel: '军师', note: '军报',
}
const CONFIDENCE_NAMES: Record<string, string> = { high: '可信度高', mid: '可信度中', low: '可信度低' }
const WEATHER_NAMES: Record<string, string> = { clear: '晴', rain: '雨', snow: '雪', fog: '雾' }

export const store = reactive({
  view: 'title' as ViewName,
  difficulty: 'normal' as DifficultyId,
  seed: 0,
  ui: null as UiState | null,
  orderOpen: false,
  hasSave: false,
})

let game: GameState | null = null
let timer: number | null = null
let decisionTimer: number | null = null

function band(troops: number): string {
  return troops > 60000 ? '众' : troops > 30000 ? '多' : troops > 12000 ? '中' : '寡'
}
function foodBand(days: number): string {
  return days > 20 ? '足' : days > 8 ? '尚可' : days > 3 ? '将尽' : '已断'
}
function moraleBand(v: number): string {
  return v > 70 ? '振' : v > 45 ? '稳' : v > 25 ? '疲' : '惰'
}
function supplyText(s: string): string {
  return s === 'ok' ? '通' : s === 'threatened' ? '受威胁' : '已断'
}
export function factionColor(f: FactionId): string {
  return campaign.factions[f]?.color ?? '#666'
}
function cityPos(id?: string): { x: number; y: number } {
  if (!id) return { x: 500, y: 350 }
  const city = campaign.cities.find(c => c.id === id)
  return city ? { x: city.x, y: city.y } : { x: 500, y: 350 }
}
function roadPos(from?: string, to?: string, progress = 0.5): { x: number; y: number } {
  const a = cityPos(from)
  const b = cityPos(to)
  return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress }
}
function hull(points: [number, number][]): [number, number][] {
  if (points.length === 1) {
    const [x, y] = points[0]!
    const r = 30
    return [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]
  }
  if (points.length < 3) return points
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  const result = lower.concat(upper)
  return result.length >= 3 ? result : points
}
function areaPoints(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts
  let cx = 0
  let cy = 0
  for (const p of pts) { cx += p[0]; cy += p[1] }
  cx /= pts.length
  cy /= pts.length
  return pts.map(([x, y]) => [cx + (x - cx) * 1.16, cy + (y - cy) * 1.16] as [number, number])
}

export function project(state: GameState): UiState {
  const cities: UiCity[] = campaign.cities.map(def => {
    const cs = state.cities[def.id]!
    return {
      id: def.id, name: def.name, x: def.x, y: def.y, owner: cs.owner,
      color: factionColor(cs.owner), kind: def.kind, known: cs.known, besieged: cs.besieged,
    }
  })
  const roads: UiRoad[] = campaign.roads.map(road => {
    const a = cityPos(road.from)
    const b = cityPos(road.to)
    return {
      id: road.id, from: road.from, to: road.to, kind: road.kind ?? 'road',
      days: road.days, x1: a.x, y1: a.y, x2: b.x, y2: b.y, name: road.name,
    }
  })
  const owned: Record<string, [number, number][]> = {}
  const peripheral = new Set(['anyi', 'shaoliang', 'chen'])
  for (const city of cities) {
    if (peripheral.has(city.id)) continue
    if (!city.known && city.owner !== 'qi') continue
    owned[city.owner] = owned[city.owner] ?? []
    owned[city.owner]!.push([city.x, city.y])
  }
  const areas: UiControlArea[] = Object.entries(owned)
    .filter(([, pts]) => pts.length >= 1)
    .map(([faction, pts]) => ({
      faction: faction as FactionId, color: factionColor(faction as FactionId), points: areaPoints(hull(pts)),
    }))
  const armies: UiArmy[] = state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is NonNullable<typeof a> => !!a && !a.removed && a.faction === 'qi')
    .map(a => {
      const pos = a.pos.kind === 'city' ? cityPos(a.pos.city) : roadPos(a.pos.from, a.pos.to, a.pos.progress ?? 0.5)
      return {
        id: a.id, name: a.name, commander: a.commander,
        task: a.order ? a.order.task : '待命',
        target: a.order?.target ? (state.cities[a.order.target]?.name ?? '') : '',
        x: pos.x, y: pos.y, morale: moraleBand(a.morale), food: foodBand(a.foodDays),
        supply: supplyText(a.supply), strength: band(a.initialTroops), onRoad: a.pos.kind === 'road',
      }
    })
  const traces: UiTrace[] = state.traces
    .filter(t => t.faction === 'wei' && state.tick - t.seenTick <= 6)
    .map(t => {
      let pos = cityPos(t.city)
      if (!t.city && t.road) {
        const road = campaign.roads.find(r => r.id === t.road)
        if (road) pos = roadPos(road.from, road.to, 0.5)
      }
      return {
        id: t.armyId + t.seenTick, x: pos.x, y: pos.y,
        text: t.place + ' · ' + t.band + ' · 第' + (t.seenTick + 1) + '日',
        age: state.tick - t.seenTick,
      }
    })
  const reports: UiReport[] = visibleReports(state)
    .slice(-50)
    .reverse()
    .map(r => ({ ...r, sourceName: SOURCE_NAMES[r.source] ?? '军报', confidenceText: CONFIDENCE_NAMES[r.confidence] ?? '' }))
  const nodeId = state.pendingNode
  const node = nodeId ? campaign.decisions.find(d => d.id === nodeId) : undefined
  return {
    tick: state.tick,
    date: campaign.meta.dateLabel + ' · 第' + (state.tick + 1) + '日',
    weather: WEATHER_NAMES[state.weather] ?? '晴',
    tokens: state.tokens,
    paused: store.ui ? store.ui.paused : true,
    speed: store.ui ? store.ui.speed : 1,
    armies, cities, traces, areas, roads, reports,
    pendingNode: nodeId,
    nodeTitle: node?.title ?? '',
    nodePrompt: node?.prompt ?? '',
    options: node?.options ?? [],
    decisionSeconds: store.ui?.decisionSeconds ?? 0,
    over: state.over,
    score: state.score,
    pressureText: state.politics.weiPressure >= 85 ? '魏廷震动' : state.politics.weiPressure >= 55 ? '大梁告急' : state.politics.weiPressure >= 25 ? '魏廷戒严' : '魏廷未动',
    objectiveText: state.politics.pangjuanReturning ? '魏军回师' : state.cities[campaign.roles.zhaoCapital]?.owner === 'wei' ? '邯郸已陷' : '邯郸被围',
  }
}

function persist(): void {
  if (!game) return
  try {
    localStorage.setItem('aiwar.save.v1', JSON.stringify({
      v: 1, difficulty: store.difficulty, seed: store.seed, state: game, savedAt: Date.now(),
    }))
    store.hasSave = true
  } catch { /* 存储不可用时静默 */ }
}

function finish(): void {
  if (!game) return
  stop()
  if (!game.score) game.score = finalize(game, campaign)
  store.ui = project(game)
  store.view = 'result'
  if (game.score && (game.score.grade === 'S' || game.score.grade === 'A')) sfx.win()
  else sfx.lose()
}

function tickLoop(): void {
  if (!game) return
  if (store.ui?.pendingNode) return
  if (store.ui?.paused) return
  advanceDay(game, campaign, narrator)
  store.ui = project(game)
  const fresh = store.ui.reports.filter(r => r.arriveTick === game!.tick && r.important)
  if (fresh.length > 0) sfx.drum(fresh.length > 1)
  if (game.tick % 4 === 0) persist()
  if (game.over) { finish(); return }
  if (game.pendingNode) { sfx.horn(); stop(); startDecisionTimer() }
}

function startDecisionTimer(): void {
  if (!store.ui) return
  sfx.horn()
  const seconds = campaign.difficulty[store.difficulty].decisionSeconds
  store.ui.decisionSeconds = seconds
  if (decisionTimer) window.clearInterval(decisionTimer)
  decisionTimer = window.setInterval(() => {
    if (!game || !game.pendingNode || !store.ui) { window.clearInterval(decisionTimer!); return }
    store.ui.decisionSeconds -= 1
    if (store.ui.decisionSeconds <= 0) {
      window.clearInterval(decisionTimer!)
      timeoutNode(game, campaign, narrator)
      store.ui = project(game)
      persist()
      if (game.over) finish()
      else start()
    }
  }, 1000)
}

export function startGame(load = false): void {
  game = null
  if (load) {
    const raw = localStorage.getItem('aiwar.save.v1')
    if (raw) {
      try {
        const save = JSON.parse(raw) as { difficulty: DifficultyId; seed: number; state: GameState }
        if (!save.state?.cities || !save.state?.armies) throw new Error('bad save')
        store.difficulty = save.difficulty
        store.seed = save.seed
        game = save.state
      } catch { game = null }
    }
  }
  if (!game) {
    store.seed = Math.floor(Math.random() * 1e9)
    game = createGame({ campaign, difficulty: store.difficulty, seed: store.seed })
    seedOpening(game, campaign, narrator)
  }
  store.ui = project(game)
  store.view = 'battle'
  if (game.over) finish()
  else start()
}

export function start(): void {
  if (!store.ui) return
  store.ui.paused = false
  if (timer) window.clearInterval(timer)
  timer = window.setInterval(tickLoop, store.ui.speed * 650)
}

export function stop(): void {
  if (timer) window.clearInterval(timer)
  timer = null
  if (store.ui) store.ui.paused = true
}

export function toggle(): void {
  if (store.ui?.paused) start()
  else stop()
}

export function setSpeed(v: number): void {
  if (!store.ui) return
  store.ui.speed = v
  if (timer) { window.clearInterval(timer); timer = null; start() }
}

export function step(): void {
  if (!game) return
  stop()
  advanceDay(game, campaign, narrator)
  store.ui = project(game)
  if (game.over) { finish(); return }
  if (game.pendingNode) startDecisionTimer()
}

export function choose(optionId: string): void {
  if (!game || !game.pendingNode) return
  sfx.click()
  stop()
  if (decisionTimer) window.clearInterval(decisionTimer)
  const nodeId = game.pendingNode
  resolveDecision(game, campaign, narrator, nodeId, optionId)
  store.ui = project(game)
  persist()
  if (game.over) finish()
  else start()
}

export function openOrder(): void { store.orderOpen = true }
export function closeOrder(): void { store.orderOpen = false }

export function submitOrder(draft: OrderDraft): string | null {
  if (!game) return '尚未开局'
  const reason = canIssue(game, draft)
  if (reason) return reason
  issueOrder(game, draft)
  sfx.click()
  store.ui = project(game)
  persist()
  return null
}

export function orderPreview(draft: OrderDraft): string {
  if (!game) return ''
  return orderSentence(game, draft)
}

export function backToTitle(): void {
  stop()
  if (decisionTimer) window.clearInterval(decisionTimer)
  store.view = 'title'
  store.orderOpen = false
}

export function exitToTitle(): void {
  persist()
  backToTitle()
}

export function abandon(): void {
  if (window.confirm('放弃当前战局并返回标题？')) {
    localStorage.removeItem('aiwar.save.v1')
    store.hasSave = false
    game = null
    store.ui = null
    backToTitle()
  }
}

export function newCampaign(): void {
  localStorage.removeItem('aiwar.save.v1')
  store.hasSave = false
  game = null
  store.ui = null
  store.view = 'title'
}

export function toBriefing(): void { store.view = 'briefing' }
export function toAbout(): void { store.view = 'about' }
export function toTitle(): void { store.view = 'title' }
export function checkSave(): void { store.hasSave = !!localStorage.getItem('aiwar.save.v1') }

export function initStore(): void {
  checkSave()
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })
}

export { campaign, narrator }
export type { Task, Modifier }
