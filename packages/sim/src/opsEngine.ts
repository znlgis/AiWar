import type { Narrative, Report, SourceId } from './types.js'
import type {
  OpsArmyState, OpsBattle, OpsCampaign, OpsCityState, OpsNarrative, OpsRules, OpsState, OpsTask,
} from './opsTypes.js'
import { makeRng, clamp } from './rng.js'
import { emptyLedgers, recordBattle, recordCity, recordChoice, recordOrder } from './ledger.js'

// ---------- 创建 ----------

export function createOpsState(campaign: OpsCampaign, difficulty: OpsState['difficulty'], seed: number): OpsState {
  const cities: Record<string, OpsCityState> = {}
  for (const def of campaign.cities) {
    cities[def.id] = {
      ...def,
      morale: 70,
      known: true,
      besieged: false,
      initialGarrison: def.garrison,
    }
  }
  const armies: Record<string, OpsArmyState> = {}
  const armyOrder: string[] = []
  for (const def of campaign.armies) {
    armies[def.id] = {
      id: def.id,
      name: def.name,
      faction: def.faction,
      commander: def.commander,
      troops: def.troops,
      initialTroops: def.troops,
      type: def.type,
      morale: def.morale,
      fatigue: def.fatigue,
      training: def.training,
      foodDays: def.foodDays,
      pos: { kind: 'city', city: def.city },
      order: null,
      route: [],
      supply: 'ok',
      inBattle: null,
      removed: false,
      stealth: def.stealth ?? 0.2,
      naval: def.naval ?? false,
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
    tokens: 2,
    lastTokenTick: 0,
    flags: {},
    vars: {},
    weather: campaign.weather[0]?.id ?? 'clear',
    weatherNext: 5,
    casualties: {},
    citiesTaken: [],
    over: false,
    endingId: null,
    log: [],
    ...emptyLedgers(),
    reportSeq: 0,
    battleSeq: 0,
    narrativeSalt: 0,
  }
}

// ---------- 工具 ----------

export function totalTroops(state: OpsState, ids: string[]): number {
  return ids.reduce((sum, id) => sum + (state.armies[id]?.removed ? 0 : state.armies[id]?.troops ?? 0), 0)
}

export function armiesAt(state: OpsState, cityId: string, faction?: string): OpsArmyState[] {
  return state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is OpsArmyState => !!a && !a.removed && a.pos.kind === 'city' && a.pos.city === cityId && !a.inBattle && (!faction || a.faction === faction))
}

export function armiesOf(state: OpsState, faction: string): OpsArmyState[] {
  return state.armyOrder.map(id => state.armies[id]).filter((a): a is OpsArmyState => !!a && !a.removed && a.faction === faction)
}

export function playerArmies(state: OpsState): OpsArmyState[] {
  return armiesOf(state, state.playerFaction)
}

export function addReport(
  state: OpsState, source: SourceId, place: string, text: string,
  confidence: Report['confidence'], delay = 0, important = false,
): Report {
  const report: Report = {
    id: 'r' + (++state.reportSeq),
    tick: state.tick,
    arriveTick: state.tick + delay,
    source,
    place,
    confidence,
    text,
    important,
  }
  state.reports.push(report)
  return report
}

export function say(
  state: OpsState, narrative: OpsNarrative, source: SourceId, place: string,
  kind: string, params: Record<string, string>, confidence: Report['confidence'],
  delay = 0, important = false,
): Report {
  const salt = state.narrativeSalt++
  const text = narrative.line(kind, params, salt) || fallbackText(kind, params)
  return addReport(state, source, place, text, confidence, delay, important)
}

export function fallbackText(kind: string, params: Record<string, string>): string {
  const place = params.city ?? params.place ?? params.army ?? '前线'
  if (kind.startsWith('battle')) return place + '方向传来战报：两军接战，胜负未分。'
  if (kind.startsWith('siege')) return place + '方向有攻城消息。'
  if (kind.startsWith('supply')) return '粮道有警。'
  if (kind.startsWith('intel')) return place + '方向发现敌军动向。'
  return place + '方面有新的军情。'
}

export function damageArmy(army: OpsArmyState, ratio: number, state: OpsState): number {
  const before = army.troops
  army.troops = Math.max(0, Math.round(army.troops * (1 - ratio)))
  const lost = before - army.troops
  if (lost > 0) state.casualties[army.faction] = (state.casualties[army.faction] ?? 0) + lost
  return lost
}

function terrainPower(terrain: string | undefined, type: string): number {
  if (terrain === 'mountain') return type === 'armor' ? 0.65 : type === 'cavalry' ? 0.8 : 1.02
  if (terrain === 'river') return type === 'fleet' ? 1.25 : type === 'armor' ? 0.8 : 1.03
  if (terrain === 'water') return type === 'fleet' ? 1.3 : 0.35
  return type === 'armor' ? 1.12 : type === 'cavalry' ? 1.05 : 1
}

