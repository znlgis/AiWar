import type { Campaign, GameState, Narrative } from './types.js'
import { pushReport } from './reports.js'
import { recordChoice } from './ledger.js'
import { clamp } from './rng.js'
import { shortestDays, total } from './state.js'

export interface NodeDecisionResult { ok: boolean; reason?: string }

function army(state: GameState, id: string) { return state.armies[id] }

function orderArmy(state: GameState, armyId: string, task: 'march' | 'ambush' | 'assault' | 'feint' | 'hold', target: string, modifier: 'stealth' | 'forced' | null = null): void {
  const a = army(state, armyId)
  if (!a || a.removed) return
  a.order = { task, target, modifier: modifier ? [modifier] : [], sinceTick: state.tick, arrived: false, waitTicks: 0 }
  a.route = []
  a.stealth = modifier === 'stealth' ? 0.75 : 0.2
}

function holdOthers(state: GameState, keep: string[]): void {
  for (const id of state.armyOrder) {
    const a = state.armies[id]
    if (!a || a.removed || a.faction !== 'qi' || keep.includes(id)) continue
    a.order = { task: 'hold', target: a.pos.city, modifier: [], sinceTick: state.tick, arrived: true, waitTicks: 0 }
    a.route = []
  }
}

export function nodeTrigger(state: GameState, campaign: Campaign): string | null {
  if (state.pendingNode) return state.pendingNode
  const day = state.tick
  const done = new Set(state.resolvedNodes)
  const has = (id: string) => done.has(id)
  const qiArmies = state.armyOrder.map(id => state.armies[id]).filter(a => !!a && !a.removed && a.faction === 'qi')
  const at = (cityId: string) => qiArmies.some(a => a.pos.city === cityId)
  const near = (cityId: string, days: number) => qiArmies.some(a => a.pos.city && shortestDays(state, a.pos.city, cityId) <= days)
  const handan = state.cities[campaign.roles.zhaoCapital]
  const pressure = state.politics.weiPressure

  if (!has('n1') && day >= 3) return 'n1'
  if (!has('n2') && state.flags.n1 === 1 && day >= 8) return 'n2'
  if (!has('n3') && has('n2') && (at('pingling') || at('xiangling') || near('pingling', 1) || day >= 18)) return 'n3'
  if (!has('n4') && has('n3') && handan && (handan.garrison / handan.initialGarrison < 0.9 || day >= 16)) return 'n4'
  const strongNear = qiArmies.some(a => {
    if (!a.pos.city) return false
    if (total(a.troops) < 15000) return false
    return shortestDays(state, a.pos.city, campaign.roles.weiCapital) <= 2
  })
  if (!has('n5') && has('n4') && (strongNear || pressure >= 42)) return 'n5'
  if (!has('n6') && has('n5') && (state.politics.weiOrderedReturn || state.politics.pangjuanReturning)) return 'n6'
  if (!has('n7')) {
    const decisive = state.flags.weiArmyBroken === 1 || state.flags.weiHome === 1
    if (decisive && state.battles.length === 0) return 'n7'
    if (day >= 62) return 'n7'
  }
  return null
}

export function openNode(state: GameState, nodeId: string): void {
  if (state.resolvedNodes.includes(nodeId)) { state.pendingNode = null; return }
  state.pendingNode = nodeId
  state.decisionWindowEnd = null
}

export function resolveNode(
  state: GameState, campaign: Campaign, narrative: Narrative, nodeId: string, optionId: string,
  opts: { timeout?: boolean } = {},
): NodeDecisionResult {
  const node = campaign.decisions.find(n => n.id === nodeId)
  if (!node) return { ok: false, reason: '节点不存在' }
  if (state.resolvedNodes.includes(nodeId)) return { ok: false, reason: '该决策已执行' }
  state.resolvedNodes.push(nodeId)
  state.pendingNode = null
  state.decisionWindowEnd = null
  const salt = state.narrativeSalt++
  applyOption(state, nodeId, optionId)
  const chosen = node.options.find(o => o.id === optionId)
  recordChoice(state, {
    nodeId,
    optionId,
    tick: state.tick + 1,
    title: node.title,
    label: chosen?.label ?? optionId,
    recommended: chosen?.recommended === true,
    timeout: opts.timeout === true,
  })
  const text = narrative.line('decision.' + optionId, { node: node.title, choice: chosen?.label ?? '依令而行' }, salt)
    || ('御前定策：' + (chosen?.label ?? '依令而行') + '。')
  pushReport(state, 'note', '临淄', text, 'high', 0, true)
  state.log.push('第' + (state.tick + 1) + '日：' + node.title + ' — ' + (chosen?.label ?? optionId))
  return { ok: true }
}

