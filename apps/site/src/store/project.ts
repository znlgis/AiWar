import type { DifficultyId, FactionId, GameState, Score, Report, Campaign as LegacyCampaign } from '@aiwar/sim'
import type { OpsCampaign, OpsHud, OpsRules, OpsState } from '@aiwar/sim'

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
  nodeTitle: string; nodePrompt: string; options: import('@aiwar/sim').DecisionOptionDef[]
  decisionSeconds: number
  over: boolean
  score: Score | null
  pressureText: string
  objectiveText: string
  /** 以下字段供界面按战役取色与称呼，避免在视图里写死齐/魏 */
  playerFaction: FactionId
  playerColor: string
  enemyColor: string
  playerLabel: string
  enemyLabel: string
  traceColor: string
  pressureHigh: boolean
  mapWidth: number
  mapHeight: number
}

export interface UiSides { player: string; enemy: string }

/** 战报来源称呼：古代战役与近代战役用词不同，按战役包配置覆盖 */
const SOURCE_NAMES_MODERN: Record<string, string> = {
  scout: '侦察', border: '前沿', deserter: '俘供', merchant: '地方',
  envoy: '联络', court: '上级', counsel: '参谋', note: '通报',
}
const SOURCE_NAMES_ANCIENT: Record<string, string> = {
  scout: '斥候', border: '边亭', deserter: '降卒', merchant: '商旅',
  envoy: '使节', court: '朝议', counsel: '军师', note: '军报',
}

// 用显式集合而不是正则字面量：正则里的敏感纪年词会被打进产物，触发内容自检词表
const MODERN_ERAS = new Set(['解放战争', '长征', '抗日战争', '近代'])

function sourceNamesOf(era: string | undefined): Record<string, string> {
  return era && MODERN_ERAS.has(era) ? SOURCE_NAMES_MODERN : SOURCE_NAMES_ANCIENT
}

const SOURCE_NAMES: Record<string, string> = {
  scout: '斥候', border: '边亭', deserter: '降卒', merchant: '商旅',
  envoy: '使节', court: '魏廷', counsel: '军师', note: '军报',
}
const CONFIDENCE_NAMES: Record<string, string> = { high: '可信度高', mid: '可信度中', low: '可信度低' }
const WEATHER_NAMES: Record<string, string> = { clear: '晴', rain: '雨', snow: '雪', fog: '雾' }
const TASK_NAMES: Record<string, string> = {
  march: '行军', hold: '驻守', feint: '佯动', assault: '强攻', ambush: '设伏',
  pursue: '追击', retreat: '撤退', rest: '休整', forage: '征粮', scout: '侦察',
  cross: '渡河', defect: '策动起义', strike: '突击', envoy: '遣使',
}