export function armyPower(state: OpsState, army: OpsArmyState, campaign: OpsCampaign, terrain?: string): number {
  const base = Math.pow(Math.max(1, army.troops), 0.92)
  const morale = 0.45 + (army.morale / 100) * 0.75
  const fatigue = 1 - (army.fatigue / 100) * 0.35
  const supply = army.foodDays <= 0 ? 0.62 : army.supply === 'cut' ? 0.85 : 1
  const weather = state.weather === 'rain' ? 0.94 : state.weather === 'snow' ? 0.88 : state.weather === 'fog' ? 0.96 : 1
  void campaign
  return base * morale * fatigue * supply * army.training * terrainPower(terrain, army.type) * weather
}

// ---------- 命令 ----------

export interface OpsOrderDraft {
  task: OpsTask
  armyIds: string[]
  target?: string
}

export const OPS_TASK_LABELS: Record<OpsTask, string> = {
  march: '行军', hold: '驻守', feint: '佯动', assault: '强攻', ambush: '设伏',
  pursue: '追击', retreat: '撤退', rest: '休整', forage: '筹粮', scout: '侦察',
  cross: '渡河', defect: '策动起义', strike: '突击',
}

export function canIssueOpsOrder(state: OpsState, draft: OpsOrderDraft): string | null {
  if (state.over) return '战役已结束'
  if (state.pendingNode) return '军情紧急，先应对当前决策'
  if (draft.armyIds.length === 0) return '未选择部队'
  if (draft.task !== 'hold' && state.tokens <= 0) return '没有可用的军令牌'
  for (const id of draft.armyIds) {
    const army = state.armies[id]
    if (!army || army.removed) return '部队已不存在'
    if (army.inBattle) return army.name + '正在交战'
    if (army.faction !== state.playerFaction) return '只能指挥本方部队'
  }
  return null
}

export function issueOpsOrder(state: OpsState, draft: OpsOrderDraft): void {
  if (canIssueOpsOrder(state, draft)) return
  state.orders.push({
    id: 'o' + (state.tick * 100 + state.orders.length),
    task: draft.task,
    armyIds: [...draft.armyIds],
    target: draft.target,
    issuedTick: state.tick,
    arriveTick: state.tick + (draft.task === 'defect' ? 2 : 1),
  })
  if (draft.task !== 'hold') state.tokens = clamp(state.tokens - 1, 0, 3)
  recordOrder(state, { tick: state.tick + 1, task: draft.task, armyIds: [...draft.armyIds], target: draft.target, result: 'ok' })
}