function applyOption(state: GameState, nodeId: string, optionId: string): void {
  const main = state.armies['qi-zhongjun']
  const gaotang = state.armies['qi-gaotang']
  const qicheng = state.armies['qi-qicheng']
  const qingche = state.armies['qi-qingche']
  switch (nodeId) {
    case 'n1':
      if (optionId === 'opt1') { state.flags.rescue = 1; state.tokens = clamp(state.tokens + 2, 0, 3) }
      else if (optionId === 'opt2') { state.flags.delay = 1; state.tokens = clamp(state.tokens + 1, 0, 3) }
      else state.flags.abandon = 1
      state.flags.n1 = 1
      break
    case 'n2':
      state.flags.n2 = Number(optionId.replace('opt', '')) || 1
      if (optionId === 'opt1') {
        if (main) orderArmy(state, main.id, 'march', 'handan')
        if (gaotang) orderArmy(state, gaotang.id, 'march', 'handan')
        if (qicheng) orderArmy(state, qicheng.id, 'march', 'handan')
      } else if (optionId === 'opt2') {
        if (main) orderArmy(state, main.id, 'assault', 'pingling')
        if (gaotang) orderArmy(state, gaotang.id, 'assault', 'xiangling')
        if (qicheng) orderArmy(state, qicheng.id, 'march', 'pingling')
      } else if (optionId === 'opt3') {
        if (main) orderArmy(state, main.id, 'march', 'daliang', 'stealth')
        if (gaotang) orderArmy(state, gaotang.id, 'feint', 'pingling')
        if (qicheng) orderArmy(state, qicheng.id, 'feint', 'pingling')
        if (qingche) orderArmy(state, qingche.id, 'march', 'daliang', 'forced')
      } else {
        state.tokens = clamp(state.tokens + 2, 0, 3)
      }
      break
    case 'n3':
      state.flags.n3 = Number(optionId.replace('opt', '')) || 1
      if (optionId === 'opt1') {
        if (main) orderArmy(state, main.id, 'assault', 'pingling')
      } else if (optionId === 'opt2') {
        state.flags.feintSuccess = 1
        if (gaotang) orderArmy(state, gaotang.id, 'feint', 'pingling')
        if (qicheng) orderArmy(state, qicheng.id, 'feint', 'pingling')
      } else if (optionId === 'opt3') {
        state.flags.qingcheWest = 1
        if (qingche) orderArmy(state, qingche.id, 'march', 'daliang', 'forced')
      } else {
        state.tokens = clamp(state.tokens + 2, 0, 3)
      }
      break
    case 'n4':
      state.flags.n4 = Number(optionId.replace('opt', '')) || 1
      if (optionId === 'opt1') {
        state.flags.pressCapital = 1
        if (main) orderArmy(state, main.id, 'march', 'daliang', 'forced')
      } else if (optionId === 'opt2') {
        if (main) orderArmy(state, main.id, 'march', 'handan', 'forced')
      } else if (optionId === 'opt3') {
        state.flags.feintStrong = 1
        state.tokens = clamp(state.tokens + 1, 0, 3)
      } else {
        state.flags.urgeChuQin = 1
        if (state.politics.chuCommitTick <= 0) state.politics.chuCommitTick = state.tick + 6
        if (state.politics.qinCommitTick <= 0) state.politics.qinCommitTick = state.tick + 8
      }
      break
    case 'n5':
      state.flags.n5 = Number(optionId.replace('opt', '')) || 1
      if (optionId === 'opt1') { if (main) orderArmy(state, main.id, 'assault', 'daliang') }
      else if (optionId === 'opt2') { state.flags.showForce = 1; if (main) orderArmy(state, main.id, 'march', 'daliang') }
      else if (optionId === 'opt3') {
        state.flags.cutSupply = 1
        if (qingche) orderArmy(state, qingche.id, 'ambush', 'guiling', 'stealth')
        if (main) orderArmy(state, main.id, 'march', 'guiling', 'stealth')
      } else { state.flags.feignWeak2 = 1; if (main) orderArmy(state, main.id, 'march', 'pingling') }
      break
    case 'n6':
      state.flags.n6 = Number(optionId.replace('opt', '')) || 1
      if (optionId === 'opt1') {
        state.flags.ambushSite = 1
        if (main) orderArmy(state, main.id, 'ambush', 'guiling', 'stealth')
        if (gaotang) orderArmy(state, gaotang.id, 'ambush', 'guiling', 'stealth')
        if (qingche) orderArmy(state, qingche.id, 'ambush', 'guiling', 'stealth')
        holdOthers(state, ['qi-zhongjun', 'qi-gaotang', 'qi-qingche'])
      } else if (optionId === 'opt2') {
        state.flags.ambushSite = 2
        if (main) orderArmy(state, main.id, 'ambush', 'puyang', 'stealth')
        if (gaotang) orderArmy(state, gaotang.id, 'ambush', 'puyang', 'stealth')
        holdOthers(state, ['qi-zhongjun', 'qi-gaotang'])
      } else if (optionId === 'opt3') {
        state.flags.headOn = 1
        if (main) orderArmy(state, main.id, 'march', 'guiling', 'forced')
        holdOthers(state, ['qi-zhongjun'])
      } else {
        state.flags.keepSiege = 1
        if (main) orderArmy(state, main.id, 'assault', 'daliang')
        holdOthers(state, ['qi-zhongjun'])
      }
      break
    case 'n7':
      state.flags.n7 = Number(optionId.replace('opt', '')) || 1
      if (optionId === 'opt1') state.flags.pursue = 1
      else if (optionId === 'opt2') state.flags.conserve = 1
      else if (optionId === 'opt3') state.flags.takeCities = 1
      else state.flags.peace = 1
      for (const id of state.armyOrder) {
        const a = state.armies[id]
        if (a && a.faction === 'qi') { a.order = null; a.route = [] }
      }
      break
    default:
      break
  }
}