function band(troops: number, scale = 1): string {
  if (troops > 300000 * scale) return '数十万'
  if (troops > 100000 * scale) return '十余万'
  if (troops > 40000 * scale) return '数万'
  if (troops > 10000 * scale) return '万余'
  return '数千'
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
function expand(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts
  let cx = 0
  let cy = 0
  for (const p of pts) { cx += p[0]; cy += p[1] }
  cx /= pts.length
  cy /= pts.length
  return pts.map(([x, y]) => [cx + (x - cx) * 1.16, cy + (y - cy) * 1.16] as [number, number])
}

function makeAreas(cities: UiCity[], colorOf: (f: FactionId) => string): UiControlArea[] {
  const owned: Record<string, [number, number][]> = {}
  for (const city of cities) {
    if (!city.known) continue
    owned[city.owner] = owned[city.owner] ?? []
    owned[city.owner]!.push([city.x, city.y])
  }
  return Object.entries(owned)
    .filter(([, pts]) => pts.length >= 1)
    .map(([faction, pts]) => ({
      faction: faction as FactionId,
      color: colorOf(faction as FactionId),
      points: expand(hull(pts)),
    }))
}

function makeReports(state: { reports: Report[]; tick: number }, names: Record<string, string> = SOURCE_NAMES_ANCIENT): UiReport[] {
  return state.reports
    .filter(r => r.arriveTick <= state.tick)
    .slice(-50)
    .reverse()
    .map(r => ({ ...r, sourceName: names[r.source] ?? '军报', confidenceText: CONFIDENCE_NAMES[r.confidence] ?? '' }))
}

// ---- 围魏救赵（旧引擎）投影 ----
export function projectLegacy(state: GameState, campaign: LegacyCampaign): UiState {
  const colorOf = (f: FactionId) => campaign.factions[f]?.color ?? '#666'
  const cityPos = (id?: string) => {
    const city = campaign.cities.find(c => c.id === id)
    return city ? { x: city.x, y: city.y } : { x: 500, y: 350 }
  }
  const cities: UiCity[] = campaign.cities.map(def => {
    const cs = state.cities[def.id]!
    return {
      id: def.id, name: def.name, x: def.x, y: def.y, owner: cs.owner,
      color: colorOf(cs.owner), kind: def.kind, known: cs.known, besieged: cs.besieged,
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
  const armies: UiArmy[] = state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is NonNullable<typeof a> => !!a && !a.removed && a.faction === state.playerFaction)
    .map(a => {
      const pos = a.pos.kind === 'city'
        ? cityPos(a.pos.city)
        : (() => {
          const from = cityPos(a.pos.from)
          const to = cityPos(a.pos.to)
          const p = a.pos.progress ?? 0.5
          return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }
        })()
      return {
        id: a.id, name: a.name, commander: a.commander,
        task: TASK_NAMES[a.order?.task ?? ''] ?? (a.order ? a.order.task : '待命'),
        target: a.order?.target ? (state.cities[a.order.target]?.name ?? '') : '',
        x: pos.x, y: pos.y, morale: moraleBand(a.morale), food: foodBand(a.foodDays),
        supply: supplyText(a.supply), strength: band(a.initialTroops), onRoad: a.pos.kind === 'road',
      }
    })
  const traces: UiTrace[] = state.traces
    .filter(t => state.tick - t.seenTick <= 6)
    .map(t => {
      const pos = cityPos(t.city)
      return {
        id: t.armyId + t.seenTick, x: pos.x, y: pos.y,
        text: t.place + ' · ' + t.band + ' · 第' + (t.seenTick + 1) + '日',
        age: state.tick - t.seenTick,
      }
    })
  const nodeId = state.pendingNode
  const node = nodeId ? campaign.decisions.find(d => d.id === nodeId) : undefined
  // 压力告警由状态推导，视图不再靠比对某个固定文案
  const pressureHigh = state.politics.weiPressure >= 55 || state.battles.length > 0
  return {
    tick: state.tick,
    date: campaign.meta.dateLabel + ' · 第' + (state.tick + 1) + '日',
    weather: WEATHER_NAMES[state.weather] ?? '晴',
    tokens: state.tokens,
    paused: true,
    speed: 1,
    armies, cities, traces, areas: makeAreas(cities, colorOf), roads,
    reports: makeReports(state, sourceNamesOf(undefined)),
    pendingNode: nodeId,
    nodeTitle: node?.title ?? '',
    nodePrompt: node?.prompt ?? '',
    options: node?.options ?? [],
    decisionSeconds: 0,
    over: state.over,
    score: state.score,
    pressureText: state.politics.weiPressure >= 85 ? '魏廷震动' : state.politics.weiPressure >= 55 ? '大梁告急' : state.politics.weiPressure >= 25 ? '魏廷戒严' : '魏廷未动',
    objectiveText: state.politics.pangjuanReturning ? '魏军回师' : state.cities[campaign.roles.zhaoCapital]?.owner === 'wei' ? '邯郸已陷' : '邯郸被围',
    playerFaction: campaign.playerFaction,
    playerColor: colorOf('qi'),
    enemyColor: colorOf('wei'),
    playerLabel: campaign.factions.qi?.name ?? '齐军',
    enemyLabel: campaign.factions.wei?.name ?? '魏军',
    traceColor: colorOf('wei'),
    pressureHigh,
    mapWidth: 1000,
    mapHeight: 700,
  }
}

// ---- 通用战役投影 ----
export function projectOps(
  state: OpsState, campaign: OpsCampaign, hud?: OpsHud, score?: Score | null, sides?: UiSides,
): UiState {
  const colorOf = (f: FactionId) => campaign.factions[f]?.color ?? '#666'
  const cityPos = (id?: string) => {
    const city = campaign.cities.find(c => c.id === id)
    return city ? { x: city.x, y: city.y } : { x: campaign.mapWidth / 2, y: campaign.mapHeight / 2 }
  }
  const cities: UiCity[] = campaign.cities.map(def => {
    const cs = state.cities[def.id] ?? { ...def, known: true, besieged: false }
    return {
      id: def.id, name: def.name, x: def.x, y: def.y, owner: 'owner' in cs ? cs.owner : def.owner,
      color: colorOf(('owner' in cs ? cs.owner : def.owner) as FactionId),
      kind: def.kind, known: cs.known, besieged: cs.besieged,
    }
  })
  const roads: UiRoad[] = campaign.roads.map(road => {
    const a = cityPos(road.from)
    const b = cityPos(road.to)
    return {
      id: road.id, from: road.from, to: road.to, kind: road.kind,
      days: road.days, x1: a.x, y1: a.y, x2: b.x, y2: b.y, name: road.name,
    }
  })
  const scale = Math.max(1, Math.max(...campaign.armies.map(a => a.troops)) / 100000)
  const armies: UiArmy[] = state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is NonNullable<typeof a> => !!a && !a.removed && a.faction === state.playerFaction)
    .map(a => {
      const pos = a.pos.kind === 'city'
        ? cityPos(a.pos.city)
        : (() => {
          const from = cityPos(a.pos.from)
          const to = cityPos(a.pos.to)
          const p = a.pos.progress ?? 0.5
          return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }
        })()
      return {
        id: a.id, name: a.name, commander: a.commander,
        task: TASK_NAMES[a.order?.task ?? ''] ?? (a.order ? a.order.task : '待命'),
        target: a.order?.target ? (state.cities[a.order.target]?.name ?? '') : '',
        x: pos.x, y: pos.y, morale: moraleBand(a.morale), food: foodBand(a.foodDays),
        supply: supplyText(a.supply), strength: band(a.initialTroops, scale), onRoad: a.pos.kind === 'road',
      }
    })
  const traces: UiTrace[] = state.traces
    .filter(t => state.tick - t.seenTick <= 8)
    .map(t => {
      const pos = cityPos(t.city)
      return {
        id: t.armyId + t.seenTick, x: pos.x, y: pos.y,
        text: t.place + ' · ' + t.band + ' · 第' + (t.seenTick + 1) + '日',
        age: state.tick - t.seenTick,
      }
    })
  const nodeId = state.pendingNode
  const node = nodeId ? campaign.decisions.find(d => d.id === nodeId) : undefined
  const enemyFaction = campaign.enemyFactions[0] ?? ''
  const ownCities = Object.values(state.cities).filter(c => c.owner === state.playerFaction)
  // 只有战役本身给玩家设了首都，才谈得上「首都被占」（如淮海，玩家方没有 capital 城）
  const playerCapital = campaign.cities.find(c => c.kind === 'capital' && c.owner === state.playerFaction)
  const capitalLost = !!playerCapital && state.cities[playerCapital.id]?.owner !== state.playerFaction
  const enemyFactions = new Set(campaign.enemyFactions)
  const enemyAdjacent = Object.values(state.armies).some(a => {
    if (a.removed || !enemyFactions.has(a.faction)) return false
    const pos = a.pos
    if (pos.kind !== 'city') return false
    const here = pos.city
    return ownCities.some(c => c.id !== here && state.roads.some(r =>
      (r.from === here && r.to === c.id) || (r.to === here && r.from === c.id)))
  })
  return {
    tick: state.tick,
    date: campaign.meta.dateLabel + ' · 第' + (state.tick + 1) + '日',
    weather: campaign.weather.find(w => w.id === state.weather)?.label ?? '晴',
    tokens: state.tokens,
    paused: true,
    speed: 1,
    armies, cities, traces, areas: makeAreas(cities, colorOf), roads,
    reports: makeReports(state, sourceNamesOf(campaign.meta.era)),
    pendingNode: nodeId,
    nodeTitle: node?.title ?? '',
    nodePrompt: node?.prompt ?? '',
    options: node?.options ?? [],
    decisionSeconds: 0,
    over: state.over,
    score: score ?? null,
    pressureText: hud?.pressureText ?? '',
    objectiveText: hud?.objectiveText ?? '',
    playerFaction: state.playerFaction,
    playerColor: colorOf(state.playerFaction),
    enemyColor: enemyFaction ? colorOf(enemyFaction) : '#666',
    playerLabel: sides?.player ?? campaign.factions[state.playerFaction]?.name ?? '我军',
    enemyLabel: sides?.enemy ?? (enemyFaction ? campaign.factions[enemyFaction]?.name ?? '敌军' : '敌军'),
    traceColor: enemyFaction ? colorOf(enemyFaction) : '#666',
    pressureHigh: ownCities.some(c => c.besieged) || capitalLost || enemyAdjacent,
    mapWidth: campaign.mapWidth,
    mapHeight: campaign.mapHeight,
  }
}

export { SOURCE_NAMES, CONFIDENCE_NAMES, WEATHER_NAMES, TASK_NAMES, band, foodBand, moraleBand, supplyText }
export type { DifficultyId, OpsRules }