export function applyOpsOrders(state: OpsState): void {
  const arrived = state.orders.filter(o => o.arriveTick <= state.tick)
  state.orders = state.orders.filter(o => o.arriveTick > state.tick)
  for (const order of arrived) {
    for (const id of order.armyIds) {
      const army = state.armies[id]
      if (!army || army.removed || army.inBattle) continue
      army.order = { task: order.task, target: order.target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
      army.route = []
      army.stealth = order.task === 'feint' ? 0.55 : order.task === 'ambush' ? 0.7 : 0.2
    }
  }
}

// ---------- 移动 ----------

function speedOf(army: OpsArmyState, weather: string): number {
  let f = 1
  if (army.order?.task === 'retreat') f *= 1.15
  if (army.order?.task === 'pursue') f *= 1.12
  if (army.order?.task === 'feint') f *= 0.9
  if (army.order?.task === 'ambush') f *= 1
  if (army.fatigue > 70) f *= 0.8
  if (weather === 'rain') f *= 0.85
  if (weather === 'snow') f *= 0.7
  if (weather === 'fog') f *= 0.9
  return f
}

export function shortestRoute(roads: OpsCampaign['roads'], from: string, to: string): string[] {
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  const visited = new Set<string>()
  while (true) {
    let current: string | null = null
    let best = Number.POSITIVE_INFINITY
    for (const [city, d] of dist) if (!visited.has(city) && d < best) { best = d; current = city }
    if (current === null || current === to) break
    visited.add(current)
    for (const road of roads) {
      const next = road.from === current ? road.to : road.to === current ? road.from : null
      if (!next) continue
      const cost = best + road.days
      if (cost < (dist.get(next) ?? Number.POSITIVE_INFINITY)) {
        dist.set(next, cost)
        prev.set(next, current)
      }
    }
  }
  if (!dist.has(to)) return []
  const route: string[] = []
  let cursor = to
  while (cursor !== from) {
    const before = prev.get(cursor)
    if (!before) return []
    route.unshift(cursor)
    cursor = before
  }
  return route
}

function roadBetween(roads: OpsCampaign['roads'], a: string, b: string) {
  return roads.find(r => (r.from === a && r.to === b) || (r.to === a && r.from === b))
}

export function moveArmies(state: OpsState, campaign: OpsCampaign): void {
  for (const id of state.armyOrder) {
    const army = state.armies[id]
    if (!army || army.removed || army.inBattle || !army.order) continue
    const pos = army.pos
    if (pos.kind === 'road') {
      const road = state.roads.find(r => r.id === pos.road)
      if (!road) { army.pos = { kind: 'city', city: pos.from }; army.order = null; continue }
      const factor = speedOf(army, state.weather)
      const progress = clamp(pos.progress + factor / Math.max(1, road.days), 0, 1)
      army.fatigue = clamp(army.fatigue + 4 / Math.max(1, road.days), 0, 100)
      army.pos = progress >= 1
        ? { kind: 'city', city: pos.to }
        : { kind: 'road', road: pos.road, from: pos.from, to: pos.to, progress }
      continue
    }
    const here = pos.city
    const target = army.order.target
    if (!target || target === here) {
      if (!army.order.arrived) { army.order.arrived = true; army.order.waitTicks = 0 }
      else army.order.waitTicks += 1
      continue
    }
    if (army.route.length === 0) army.route = shortestRoute(state.roads, here, target)
    const next = army.route[0]
    if (!next) { army.order.arrived = true; continue }
    const road = roadBetween(state.roads, here, next)
    if (!road) {
      const task = army.order?.task ?? 'march'
      army.route = []
      army.order = null
      addReport(state, 'court', state.cities[here]?.name ?? '军前', army.name + '找不到通往目标的道路，军令已废。', 'high', 1, true)
      recordOrder(state, { tick: state.tick + 1, task, armyIds: [army.id], target, result: 'void', reason: '找不到道路' })
      continue
    }
    if (road.kind === 'water' && !army.naval) {
      const task = army.order?.task ?? 'march'
      army.order = null
      army.route = []
      addReport(state, 'court', state.cities[here]?.name ?? '军前', army.name + '无舟楫，不能渡水，军令已废。', 'high', 1, true)
      recordOrder(state, { tick: state.tick + 1, task, armyIds: [army.id], target, result: 'void', reason: '无舟楫' })
      continue
    }
    army.pos = { kind: 'road', road: road.id, from: here, to: next, progress: 0 }
    army.route = army.route.slice(1)
    army.fatigue = clamp(army.fatigue + 2, 0, 100)
    if (road.kind === 'river') state.vars.riverCrossings = (state.vars.riverCrossings ?? 0) + 1
  }
}

// ---------- 情报 ----------

export function intelTick(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative): void {
  const rng = makeRng(state.seed, state.tick)
  state.traces = state.traces.filter(t => state.tick - t.seenTick <= 8)
  const enemies = state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is OpsArmyState => !!a && !a.removed && a.faction !== state.playerFaction && !a.inBattle)
  for (const enemy of enemies) {
    const enemyPos = enemy.pos
    const place = enemyPos.kind === 'city'
      ? state.cities[enemyPos.city]?.name ?? ''
      : (state.roads.find(r => r.id === enemyPos.road)?.name ?? '路上')
    const near = playerArmies(state).some(a => {
      if (a.pos.kind !== 'city' || enemy.pos.kind !== 'city') return false
      if (a.pos.city === enemy.pos.city) return true
      return shortestRoute(state.roads, a.pos.city, enemy.pos.city).length <= 1
    })
    const diff = campaign.difficulty[state.difficulty]
    const scouting = (state.vars.scouting ?? 0) > 0
    const chance = clamp((near ? 0.82 : 0.36) * (diff.scoutEfficiency ?? 1) * (scouting ? 1.25 : 1), 0.05, 0.97)
    if (rng('intel') < chance) {
      const noise = 1 + (rng('band', 7) * 2 - 1) * (diff.strengthError ?? 0.3) * 0.6
      const shown = Math.max(200, enemy.troops * noise)
      // 档位分细：原来只有四档，七路敌军全读成「万余」，玩家无法判断该打哪一路
      const band = shown > 300000 ? '三十万以上' : shown > 150000 ? '十五至三十万' : shown > 80000 ? '八至十五万'
        : shown > 30000 ? '三至八万' : shown > 10000 ? '一万至三万' : '不满一万'
      state.traces.push({
        armyId: enemy.id, faction: enemy.faction as never, place,
        city: enemyPos.kind === 'city' ? enemyPos.city : undefined,
        road: enemyPos.kind === 'road' ? enemyPos.road : undefined,
        seenTick: state.tick, band: band, confidence: near ? 'high' : 'mid',
      })
      if (state.tick % 2 === 0) {
        say(state, narrative, 'scout', place, 'intel.sighting', { place, band }, near ? 'high' : 'mid', diff.intelDelay ?? 1)
      }
    }
    // 假情报：难度越高，越可能收到一队根本不在那里的敌军
    if ((diff.falseReportPerTenDays ?? 0) > 0 && rng('falsereport') < (diff.falseReportPerTenDays ?? 0) / 10) {
      const pool = Object.values(state.cities).filter(c => c.owner !== state.playerFaction)
      const spot = pool[Math.floor(rng('falsespot') * pool.length)]
      if (spot) {
        state.traces.push({
          armyId: 'false-' + state.tick, faction: 'unknown' as never, place: spot.name,
          city: spot.id, road: undefined, seenTick: state.tick, band: '数万', confidence: 'low',
        })
        say(state, narrative, 'merchant', spot.name, 'intel.sighting', { place: spot.name, band: '数万' }, 'low', (diff.intelDelay ?? 1) + 1)
      }
    }
  }
}

// ---------- 战斗 ----------

