import type { ArmyState, Campaign, CityState, GameState, Troops, Weather } from './types.js'
import { emptyLedgers } from './ledger.js'

export function total(t: Troops): number {
  return t.chariot + t.infantry + t.cavalry + t.crossbow
}

export function createInitialState(campaign: Campaign, difficulty: GameState['difficulty'], seed: number): GameState {
  const cities: Record<string, CityState> = {}
  for (const def of campaign.cities) {
    cities[def.id] = {
      ...def,
      morale: def.owner === 'zhao' ? 55 : 70,
      unrest: 0,
      known: true,
      contested: false,
      initialGarrison: def.garrison,
      initialWall: def.wall,
      besieged: false,
    }
  }
  // 开局未知：楚国、魏国西线
  for (const id of ['chen', 'anyi', 'shaoliang']) {
    if (cities[id]) cities[id].known = false
  }
  const armies: Record<string, ArmyState> = {}
  const armyOrder: string[] = []
  for (const def of campaign.armies) {
    armies[def.id] = {
      id: def.id,
      name: def.name,
      faction: def.faction,
      commander: def.commander,
      troops: { ...def.troops },
      initialTroops: total(def.troops),
      morale: def.morale,
      fatigue: def.fatigue,
      training: def.training,
      foodDays: def.foodDays,
      pos: { kind: 'city', city: def.city, progress: 0 },
      order: null,
      route: [],
      stealth: 0.2,
      supply: 'ok',
      inBattle: null,
      removed: false,
    }
    armyOrder.push(def.id)
  }
  return {
    campaignId: campaign.meta.id,
    tick: 0,
    seed,
    difficulty,
    playerFaction: campaign.playerFaction,
    cities,
    roads: campaign.roads,
    armies,
    armyOrder,
    reports: [],
    traces: [],
    battles: [],
    pendingNode: null,
    resolvedNodes: [],
    orders: [],
    tokens: 1,
    lastTokenTick: 0,
    flags: {},
    politics: {
      weiPressure: 0,
      weiOrderedReturn: false,
      pangjuanReturning: false,
      pangjuanReturnSince: 0,
      pangjuanDelays: 0,
      chuCommitTick: 0,
      qinCommitTick: 0,
      songAttitude: 0,
      weiStateAttitude: -5,
      zhaoMorale: 60,
    },
    weather: 'clear',
    weatherNext: 7,
    casualties: { qi: 0, wei: 0, zhao: 0 },
    citiesTaken: [],
    decisionWindowEnd: null,
    over: false,
    endingId: null,
    score: null,
    log: [],
    ...emptyLedgers(),
    reportSeq: 0,
    battleSeq: 0,
    narrativeSalt: 0,
  }
}

export function applyLosses(army: ArmyState, ratio: number): number {
  const before = total(army.troops)
  const keep = Math.max(0, 1 - ratio)
  army.troops = {
    chariot: Math.round(army.troops.chariot * keep),
    infantry: Math.round(army.troops.infantry * keep),
    cavalry: Math.round(army.troops.cavalry * keep),
    crossbow: Math.round(army.troops.crossbow * keep),
  }
  return before - total(army.troops)
}

export function power(army: ArmyState, weather: Weather): number {
  const t = army.troops
  const base = t.infantry * 1 + t.chariot * 1.15 + t.cavalry * 1.05 + t.crossbow * 0.95
  const morale = 0.45 + (army.morale / 100) * 0.75
  const fatigue = 1 - (army.fatigue / 100) * 0.4
  const supply = army.foodDays <= 0 ? 0.65 : army.supply === 'cut' ? 0.85 : 1
  const weatherMod = weather === 'rain' ? 0.92 : weather === 'snow' ? 0.85 : weather === 'fog' ? 0.95 : 1
  return Math.pow(base, 0.92) * morale * fatigue * supply * army.training * weatherMod
}

export function livingArmies(state: GameState, faction: string): ArmyState[] {
  return state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is ArmyState => !!a && !a.removed && a.faction === faction)
}

export function clearArmies(state: GameState, faction: string): ArmyState[] {
  return state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is ArmyState => !!a && !a.removed && a.faction === faction && total(a.troops) > 400)
}

export function nearestFriendlyCity(state: GameState, faction: string, from: string): string | null {
  let best: string | null = null
  let bestDays = Number.POSITIVE_INFINITY
  for (const city of Object.values(state.cities)) {
    if (city.owner !== faction) continue
    const path = shortestDays(state, from, city.id)
    if (path < bestDays) { bestDays = path; best = city.id }
  }
  return best
}

function adjacency(roads: Campaign['roads']): Map<string, { to: string; days: number }[]> {
  const map = new Map<string, { to: string; days: number }[]>()
  for (const road of roads) {
    if (!map.has(road.from)) map.set(road.from, [])
    if (!map.has(road.to)) map.set(road.to, [])
    map.get(road.from)!.push({ to: road.to, days: road.days })
    map.get(road.to)!.push({ to: road.from, days: road.days })
  }
  return map
}

export function shortestDays(state: GameState, from: string, to: string): number {
  if (from === to) return 0
  const adj = adjacency(state.roads)
  const dist = new Map<string, number>([[from, 0]])
  const seen = new Set<string>()
  while (true) {
    let current: string | null = null
    let best = Number.POSITIVE_INFINITY
    for (const [city, d] of dist) {
      if (!seen.has(city) && d < best) { best = d; current = city }
    }
    if (current === null) break
    if (current === to) return best
    seen.add(current)
    for (const edge of adj.get(current) ?? []) {
      const next = best + edge.days
      if (next < (dist.get(edge.to) ?? Number.POSITIVE_INFINITY)) dist.set(edge.to, next)
    }
  }
  return Number.POSITIVE_INFINITY
}
