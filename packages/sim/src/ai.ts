import type { Campaign, GameState, Narrative } from './types.js'
import { chance, clamp, makeRng } from './rng.js'
import { pushReport } from './reports.js'
import { shortestPath } from './map.js'
import { total } from './state.js'

type Narr = Pick<Narrative, 'line'>

export function pangjuanTick(state: GameState, campaign: Campaign, narrative: Narr): void {
  const rng = makeRng(state.seed, state.tick)
  const army = state.armies[campaign.roles.weiFieldArmy]
  const handan = state.cities[campaign.roles.zhaoCapital]
  const capital = state.cities[campaign.roles.weiCapital]
  if (!army || army.removed || !handan || !capital) return
  const progress = 1 - handan.garrison / handan.initialGarrison
  const diff = campaign.difficulty[state.difficulty]

  const handanFallen = handan.owner === 'wei'
  if (handanFallen && !state.politics.pangjuanReturning) {
    state.politics.pangjuanReturning = true
    state.politics.pangjuanReturnSince = state.tick
    army.order = { task: 'march', target: capital.id, modifier: ['forced'], sinceTick: state.tick, arrived: false, waitTicks: 0 }
    army.route = ['puyang', 'guiling', capital.id].filter(id => !!state.cities[id])
    pushReport(state, 'scout', '邯郸', narrative.line('politics.return_fast', {}, state.narrativeSalt++), 'mid', 1, true)
    state.log.push('第' + (state.tick + 1) + '日：庞涓既破邯郸，引军东还')
    return
  }
  if (!state.politics.weiOrderedReturn) {
    if (army.pos.kind === 'city' && army.pos.city === handan.id) {
      if (!army.order || army.order.task !== 'assault') {
        army.order = { task: 'assault', target: handan.id, modifier: [], sinceTick: state.tick, arrived: true, waitTicks: 0 }
      }
    }
    return
  }

  if (!state.politics.pangjuanReturning) {
    const canDefy = progress > 0.58 && state.politics.pangjuanDelays < 2
    const defyChance = (0.5 + (handan.initialGarrison - handan.garrison) / handan.initialGarrison * 0.4) - diff.feintBreakChance * 0.15
    if (canDefy && chance(rng, Math.max(0.15, defyChance), 'defy')) {
      state.politics.pangjuanDelays += 1
      pushReport(state, 'court', '邯郸', narrative.line('politics.delay', {}, state.narrativeSalt++), 'mid', 1, true)
      state.log.push('第' + (state.tick + 1) + '日：庞涓按兵不动，仍攻邯郸')
      return
    }
    state.politics.pangjuanReturning = true
    state.politics.pangjuanReturnSince = state.tick
    const urgent = state.politics.weiPressure >= 78
    const broken = chance(rng, diff.feintBreakChance, 'breakfeint')
    const useDirect = broken
    const route = useDirect
      ? shortestPath(state.roads, handan.id, capital.id).map(step => step.city)
      : ['puyang', 'guiling', capital.id].filter(id => !!state.cities[id])
    army.order = {
      task: 'march', target: capital.id, modifier: urgent ? ['forced'] : [], sinceTick: state.tick, arrived: false, waitTicks: 0,
    }
    army.route = route
    pushReport(state, 'scout', '邯郸', narrative.line(urgent ? 'politics.return_fast' : 'politics.return', {}, state.narrativeSalt++), 'mid', 1, true)
    state.log.push('第' + (state.tick + 1) + '日：魏军自邯郸东返' + (urgent ? '，倍日并行' : ''))
    return
  }

  if (army.pos.kind === 'city' && army.pos.city === capital.id) {
    const qiHere = state.armyOrder.some(id => {
      const a = state.armies[id]
      return !!a && !a.removed && a.faction === 'qi' && a.pos.city === capital.id
    })
    if (!qiHere) {
      capital.garrison += Math.round(total(army.troops) * 0.8)
      army.removed = true
      army.troops = { chariot: 0, infantry: 0, cavalry: 0, crossbow: 0 }
      state.flags.weiHome = 1
      pushReport(state, 'court', '大梁', narrative.line('politics.wei_home', {}, state.narrativeSalt++), 'mid', 1, true)
      state.log.push('第' + (state.tick + 1) + '日：庞涓入大梁，魏军主力回防国都')
    }
  }
  void clamp
}