export function detectBattles(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative): void {
  for (const city of Object.values(state.cities)) {
    if ((state.vars['cool:' + city.id] ?? 0) > state.tick) continue
    const present = armiesAt(state, city.id)
    if (present.length === 0) continue
    const playerSide = present.filter(a => a.faction === state.playerFaction)
    const enemySide = present.filter(a => a.faction !== state.playerFaction)
    if (playerSide.length === 0 || enemySide.length === 0) continue
    if (state.battles.some(b => b.city === city.id)) continue
    const playerDefends = city.owner === state.playerFaction
    const attacker = playerDefends ? enemySide : playerSide
    const defender = playerDefends ? playerSide : enemySide
    const ambush = attacker.some(a => a.order?.task === 'ambush' && a.order.arrived)
    const battle: OpsBattle = {
      id: 'b' + (++state.battleSeq),
      place: city.name,
      city: city.id,
      attackerIds: attacker.map(a => a.id),
      defenderIds: defender.map(a => a.id),
      days: 0,
      ambush,
      attackerInitial: totalTroops(state, attacker.map(a => a.id)),
      defenderInitial: totalTroops(state, defender.map(a => a.id)),
      firstTick: state.tick + 1,
      log: [],
    }
    for (const id of battle.attackerIds.concat(battle.defenderIds)) {
      const army = state.armies[id]
      if (army) {
        army.inBattle = battle.id
        if (army.order) {
          state.orderMemory = state.orderMemory ?? {}
          state.orderMemory[id] = { ...army.order }
        }
      }
    }
    state.vars['cool:' + city.id] = state.tick + 2
    state.battles.push(battle)
    say(state, narrative, 'border', city.name, battle.ambush ? 'battle.ambush_start' : 'battle.start', { place: city.name }, 'high', 0, true)
    state.log.push('第' + (state.tick + 1) + '日：' + city.name + '接战')
  }
}

export function battleTick(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative, rules: OpsRules): void {
  const rng = makeRng(state.seed, state.tick)
  for (const battle of [...state.battles]) {
    const attacker = battle.attackerIds.map(id => state.armies[id]).filter((a): a is OpsArmyState => !!a && !a.removed)
    const defender = battle.defenderIds.map(id => state.armies[id]).filter((a): a is OpsArmyState => !!a && !a.removed)
    if (attacker.length === 0 || defender.length === 0) {
      resolveBattle(state, campaign, narrative, rules, battle, attacker.length === 0 ? 'defender' : 'attacker')
      continue
    }
    const city = battle.city ? state.cities[battle.city] : undefined
    const playerAttacking = attacker.some(a => a.faction === state.playerFaction)
    const terrain = city?.terrain
    const atkPower = sidePower(state, campaign, battle.attackerIds, terrain, rules, 'attacker')
    const defPower = sidePower(state, campaign, battle.defenderIds, terrain, rules, 'defender')
    let atk = atkPower
    let def = defPower
    if (battle.ambush && battle.days < 2) {
      const decay = battle.days === 0 ? 1 : 0.7
      atk *= 1 + (campaign.balance.ambushMultiplier - 1) * decay
      def *= 1 - 0.2 * decay
    }
    const shareA = atk / (atk + def)
    const shareD = def / (atk + def)
    const intensity = 0.04 * campaign.balance.battleIntensity
    const atkCap = campaign.balance.attackerLossCap ?? 0.12
    const defCap = campaign.balance.defenderLossCap ?? 0.12
    const atkLoss = clamp(intensity * shareD * 2 * (0.85 + rng('atk') * 0.3), 0.003, atkCap)
    const defLoss = clamp(intensity * shareA * 2 * (0.85 + rng('def') * 0.3), 0.003, defCap)
    let atkLost = 0
    let defLost = 0
    for (const a of attacker) {
      atkLost += damageArmy(a, atkLoss, state)
      a.morale = clamp(a.morale - 2.2, 5, 100)
    }
    for (const d of defender) {
      defLost += damageArmy(d, defLoss, state)
      d.morale = clamp(d.morale - 2, 5, 100)
    }
    battle.days += 1
    // 只累加计数，不参与任何判定：回归测试的评级/分数不应因此变化
    battle.attackerLost = (battle.attackerLost ?? 0) + atkLost
    battle.defenderLost = (battle.defenderLost ?? 0) + defLost
    battle.log.push('第' + battle.days + '日 攻方折损' + Math.round(atkLost) + '，守方折损' + Math.round(defLost))
    const atkNow = totalTroops(state, battle.attackerIds)
    const defNow = totalTroops(state, battle.defenderIds)
    const atkBroken = atkNow < battle.attackerInitial * campaign.balance.routTroopRatio || attacker.every(a => a.morale < campaign.balance.routMorale)
    const defBroken = defNow < battle.defenderInitial * campaign.balance.routTroopRatio || defender.every(a => a.morale < campaign.balance.routMorale)
    if (battle.days >= 6 || atkBroken || defBroken) {
      const winner = atkBroken && !defBroken ? 'defender' : defBroken && !atkBroken ? 'attacker' : 'draw'
      resolveBattle(state, campaign, narrative, rules, battle, winner)
      continue
    }
    // 兵力比决胜：原实现只按「累计损失占初始兵力比」与士气阈值判溃败，两方损失率几乎同量级，
    // 于是每场仗都撑到 6 天上限判平——围城打不下来、围歼永远差一口气。这里按当下实力比补一条终局判定。
    const ratio = atkNow / Math.max(1, defNow)
    if (battle.days >= 2 && ratio >= 2.6) resolveBattle(state, campaign, narrative, rules, battle, 'attacker')
    else if (battle.days >= 2 && ratio <= 0.38) resolveBattle(state, campaign, narrative, rules, battle, 'defender')
    void playerAttacking
  }
}

