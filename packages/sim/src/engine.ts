import type { Campaign, CreateOptions, GameState, Narrative, TickResult } from './types.js'
import { clamp } from './rng.js'
import { createInitialState } from './state.js'
import { applyArrivedOrders, dailyTokens } from './orders.js'
import { shortestPath } from './map.js'
import { battleTick, cleanupArmies, detectBattle, siegeTick } from './battle.js'
import { logisticsTick } from './logistics.js'
import { politicsTick } from './politics.js'
import { pangjuanTick } from './ai.js'
import { checkEnd, defaultOptionFor, nodeTrigger, openNode, resolveNode } from './nodes.js'
import { pushReport, reportLine } from './reports.js'
import { recordOrder } from './ledger.js'

export { resolveNode }

export function seedOpening(state: GameState, campaign: Campaign, narrative: Narrative): void {
  const salt = state.narrativeSalt++
  pushReport(state, 'deserter', campaign.cities.find(c => c.id === campaign.roles.zhaoCapital)?.name ?? '邯郸', narrative.line('opening.siege', {}, salt), 'mid', 0, true)
  pushReport(state, 'envoy', '临淄', narrative.line('opening.envoy', {}, salt + 1), 'high', 0, true)
  pushReport(state, 'note', '临淄', narrative.line('opening.gather', {}, salt + 2), 'high', 0, false)
}

export function createGame(options: CreateOptions): GameState {
  return createInitialState(options.campaign, options.difficulty, options.seed)
}

export function advanceDay(state: GameState, campaign: Campaign, narrative: Narrative): TickResult {
  const events: string[] = []
  if (state.over) return { reports: [], pendingNode: null, over: true, events }
  if (state.pendingNode) return { reports: [], pendingNode: state.pendingNode, over: false, events }
  state.tick += 1
  dailyTokens(state)
  applyArrivedOrders(state)
  if (state.pendingNode) {
    return { reports: state.reports.filter(r => r.arriveTick === state.tick), pendingNode: state.pendingNode, over: state.over, events }
  }
  moveAll(state, campaign)
  pangjuanTick(state, campaign, narrative)
  politicsTick(state, campaign, narrative)
  detectBattle(state, campaign, narrative)
  battleTick(state, campaign, narrative)
  siegeTick(state, campaign, narrative)
  logisticsTick(state, campaign, narrative)
  cleanupArmies(state)
  checkEnd(state, campaign)
  const node = state.over ? null : nodeTrigger(state, campaign)
  if (node) {
    openNode(state, node)
    const def = campaign.decisions.find(n => n.id === node)
    reportLine(state, narrative, 'court', '临淄', 'node.open', { title: def?.title ?? '军情' }, 'high', 0, true)
    events.push('决策：' + (def?.title ?? node))
  }
  if (state.over && !state.endingId) state.endingId = 'stalemate'
  return { reports: state.reports.filter(r => r.arriveTick === state.tick), pendingNode: state.pendingNode, over: state.over, events }
}

export function resolveDecision(state: GameState, campaign: Campaign, narrative: Narrative, nodeId: string, optionId: string) {
  return resolveNode(state, campaign, narrative, nodeId, optionId)
}

export function timeoutNode(state: GameState, campaign: Campaign, narrative: Narrative): string | null {
  if (!state.pendingNode) return null
  const nodeId = state.pendingNode
  const quality = campaign.difficulty[state.difficulty].defaultQuality
  const optionId = defaultOptionFor(state, campaign, nodeId, quality)
  resolveNode(state, campaign, narrative, nodeId, optionId, { timeout: true })
  return optionId
}

function moveAll(state: GameState, campaign: Campaign): void {
  for (const id of state.armyOrder) {
    const army = state.armies[id]
    if (!army || army.removed || army.inBattle || !army.order) continue
    moveArmy(state, army, campaign)
  }
}

function moveArmy(state: GameState, army: GameState['armies'][string], campaign: Campaign): void {
  const order = army.order
  if (!order) return
  if (army.pos.kind === 'road') {
    const road = state.roads.find(r => r.id === army.pos.road)
    if (!road) {
      army.pos = { kind: 'city', city: army.pos.from ?? campaign.roles.weiCapital, progress: 0 }
      return
    }
    const factor = speedOf(army)
    army.pos.progress = clamp(army.pos.progress + factor / Math.max(1, road.days), 0, 1)
    army.fatigue = clamp(army.fatigue + fatigueOf(army) / Math.max(1, road.days), 0, 100)
    if (army.pos.progress >= 1) {
      army.pos = { kind: 'city', city: army.pos.to ?? road.to, progress: 0 }
      army.fatigue = clamp(army.fatigue + 1, 0, 100)
    }
    return
  }
  const here = army.pos.city ?? ''
  if (order.task === 'feint' && order.arrived && order.waitTicks >= 5) {
    army.order = null
    return
  }
  const target = order.target
  if (!target || target === here) {
    if (!order.arrived) { order.arrived = true; order.waitTicks = 0 }
    else order.waitTicks += 1
    return
  }
  if (army.route.length === 0) {
    army.route = shortestPath(state.roads, here, target).map(step => step.city)
  }
  const next = army.route[0]
  if (!next) {
    if (!order.arrived) { order.arrived = true; order.waitTicks = 0 }
    return
  }
  const road = state.roads.find(r => (r.from === here && r.to === next) || (r.to === here && r.from === next))
  if (!road) {
    const task = army.order?.task ?? 'march'
    army.route = []
    army.order = null
    recordOrder(state, { tick: state.tick + 1, task, armyIds: [army.id], target, result: 'void', reason: '找不到道路' })
    return
  }
  // 魏军沿既定路线回师：逐城推进，不走捷径覆盖
  army.pos = { kind: 'road', road: road.id, from: here, to: next, progress: 0 }
  army.route = army.route.slice(1)
}

function speedOf(army: GameState['armies'][string]): number {
  let factor = 1
  if (army.order?.modifier.includes('forced')) factor *= 1.35
  if (army.order?.modifier.includes('stealth')) factor *= 0.8
  if (army.order?.modifier.includes('night')) factor *= 0.8
  if (army.order?.modifier.includes('dropBaggage')) factor *= 1.15
  if (army.fatigue > 70) factor *= 0.8
  return factor
}

function fatigueOf(army: GameState['armies'][string]): number {
  let gain = 2
  if (army.order?.modifier.includes('forced')) gain += 4
  if (army.order?.modifier.includes('stealth')) gain += 2
  return gain
}