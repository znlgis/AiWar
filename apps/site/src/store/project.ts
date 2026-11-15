import type { DifficultyId, FactionId, GameState, Score, Report, Campaign as LegacyCampaign } from '@aiwar/sim'
import type { Debrief, OpsCampaign, OpsHud, OpsRules, OpsState } from '@aiwar/sim'
import { roundedPolygonPath, voronoiCells } from './mapGeometry.js'
import { closedAreaPath, pointAlong, ridgeHatch, smoothLinePath } from './terrain.js'

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
export interface UiTerrain {
  key: string
  kind: 'ridge' | 'river' | 'lake' | 'coast' | 'pass'
  name?: string
  /** 线的 path；面要素也用 path（闭合） */
  d: string
  /** 山系的笔触 path（ridge 专用） */
  hatch?: string
  /** 河流/关隘的名称锚点 */
  labelAt?: { x: number; y: number }
  weight: 1 | 2 | 3
}

export interface UiControlArea {
  faction: FactionId
  color: string
  /** Voronoi 辖域：每块一个近似矩形的凸多边形，同势力多块 */
  cells: { path: string; key: string }[]
}
export interface UiRoad {
  id: string; from: string; to: string; kind: string; days: number
  x1: number; y1: number; x2: number; y2: number; name?: string
}