function sidePower(state: OpsState, campaign: OpsCampaign, ids: string[], terrain: string | undefined, rules: OpsRules, side: 'attacker' | 'defender'): number {
  let sum = 0
  for (const id of ids) {
    const army = state.armies[id]
    if (!army || army.removed) continue
    const mod = rules.powerMod?.(state, campaign, id, side) ?? 1
    sum += armyPower(state, army, campaign, terrain) * mod
  }
  return Math.max(1, sum)
}

function resolveBattle(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative, rules: OpsRules, battle: OpsBattle, winner: 'attacker' | 'defender' | 'draw'): void {
  const city = battle.city ? state.cities[battle.city] : undefined
  const place = city?.name ?? battle.place
  const losers = winner === 'attacker' ? battle.defenderIds : winner === 'defender' ? battle.attackerIds : []
  for (const id of losers) {
    const army = state.armies[id]
    if (!army) continue
    damageArmy(army, 0.16, state)
    const pos = army.pos
    const fromCity = pos.kind === 'city' ? pos.city : pos.from
    // 合围歼灭：守方在本方城池战败，且毗邻城池多数已被敌方控制时，视为被围歼
    const neighbors = pos.kind === 'city'
      ? Object.values(state.cities).filter(c => c.id !== pos.city && shortestRoute(state.roads, pos.city, c.id).length <= 1)
      : []
    const hostileNeighbors = neighbors.filter(c => c.owner !== army.faction && c.owner !== 'neutral').length
    const encircled = army.pos.kind === 'city' && city && city.owner === army.faction && neighbors.length > 0 && hostileNeighbors >= Math.ceil(neighbors.length * 0.6)
    if (encircled || army.troops < 1500) {
      const lost = army.troops
      state.casualties[army.faction] = (state.casualties[army.faction] ?? 0) + lost
      army.removed = true
      army.troops = 0
      army.inBattle = null
      say(state, narrative, 'border', place, 'battle.annihilated', { place }, 'high', 0, true)
      continue
    }
    // 后撤改为「下达撤退令、按路线逐日行之」，不再瞬移：
    // 原实现把溃军一天搬到五六跳外（掠过敌城），玩家看到的就是部队瞬移。
    const origin = fromCity ?? city?.id ?? ''
    const haven = origin ? nearestFriendlyCity(state, army.faction, origin) : null
    army.pos = { kind: 'city', city: origin || (army.pos.kind === 'city' ? army.pos.city : '') }
    army.route = []
    army.inBattle = null
    army.morale = clamp(army.morale - 15, 5, 100)
    army.order = haven && haven !== origin
      ? { task: 'retreat', target: haven, sinceTick: state.tick, arrived: false, waitTicks: 0 }
      : null
  }
  for (const id of battle.attackerIds.concat(battle.defenderIds)) {
    const army = state.armies[id]
    if (!army || army.removed) continue
    army.inBattle = null
    // 玩家部队战后恢复原行军命令（避免被反复开战锁死在原地）
    // 败方已经有撤退令，不要被「恢复原命令 / 清空命令」覆盖
    if (army.order?.task === 'retreat') { if (state.orderMemory) delete state.orderMemory[id]; continue }
    if (army.faction === state.playerFaction) {
      // 只在该部队战后没有新命令时才恢复旧命令：
      // 原实现无条件覆盖，会把交战期间玩家刚下的新令（例如「突袭洛涧」）冲掉。
      const saved = state.orderMemory?.[id]
      if (saved && !army.order) army.order = { ...saved }
    } else {
      army.order = null
    }
    if (state.orderMemory) delete state.orderMemory[id]
  }
  if (battle.city) {
    state.vars['cool:' + battle.city] = winner === 'draw' ? state.tick + 5 : state.tick + 3
    // 守军野战失利后城墙防务随之崩解：否则城内守备数与野战军毫无关联，胜了也拿不下城
    const cityHere = state.cities[battle.city]
    const loserFaction = winner === 'attacker'
      ? state.armies[battle.defenderIds[0] ?? '']?.faction
      : winner === 'defender' ? state.armies[battle.attackerIds[0] ?? '']?.faction : undefined
    if (cityHere && loserFaction && cityHere.owner === loserFaction) {
      cityHere.garrison = Math.round(cityHere.garrison * 0.55)
      cityHere.morale = clamp(cityHere.morale - 12, 5, 100)
    }
  }
  // 战报账本：先把这场仗记下来，再从活动战斗列表里移除（原实现直接删，战后无从复盘）
  const playerSide: 'attacker' | 'defender' | 'none' = battle.attackerIds.some(id => state.armies[id]?.faction === state.playerFaction)
    ? 'attacker'
    : battle.defenderIds.some(id => state.armies[id]?.faction === state.playerFaction) ? 'defender' : 'none'
  recordBattle(state, {
    id: battle.id,
    place,
    city: battle.city,
    tick: battle.firstTick ?? state.tick + 1,
    days: Math.max(1, battle.days),
    attackerLost: Math.round(battle.attackerLost ?? 0),
    defenderLost: Math.round(battle.defenderLost ?? 0),
    attackerInitial: Math.round(battle.attackerInitial),
    defenderInitial: Math.round(battle.defenderInitial),
    winner,
    ambush: battle.ambush,
    playerSide,
  })
  state.battles = state.battles.filter(b => b.id !== battle.id)
  const winnerName = winner === 'draw' ? '' : (winner === 'attacker' ? battle.attackerIds[0] : battle.defenderIds[0])
  const winnerFaction = winnerName ? state.armies[winnerName]?.faction : undefined
  const winnerText = winnerFaction === state.playerFaction ? '我军' : '敌军'
  if (winner === 'draw') {
    say(state, narrative, 'border', place, 'battle.draw', { place }, 'mid', 0, true)
    state.log.push('第' + (state.tick + 1) + '日：' + place + '会战未分胜负')
  } else {
    say(state, narrative, 'border', place, battle.ambush ? 'battle.ambush_win' : 'battle.rout', { place, winner: winnerText, loser: winnerText === '我军' ? '敌军' : '我军' }, 'high', 0, true)
    state.log.push('第' + (state.tick + 1) + '日：' + place + '之战，' + winnerText + '胜')
    for (const id of winner === 'attacker' ? battle.attackerIds : battle.defenderIds) {
      const army = state.armies[id]
      if (army) army.morale = clamp(army.morale + 6, 5, 100)
    }
  }
  rules.onBattleResolved?.(state, campaign, battle, winner, narrative)
}