export function defaultOptionFor(state: GameState, campaign: Campaign, nodeId: string, quality: number): string {
  const node = campaign.decisions.find(n => n.id === nodeId)
  if (!node) return ''
  if (quality >= 0.75) return node.defaultOption
  const idx = Math.min(node.options.length - 1, Math.floor((1 - quality) * node.options.length))
  return node.options[idx]?.id ?? node.defaultOption
}

export function checkEnd(state: GameState, campaign: Campaign): void {
  if (state.over) return
  const qiAlive = state.armyOrder
    .map(id => state.armies[id])
    .filter(a => !!a && !a.removed && a.faction === 'qi' && total(a.troops) > 400)
  if (state.flags.daliangTaken === 1) { end(state, 'daliang'); return }
  if (state.flags.peace === 1 && state.flags.n7) { end(state, 'peace'); return }
  if (state.flags.n7 && (state.flags.weiArmyBroken === 1 || state.flags.weiHome === 1)) {
    if (state.flags.ambushSuccess === 1 && state.flags.zhaofallen !== 1) end(state, 'grand')
    else if (state.flags.ambushSuccess === 1) end(state, 'bitter')
    else if (state.flags.weiArmyBroken === 1) end(state, 'bitter')
    else if (state.flags.zhaofallen === 1) end(state, 'bitter')
    else end(state, 'relief')
    return
  }
  if (state.flags.takeCities === 1 && state.flags.n7) { end(state, 'conquest'); return }
  if (qiAlive.length === 0) { end(state, 'rout'); return }
  if (state.flags.abandon === 1 && state.tick >= 20) { end(state, 'abandon'); return }
  if (state.flags.n7 && state.flags.zhaofallen === 1) { end(state, 'bitter'); return }
  if (state.tick >= campaign.maxTicks) end(state, state.flags.zhaofallen === 1 ? 'stalemate' : 'long')
}

function end(state: GameState, endingId: string): void {
  state.over = true
  state.endingId = endingId
}
