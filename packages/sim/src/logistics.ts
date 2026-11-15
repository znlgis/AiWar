import type { Campaign, GameState } from './types.js'
import { clamp } from './rng.js'
import { pushReport } from './reports.js'
import { applyLosses, livingArmies, nearestFriendlyCity, total } from './state.js'
import { shortestPath } from './map.js'

export function supplyStateOf(state: GameState, armyId: string, campaign: Campaign): 'ok' | 'threatened' | 'cut' {
  const army = state.armies[armyId]
  if (!army) return 'ok'
  const from = army.pos.city ?? army.pos.from
  if (!from) return 'ok'
  const current = state.cities[from]
  if (current && current.owner === army.faction) return 'ok'
  const haven = nearestFriendlyCity(state, army.faction, from)
  if (!haven) return 'cut'
  const steps = shortestPath(state.roads, from, haven)
  for (const step of steps) {
    const city = state.cities[step.city]
    if (!city) continue
    if (city.owner === army.faction) continue
    if (city.owner === 'wei') return 'cut'
    if (city.owner === 'wei_state') {
      const attitude = state.politics.weiStateAttitude
      if (city.id === 'puyang' && attitude < -10) return 'cut'
      return 'threatened'
    }
    if (city.owner === 'song') {
      if (state.politics.songAttitude < -10) return 'cut'
      return 'threatened'
    }
  }
  return 'ok'
}

export function logisticsTick(state: GameState, campaign: Campaign, narrative: { line: (k: string, p: Record<string, string>, s: number) => string }): void {
  const diff = campaign.difficulty[state.difficulty]
  // 原来只遍历「第一支部队所属阵营」，于是只有齐军消耗粮草、魏军永不断粮，
  // 断粮分支对敌方形同虚设。补给是通用规则，必须对场上所有部队生效。
  for (const army of allLivingArmies(state)) {
    if (army.removed || army.inBattle) continue
    army.supply = supplyStateOf(state, army.id, campaign)
    const cityId = army.pos.city
    const city = cityId ? state.cities[cityId] : undefined
    let delta = -campaign.balance.foodConsumption * diff.supplyFactor
    if (army.supply === 'ok' && city && city.owner === army.faction) {
      delta += campaign.balance.resupplyDays
      city.grain = Math.max(0, city.grain - 0.4)
    } else if (army.supply === 'threatened' && army.faction === 'qi' && state.tick % 5 === 0) {
      const salt = state.narrativeSalt++
      pushReport(state, 'court', state.cities[cityId ?? '']?.name ?? '前线', narrative.line('supply.threat', { place: state.cities[cityId ?? '']?.name ?? '前线' }, salt), 'mid', 1, false)
    } else if (army.supply === 'cut') {
      delta -= 0.6
      army.morale = clamp(army.morale - 1.2, 5, 100)
    }
    army.foodDays = clamp(army.foodDays + delta, 0, campaign.balance.maxFoodDays)
    if (army.foodDays <= 0) {
      army.morale = clamp(army.morale - 2, 5, 100)
      const lost = applyLosses(army, campaign.balance.desertionPerDay)
      // 折损记到该部队真正的阵营上：写死 qi/wei 会把第三方阵营的损失算错人
      state.casualties[army.faction] = (state.casualties[army.faction] ?? 0) + lost
      const salt = state.narrativeSalt++
      if (army.faction === 'qi' && state.tick % 3 === 0) {
        pushReport(state, 'court', state.cities[cityId ?? '']?.name ?? '前线', narrative.line('supply.empty', { army: army.name }, salt), 'high', 1, true)
      }
    } else if (army.foodDays < 5 && army.faction === 'qi' && state.tick % 4 === 0) {
      const salt = state.narrativeSalt++
      pushReport(state, 'court', state.cities[cityId ?? '']?.name ?? '前线', narrative.line('supply.low', { army: army.name }, salt), 'mid', 1, false)
    } else {
      army.morale = clamp(army.morale + 0.25, 5, 100)
    }
    if (!army.order || army.order.task !== 'rest') {
      army.fatigue = clamp(army.fatigue - (army.pos.kind === 'city' ? 2.5 : 1), 0, 100)
    } else {
      army.fatigue = clamp(army.fatigue - 8, 0, 100)
      army.morale = clamp(army.morale + 1.5, 5, 100)
    }
    if (army.fatigue < 20 && army.foodDays > 8 && army.morale < 82) {
      army.morale = clamp(army.morale + 0.2, 5, 100)
    }
    void total
  }
}

/** 场上全部存活部队（不分阵营）：补给、断粮、疲惫对每一支都该结算 */
function allLivingArmies(state: GameState): import('./types.js').ArmyState[] {
  return state.armyOrder
    .map(id => state.armies[id])
    .filter((a): a is import('./types.js').ArmyState => !!a && !a.removed)
}