function nearestFriendlyCity(state: OpsState, faction: string, from: string): string | null {
  let best: string | null = null
  let bestLen = Number.POSITIVE_INFINITY
  for (const city of Object.values(state.cities)) {
    if (city.owner !== faction) continue
    const len = shortestRoute(state.roads, from, city.id).length
    if (len < bestLen) { bestLen = len; best = city.id }
  }
  return best
}

// ---------- 围城 ----------

export function siegeTick(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative, rules: OpsRules): void {
  for (const city of Object.values(state.cities)) {
    const present = armiesAt(state, city.id)
    const hostile = present.filter(a => a.faction !== city.owner)
    if (hostile.length === 0) {
      if (city.besieged) city.besieged = false
      continue
    }
    // 无守备的城池：进入即接管（弃城 / 守军已撤）
    if (city.garrison < 300) {
      const holder = hostile[0]!.faction
      const previous = city.owner
      city.owner = holder
      // 华容道这类「道路节点」不是城邑，不该进战报的城邑账本
      if (city.kind !== 'road') {
        recordCity(state, { city: city.id, name: city.name, tick: state.tick + 1, from: previous, to: holder, cause: 'empty' })
      }
      city.garrison = 0
      city.besieged = false
      say(state, narrative, 'border', city.name, 'siege.fall', { city: city.name, side: holder === state.playerFaction ? '我军' : '敌方' }, 'high', 1, true)
      state.log.push('第' + (state.tick + 1) + '日：' + city.name + '易手')
      if (holder === state.playerFaction) state.citiesTaken.push(city.id)
      rules.onCityCaptured?.(state, campaign, city, holder, narrative)
      continue
    }
    const assaulting = hostile.filter(a => a.order?.task === 'assault' || a.order?.task === 'strike')
    if (assaulting.length === 0) continue
    const attackerTroops = assaulting.reduce((sum, a) => sum + a.troops, 0)
    const defenderPower = Math.max(500, city.garrison * city.wall)
    const ratio = clamp(attackerTroops / defenderPower, 0.25, 3.2)
    if (!city.besieged) {
      city.besieged = true
      say(state, narrative, 'deserter', city.name, 'siege.start', { city: city.name }, 'mid', 1, true)
    }
    const loss = city.initialGarrison * campaign.balance.siegeGarrisonLoss * ratio * 2.2
    city.garrison = Math.max(0, city.garrison - loss)
    city.grain = Math.max(0, city.grain - campaign.balance.siegeGrainLoss)
    for (const army of assaulting) {
      damageArmy(army, clamp(0.003 / ratio, 0.001, 0.014), state)
      army.fatigue = clamp(army.fatigue + 2, 0, 100)
    }
    if (city.garrison <= city.initialGarrison * 0.18 || city.grain <= 0) {
      const owner = hostile[0].faction
      const previous = city.owner
      city.owner = owner
      if (city.kind !== 'road') {
        recordCity(state, { city: city.id, name: city.name, tick: state.tick + 1, from: previous, to: owner, cause: assaulting.length > 0 ? 'siege' : 'empty' })
      }
      city.garrison = Math.round(city.initialGarrison * 0.2)
      city.grain = Math.max(5, city.grain)
      city.besieged = false
      say(state, narrative, 'border', city.name, 'siege.fall', { city: city.name, side: owner === state.playerFaction ? '我军' : '敌方' }, 'high', 1, true)
      state.log.push('第' + (state.tick + 1) + '日：' + city.name + '易手')
      if (owner === state.playerFaction) state.citiesTaken.push(city.id)
      rules.onCityCaptured?.(state, campaign, city, owner, narrative)
    }
  }
}