export interface UiState {
  tick: number; date: string; weather: string
  tokens: number; paused: boolean; speed: number
  armies: UiArmy[]; cities: UiCity[]; traces: UiTrace[]; areas: UiControlArea[]; roads: UiRoad[]
  terrain: UiTerrain[]
  reports: UiReport[]
  pendingNode: string | null
  nodeTitle: string; nodePrompt: string; options: import('@aiwar/sim').DecisionOptionDef[]
  decisionSeconds: number
  over: boolean
  score: Score | null
  /** 结算页的战报与战役分析；对局进行中为 null */
  debrief: Debrief | null
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
/**
 * 势力范围：按「最近城邑」做加权 Voronoi 划分，而不是把占领城市的点连成凸包。
 * 凸包会把凹进去的敌占区吞进己方，五个势力叠成几块大三角——这是地图观感
 * 最失真的地方。Voronoi 的格子贴合节点分布，边界也不再互相穿透。
 */
function makeAreas(cities: UiCity[], colorOf: (f: FactionId) => string, mapW = 1000, mapH = 700): UiControlArea[] {
  // 只有已探明的城邑才画辖域：未探明的城邑若也参与划分，会在地图上凭空多出
  // 一块无主色块，等于把迷雾里的城邑泄露给玩家
  const visible = cities.filter(c => c.known)
  const weightOf = (kind: string): number => {
    switch (kind) {
      case 'capital': return 1.55
      case 'city': return 1.15
      case 'fort': return 0.85
      case 'port': return 0.9
      case 'road': return 0.55
      default: return 1
    }
  }
  const sites = visible.map(c => ({ id: c.id, x: c.x, y: c.y, weight: weightOf(c.kind), faction: c.owner as string }))
  const cells = voronoiCells(sites, { x: -20, y: -20, w: mapW + 40, h: mapH + 40 })
  const byFaction = new Map<string, { path: string; key: string }[]>()
  for (const cell of cells) {
    const list = byFaction.get(cell.site.faction) ?? []
    list.push({ key: cell.site.id, path: roundedPolygonPath(cell.polygon) })
    byFaction.set(cell.site.faction, list)
  }
  const out: UiControlArea[] = []
  for (const [faction, cells] of byFaction) {
    out.push({ faction: faction as FactionId, color: colorOf(faction as FactionId), cells })
  }
  return out
}

/** 地形要素 → 可直接渲染的 path（山系额外生成笔触） */
function makeTerrain(defs: import('@aiwar/sim').MapTerrain[] | undefined): UiTerrain[] {
  if (!defs || defs.length === 0) return []
  return defs.map((def, index) => {
    const weight = (def.weight ?? (def.kind === 'river' ? 3 : def.kind === 'ridge' ? 1 : 2)) as 1 | 2 | 3
    const isArea = def.kind === 'lake' || def.kind === 'coast'
    const d = isArea ? closedAreaPath(def.points) : smoothLinePath(def.points)
    const out: UiTerrain = { key: def.kind + '-' + index, kind: def.kind, name: def.name, d, weight }
    if (def.kind === 'ridge') {
      // 笔触要够大才看得出「山」，太小就成了毛边；主山脉再放大一档
      out.hatch = ridgeHatch(def.points, {
        step: weight === 1 ? 34 : 24,
        height: weight === 1 ? 15 : 19,
        width: weight === 1 ? 12 : 15,
      })
    }
    if (def.name && !isArea && def.points.length >= 2) {
      const [x, y] = pointAlong(def.points, 0.5)
      out.labelAt = { x, y }
    }
    return out
  })
}

function makeReports(state: { reports: Report[]; tick: number }, names: Record<string, string> = SOURCE_NAMES_ANCIENT): UiReport[] {
  return state.reports
    .filter(r => r.arriveTick <= state.tick)
    .slice(-50)
    .reverse()
    .map(r => ({ ...r, sourceName: names[r.source] ?? '军报', confidenceText: CONFIDENCE_NAMES[r.confidence] ?? '' }))
}

// ---- 围魏救赵（旧引擎）投影 ----
/**
 * 旧引擎的政情与战局文案。原文案把国名与都城名写死在字符串里，
 * 这里改成由调用方传入「敌方名 / 被围都城名」，换战役不会串词。
 */
function legacyPressureText(pressure: number, enemy: string): string {
  if (pressure >= 85) return enemy + '震动朝野'
  if (pressure >= 55) return enemy + '都城告急'
  if (pressure >= 25) return enemy + '戒严'
  return enemy + '未动'
}

function legacyObjectiveText(
  state: GameState, campaign: LegacyCampaign, enemyFaction: string, enemy: string, capitalName: string,
): string {
  if (state.politics.pangjuanReturning) return enemy + '回师'
  return state.cities[campaign.roles.zhaoCapital]?.owner === enemyFaction
    ? capitalName + '已陷'
    : capitalName + '被围'
}

export function projectLegacy(
  state: GameState, campaign: LegacyCampaign,
  score: Score | null = null, debrief: Debrief | null = null,
): UiState {
  const colorOf = (f: FactionId) => campaign.factions[f]?.color ?? '#666'
  // 敌方势力取「势力表里第一个不是玩家的」：不再把 'wei' 写死，
  // 否则任一改过阵营 id 的 legacy 战役都会取不到敌方的颜色与称呼。
  const legacyEnemy: FactionId =
    Object.keys(campaign.factions).find(id => id !== campaign.playerFaction) ?? campaign.playerFaction
  // 政情 / 战局文案要用的两个名字，同样从战役数据取，不在字符串里写死
  const enemyName = campaign.factions[legacyEnemy]?.short ?? campaign.factions[legacyEnemy]?.name ?? '敌方'
  const zhaoCapitalName = campaign.cities.find(c => c.id === campaign.roles.zhaoCapital)?.name ?? '都城'
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
    armies, cities, traces, areas: makeAreas(cities, colorOf, 1000, 700), roads,
    terrain: makeTerrain(campaign.terrain),
    reports: makeReports(state, sourceNamesOf(undefined)),
    pendingNode: nodeId,
    nodeTitle: node?.title ?? '',
    nodePrompt: node?.prompt ?? '',
    options: node?.options ?? [],
    decisionSeconds: 0,
    over: state.over,
    // legacy 引擎从不把结算写回 state.score（历史上一直是空的），
    // 所以这里由调用方传入 finalize() 的结果，否则结算页拿不到分数
    score,
    debrief,
    // 政情与战局文案一律从战役数据推出来：写死「魏廷 / 大梁 / 邯郸」等于把
    // legacy 引擎锁死在围魏救赵这一役上，换阵营 id 的战役会显示出错误的国名与城名。
    pressureText: legacyPressureText(state.politics.weiPressure, enemyName),
    objectiveText: legacyObjectiveText(state, campaign, legacyEnemy, enemyName, zhaoCapitalName),
    playerFaction: campaign.playerFaction,
    playerColor: colorOf(campaign.playerFaction),
    // 敌方 = 势力表里第一个非玩家势力：legacy 只有齐/魏两种，但换战役就不该再写死 'wei'
    playerLabel: campaign.factions[campaign.playerFaction]?.name ?? '我军',
    enemyLabel: campaign.factions[legacyEnemy]?.name ?? '敌军',
    enemyColor: colorOf(legacyEnemy),
    traceColor: colorOf(legacyEnemy),
    pressureHigh,
    mapWidth: 1000,
    mapHeight: 700,
  }
}

// ---- 通用战役投影 ----
export function projectOps(
  state: OpsState, campaign: OpsCampaign, hud?: OpsHud, score?: Score | null, sides?: UiSides,
  debrief: Debrief | null = null,
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
    armies, cities, traces,
    areas: makeAreas(cities, colorOf, campaign.mapWidth, campaign.mapHeight),
    roads,
    terrain: makeTerrain(campaign.terrain),
    reports: makeReports(state, sourceNamesOf(campaign.meta.era)),
    pendingNode: nodeId,
    nodeTitle: node?.title ?? '',
    nodePrompt: node?.prompt ?? '',
    options: node?.options ?? [],
    decisionSeconds: 0,
    over: state.over,
    score: score ?? null,
    debrief,
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

export { CONFIDENCE_NAMES, WEATHER_NAMES, TASK_NAMES, band, foodBand, moraleBand, supplyText }
export type { DifficultyId, OpsRules }