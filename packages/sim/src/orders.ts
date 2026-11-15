import type { AppliedOrder, GameState, Modifier, Order, Task } from './types.js'
import { clamp } from './rng.js'
import { recordOrder } from './ledger.js'

export interface OrderDraft {
  task: Task
  armyIds: string[]
  target?: string
  modifier: Modifier[]
}

export const TASK_LABELS: Record<Task, string> = {
  march: '行军', hold: '驻守', feint: '佯攻', assault: '强攻', ambush: '设伏',
  pursue: '追击', retreat: '撤退', rest: '休整', forage: '征粮', scout: '侦察', envoy: '遣使',
}

export const MODIFIER_LABELS: Record<Modifier, string> = {
  forced: '疾行', stealth: '隐蔽', feignWeak: '示弱', night: '夜行', dropBaggage: '弃辎重',
}

export const TASKS_WITH_TARGET: Task[] = ['march', 'hold', 'feint', 'assault', 'ambush', 'forage', 'scout', 'envoy', 'retreat']

export function orderSentence(state: GameState, draft: OrderDraft): string {
  const names = draft.armyIds.map(id => state.armies[id]?.name).filter(Boolean).join('、') || '诸军'
  const targetCity = draft.target ? state.cities[draft.target]?.name : undefined
  const target = targetCity ?? draft.target ?? ''
  const mods = draft.modifier.map(m => MODIFIER_LABELS[m]).join('、')
  const prefix = mods ? mods + '，' : ''
  switch (draft.task) {
    case 'march': return '令' + names + prefix + '向' + target + '行军'
    case 'hold': return '令' + names + prefix + '驻守' + (target || '原地')
    case 'feint': return '令' + names + prefix + '佯攻' + target
    case 'assault': return '令' + names + prefix + '强攻' + target
    case 'ambush': return '令' + names + prefix + '于' + (target || '要道') + '设伏'
    case 'pursue': return '令' + names + prefix + '追击魏军'
    case 'retreat': return '令' + names + prefix + '向' + (target || '后方') + '撤退'
    case 'rest': return '令' + names + '休整'
    case 'forage': return '令' + names + '于' + (target || '就近') + '征粮'
    case 'scout': return '令' + names + prefix + '前往' + (target || '敌境') + '侦察'
    case 'envoy': return '遣使赴' + (target || '列国') + '游说'
    default: return '令' + names + '依令而行'
  }
}

export function orderDelay(draft: OrderDraft): number {
  return draft.task === 'envoy' ? 2 : 1
}

export function canIssue(state: GameState, draft: OrderDraft): string | null {
  if (state.over) return '战役已结束'
  if (state.pendingNode) return '军情紧急，先应对当前决策'
  if (draft.armyIds.length === 0) return '未选择受令部队'
  if (draft.task !== 'hold' && state.tokens <= 0) return '没有可用的军令牌'
  for (const id of draft.armyIds) {
    const army = state.armies[id]
    if (!army || army.removed) return '部队已不存在'
    if (army.inBattle) return army.name + '正在交战，无法接令'
    if (army.faction !== state.playerFaction) return '只能指挥本国部队'
  }
  return null
}

export function issueOrder(state: GameState, draft: OrderDraft): Order | null {
  if (canIssue(state, draft)) return null
  const order: Order = {
    id: 'o' + (state.tick * 100 + state.orders.length),
    task: draft.task,
    armyIds: [...draft.armyIds],
    target: draft.target,
    modifier: [...draft.modifier],
    issuedTick: state.tick,
    arriveTick: state.tick + orderDelay(draft),
  }
  state.orders.push(order)
  if (draft.task !== 'hold') state.tokens = clamp(state.tokens - 1, 0, 3)
  recordOrder(state, { tick: state.tick + 1, task: draft.task, armyIds: [...draft.armyIds], target: draft.target, result: 'ok' })
  return order
}

export function applyArrivedOrders(state: GameState): void {
  const arrived = state.orders.filter(o => o.arriveTick <= state.tick)
  state.orders = state.orders.filter(o => o.arriveTick > state.tick)
  for (const order of arrived) {
    for (const id of order.armyIds) {
      const army = state.armies[id]
      if (!army || army.removed || army.inBattle) continue
      if (army.faction !== state.playerFaction) continue
      const applied: AppliedOrder = {
        task: order.task,
        target: order.target,
        modifier: [...order.modifier],
        sinceTick: state.tick,
        arrived: false,
        waitTicks: 0,
      }
      army.order = applied
      army.route = []
      army.stealth = order.modifier.includes('stealth') ? 0.75 : order.modifier.includes('night') ? 0.55 : 0.2
      if (order.task === 'hold' && !order.target) applied.arrived = true
      if (order.task === 'pursue') applied.arrived = true
      if (order.task === 'rest') applied.arrived = true
    }
  }
}

export function dailyTokens(state: GameState): void {
  if (state.tick - state.lastTokenTick >= 10) {
    state.lastTokenTick = state.tick
    state.tokens = clamp(state.tokens + 1, 0, 3)
  }
}

export function orderLabel(task: Task): string {
  return TASK_LABELS[task]
}