// ---------- 后勤与士气 ----------

export function logisticsTick(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative): void {
  for (const army of Object.values(state.armies)) {
    if (army.removed || army.inBattle) continue
    const from = army.pos.kind === 'city' ? army.pos.city : army.pos.from
    let supply: OpsArmyState['supply'] = 'ok'
    if (army.pos.kind === 'city' && state.cities[army.pos.city]?.owner === army.faction) {
      supply = 'ok'
    } else {
      supply = supplyStateFor(state, army.faction, from)
    }
    army.supply = supply
    const supplyFactor = campaign.difficulty[state.difficulty]?.supplyFactor ?? 1
    const delta = (supply === 'cut' ? -2.2 : supply === 'threatened' ? -1 : 0) * supplyFactor
    const city = army.pos.kind === 'city' ? state.cities[army.pos.city] : undefined
    if (supply === 'ok' && city && city.owner === army.faction) {
      army.foodDays = clamp(army.foodDays + campaign.balance.resupplyDays - 1, 0, campaign.balance.maxFoodDays)
      city.grain = Math.max(0, city.grain - 0.3)
      army.fatigue = clamp(army.fatigue - 3, 0, 100)
      army.morale = clamp(army.morale + 0.4, 5, 100)
    } else if (city && city.grain > 0 && city.garrison < 600) {
      // 就地筹粮：已控制（守军被消灭/撤离）的城镇可供数日之粮，但消耗当地存粮
      const gain = Math.min(3, campaign.balance.resupplyDays)
      army.foodDays = clamp(army.foodDays + gain - 1, 0, campaign.balance.maxFoodDays)
      city.grain = Math.max(0, city.grain - 0.6)
      army.fatigue = clamp(army.fatigue - 2, 0, 100)
      army.morale = clamp(army.morale + 0.2, 5, 100)
    } else {
      army.foodDays = clamp(army.foodDays + delta - campaign.balance.supplyFactor, 0, campaign.balance.maxFoodDays)
      army.fatigue = clamp(army.fatigue - 1, 0, 100)
    }
    if (army.foodDays <= 0) {
      damageArmy(army, campaign.balance.desertionPerDay, state)
      army.morale = clamp(army.morale - 1.5, 5, 100)
      if (army.faction === state.playerFaction && state.tick % 4 === 0) {
        say(state, narrative, 'court', city?.name ?? '前线', 'supply.empty', { army: army.name }, 'high', 1, true)
      }
    } else if (army.foodDays < 4 && army.faction === state.playerFaction && state.tick % 5 === 0) {
      say(state, narrative, 'court', city?.name ?? '前线', 'supply.low', { army: army.name }, 'mid', 1)
    }
    if (army.order?.task === 'rest') {
      army.fatigue = clamp(army.fatigue - 8, 0, 100)
      army.morale = clamp(army.morale + 1.2, 5, 100)
    }
    if (army.order?.task === 'scout') {
      // 侦察：揭开周边城邑，并提高当日到下日军情的命中率
      state.vars.scouting = 1
      if (army.faction === state.playerFaction && army.pos.kind === 'city') {
        for (const road of state.roads) {
          const other = road.from === army.pos.city ? road.to : road.to === army.pos.city ? road.from : null
          if (!other) continue
          const target = state.cities[other]
          if (target && !target.known) {
            target.known = true
            say(state, narrative, 'scout', target.name, 'intel.sighting', { place: target.name, band: '不详' }, 'mid', 0)
          }
        }
      }
    }
    if (army.order?.task === 'forage') {
      // 筹粮：立足于城镇就地征粮，耗当地存粮换军粮
      if (city && city.grain > 0 && city.owner === army.faction) {
        const gain = Math.min(5, city.grain * 0.4, campaign.balance.maxFoodDays - army.foodDays)
        if (gain > 0.5) {
          army.foodDays = clamp(army.foodDays + gain, 0, campaign.balance.maxFoodDays)
          city.grain = Math.max(0, city.grain - gain * 1.6)
          army.morale = clamp(army.morale - 0.3, 5, 100)
          if (army.faction === state.playerFaction && state.tick % 3 === 0) {
            say(state, narrative, 'court', city.name, 'supply.low', { army: army.name }, 'mid', 1)
          }
        }
      } else if (army.faction === state.playerFaction && state.tick % 4 === 0) {
        say(state, narrative, 'court', city?.name ?? '前线', 'order.blocked',
          { army: army.name, reason: '城外无粮可征，须先占城' }, 'mid', 1)
      }
    }
    if (army.order?.task === 'cross') {
      // 渡河：涉渡期间速度减慢，但可跨过 river 类道路
      army.fatigue = clamp(army.fatigue + 1.5, 0, 100)
    }
  }
}

/**
 * 补给线判定：沿通往最近友城的路线检查途经城邑归属。
 * 旧实现只要图上「走得到」友城就算受威胁，连通图上恒真，于是断粮分支永远不会触发。
 */
