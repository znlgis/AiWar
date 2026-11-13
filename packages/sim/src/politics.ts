import type { Campaign, GameState } from './types.js'
import { chance, clamp, makeRng, pick } from './rng.js'
import { pushReport } from './reports.js'
import { livingArmies, shortestDays, total } from './state.js'

const WEATHER_POOL: GameState['weather'][] = ['clear', 'clear', 'rain', 'fog', 'snow']
const WEATHER_NAME: Record<GameState['weather'], string> = { clear: '晴', rain: '雨', snow: '雪', fog: '大雾' }

export function politicsTick(state: GameState, campaign: Campaign, narrative: { line: (k: string, p: Record<string, string>, s: number) => string }): void {
  const rng = makeRng(state.seed, state.tick)
  const weiArmy = state.armies[campaign.roles.weiFieldArmy]
  const capital = campaign.roles.weiCapital
  let threat = 0
  for (const army of livingArmies(state, 'qi')) {
    if (army.removed) continue
    const at = army.pos.city ?? army.pos.from
    if (!at) continue
    const weight = clamp(total(army.troops) / 30000, 0.12, 1.6)
    if (at === capital) threat += 8 * weight
    else {
      const days = shortestDays(state, at, capital)
      if (days <= 1) threat += 5 * weight
      else if (days <= 2) threat += 3 * weight
      else if (state.cities[at]?.owner === 'wei') threat += 1 * weight
    }
  }
  if (state.cities[capital]?.besieged) threat += 8
  const decay = campaign.balance.weiPressureDecay
  state.politics.weiPressure = clamp(state.politics.weiPressure + threat * campaign.balance.weiPressurePerThreat - decay, 0, 100)

  if (!state.politics.weiOrderedReturn && state.politics.weiPressure >= campaign.balance.returnOrderThreshold) {
    state.politics.weiOrderedReturn = true
    const salt = state.narrativeSalt++
    pushReport(state, 'court', '大梁', narrative.line('politics.order_return', {}, salt), 'mid', 1, true)
    state.log.push('第' + (state.tick + 1) + '日：魏王强令庞涓回师')
  }

  if (state.politics.chuCommitTick > 0 && state.tick >= state.politics.chuCommitTick) {
    state.politics.weiPressure = clamp(state.politics.weiPressure + 1.4, 0, 100)
    if (state.tick === state.politics.chuCommitTick) {
      const salt = state.narrativeSalt++
      pushReport(state, 'envoy', '南线', narrative.line('politics.chu', {}, salt), 'mid', 2, false)
      state.log.push('第' + (state.tick + 1) + '日：楚军北上，魏国南线告急')
    }
  }
  if (state.politics.qinCommitTick > 0 && state.tick >= state.politics.qinCommitTick) {
    state.politics.weiPressure = clamp(state.politics.weiPressure + 1.1, 0, 100)
    if (state.tick === state.politics.qinCommitTick) {
      const salt = state.narrativeSalt++
      pushReport(state, 'envoy', '西线', narrative.line('politics.qin', {}, salt), 'mid', 2, false)
      state.log.push('第' + (state.tick + 1) + '日：秦军攻魏河西，魏国西线吃紧')
    }
  }

  for (const army of livingArmies(state, 'qi')) {
    const at = army.pos.city
    if (!at) continue
    const city = state.cities[at]
    if (!city) continue
    if (city.owner === 'song') state.politics.songAttitude = clamp(state.politics.songAttitude - 0.35, -30, 30)
    if (city.owner === 'wei_state') state.politics.weiStateAttitude = clamp(state.politics.weiStateAttitude - 0.35, -30, 30)
  }

  if (state.tick >= state.weatherNext) {
    state.weather = pick(rng, WEATHER_POOL, 'weather')
    state.weatherNext = state.tick + 6 + Math.floor(rng('weatherlen') * 5)
    const salt = state.narrativeSalt++
    const weatherKey = state.weather === 'clear' ? '' : 'weather.' + state.weather
    const weatherText = weatherKey ? narrative.line(weatherKey, {}, state.narrativeSalt++) : ''
    pushReport(state, 'note', '军中', (weatherText || '天气：' + WEATHER_NAME[state.weather]), 'high', 0, false)
    void salt
  }

  const zhao = state.cities[campaign.roles.zhaoCapital]
  if (zhao) {
    state.politics.zhaoMorale = clamp(state.politics.zhaoMorale + (zhao.besieged ? -0.6 : 0.3), 5, 100)
    if (zhao.owner === 'wei') state.flags.zhaofallen = 1
  }

  // 情报：魏军主力的目击与邯郸围城进展
  if (weiArmy && !weiArmy.removed && state.tick % 3 === 0) {
    const place = weiArmy.pos.kind === 'city'
      ? (state.cities[weiArmy.pos.city ?? '']?.name ?? '魏境')
      : (state.roads.find(r => r.id === weiArmy.pos.road)?.name ?? '魏境道上')
    const troops = total(weiArmy.troops)
    const band = troops > 50000 ? '数万' : troops > 20000 ? '万余' : troops > 8000 ? '数千' : '不详'
    const confidence = state.difficulty === 'hell' || state.difficulty === 'hard' ? 'low' : 'mid'
    pushReport(state, 'scout', place, narrative.line('intel.sighting', { place, band }, state.narrativeSalt++), confidence, campaign.difficulty[state.difficulty].intelDelay)
    state.traces = state.traces.filter(t => t.armyId !== weiArmy.id)
    if (weiArmy.pos.kind === 'road' && state.tick % 6 === 0) {
      pushReport(state, 'border', place, narrative.line('intel.march', { place, band }, state.narrativeSalt++), 'mid', 1, false)
    }
    state.traces.push({
      armyId: weiArmy.id, faction: 'wei', place, city: weiArmy.pos.city, road: weiArmy.pos.road,
      seenTick: state.tick, band, confidence,
    })
  }
  const handanCity = state.cities[campaign.roles.zhaoCapital]
  if (handanCity && handanCity.besieged && state.tick % 4 === 0) {
    const ratio = handanCity.garrison / handanCity.initialGarrison
    const level = ratio > 0.6 ? '城防尚固' : ratio > 0.4 ? '城防渐危' : '城防将破'
    pushReport(state, 'deserter', handanCity.name, narrative.line('siege.progress', { city: handanCity.name, level }, 0), 'mid', 2, false)
  }
  if (chance(rng, 0.02, 'rumor')) {
    const salt = state.narrativeSalt++
    pushReport(state, 'merchant', '定陶', narrative.line('intel.rumor', {}, salt), 'low', 3, false)
  }
  void weiArmy
  void total
}