function supplyStateFor(state: OpsState, faction: string, from: string): OpsArmyState['supply'] {
  let best: string | null = null
  let bestLen = Number.POSITIVE_INFINITY
  for (const city of Object.values(state.cities)) {
    if (city.owner !== faction) continue
    const route = shortestRoute(state.roads, from, city.id)
    if (route.length === 0 && from !== city.id) continue
    if (route.length < bestLen) { bestLen = route.length; best = city.id }
  }
  if (!best) return 'cut'
  const route = shortestRoute(state.roads, from, best)
  const hostileAt = (id: string): boolean => {
    const city = state.cities[id]
    return !!city && city.owner !== faction && city.owner !== 'neutral'
  }
  for (const id of route) if (hostileAt(id)) return 'cut'
  for (const id of [from, best, ...route]) {
    for (const road of state.roads) {
      const other = road.from === id ? road.to : road.to === id ? road.from : null
      if (other && hostileAt(other)) return 'threatened'
    }
  }
  return 'ok'
}

// ---------- 主循环 ----------

export function advanceOpsDay(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative, rules: OpsRules): { pendingNode: string | null; over: boolean } {
  if (state.over) return { pendingNode: null, over: true }
  if (state.pendingNode) return { pendingNode: state.pendingNode, over: false }
  state.tick += 1
  // 侦察的收益只在“发出侦察的次日”生效一天，不能永久挂着一个加成
  state.vars.scouting = 0
  if (state.tick - state.lastTokenTick >= 8) {
    state.lastTokenTick = state.tick
    state.tokens = clamp(state.tokens + 1, 0, 3)
  }
  applyOpsOrders(state)
  moveArmies(state, campaign)
  rules.aiTick(state, campaign, narrative)
  moveArmies(state, campaign)
  intelTick(state, campaign, narrative)
  detectBattles(state, campaign, narrative)
  battleTick(state, campaign, narrative, rules)
  siegeTick(state, campaign, narrative, rules)
  logisticsTick(state, campaign, narrative)
  rules.onTick?.(state, campaign, narrative)
  if (state.tick >= state.weatherNext) {
    const w = campaign.weather[Math.floor(makeRng(state.seed, state.tick)('weather') * campaign.weather.length)]
    state.weather = w?.id ?? 'clear'
    state.weatherNext = state.tick + 5 + Math.floor(makeRng(state.seed, state.tick)('weatherlen') * 5)
  }
  rules.checkEnd(state, campaign)
  const node = state.over ? null : rules.triggerNode(state, campaign)
  if (node) {
    state.pendingNode = node
  }
  return { pendingNode: state.pendingNode, over: state.over }
}

export function resolveOpsNode(
  state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative, rules: OpsRules,
  nodeId: string, optionId: string, opts: { timeout?: boolean } = {},
): boolean {
  const node = campaign.decisions.find(d => d.id === nodeId)
  if (!node || state.resolvedNodes.includes(nodeId)) return false
  state.resolvedNodes.push(nodeId)
  state.pendingNode = null
  const salt = state.narrativeSalt++
  rules.applyDecision(state, campaign, narrative, nodeId, optionId)
  const choice = node.options.find(o => o.id === optionId)
  // 决策账本：战时只顾着记一句 log，战后没法复盘「这个选择在几天后反噬」
  recordChoice(state, {
    nodeId,
    optionId,
    tick: state.tick + 1,
    title: node.title,
    label: choice?.label ?? optionId,
    recommended: choice?.recommended === true,
    timeout: opts.timeout === true,
  })
  addReport(state, 'note', '军前', narrative.line('decision.' + optionId, { node: node.title, choice: choice?.label ?? '' }, salt) || ('既定：' + (choice?.label ?? '依令而行')), 'high', 0, true)
  state.log.push('第' + (state.tick + 1) + '日：' + node.title + ' — ' + (choice?.label ?? optionId))
  return true
}

export function timeoutOpsNode(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative, rules: OpsRules): void {
  if (!state.pendingNode) return
  const node = campaign.decisions.find(d => d.id === state.pendingNode)
  if (!node) return
  const quality = campaign.difficulty[state.difficulty].defaultQuality
  const idx = quality >= 0.75 ? -1 : Math.min(node.options.length - 1, Math.floor((1 - quality) * node.options.length))
  const optionId = idx < 0 ? node.defaultOption : (node.options[idx]?.id ?? node.defaultOption)
  // 逾期不能白拿：仍然按难度执行默认方案，但付一次代价（少一枚军令牌 + 士气折损 + 一条回执）。
  // 原来的实现等于「史实难度挂机即最优」，与「逾时惩罚」的文案相反。
  state.tokens = clamp(state.tokens - 1, 0, 3)
  for (const army of armiesOf(state, state.playerFaction)) army.morale = clamp(army.morale - 3, 5, 100)
  addReport(state, 'court', '军前', '军议未决，逾时依令而行：' + (node.options.find(o => o.id === optionId)?.label ?? optionId) + '。此议耗去一枚军令牌。', 'high', 0, true)
  resolveOpsNode(state, campaign, narrative, rules, node.id, optionId, { timeout: true })
}

export type { OpsTask }