import { describe, expect, it } from 'vitest'
import { advanceDay, applyLosses, createGame, makeRng, shortestPath } from '../src/index.js'
import type { Campaign, ArmyDef, CityDef, RoadDef, PathStep } from '../src/index.js'

const roads: RoadDef[] = [
  { id: 'a-b', from: 'a', to: 'b', days: 2 },
  { id: 'b-c', from: 'b', to: 'c', days: 3 },
  { id: 'a-c', from: 'a', to: 'c', days: 9 },
]
const cities: CityDef[] = [
  { id: 'a', name: 'A', x: 0, y: 0, kind: 'capital', owner: 'qi', wall: 2, garrison: 1000, grain: 30 },
  { id: 'b', name: 'B', x: 10, y: 0, kind: 'city', owner: 'wei', wall: 2, garrison: 1000, grain: 30 },
  { id: 'c', name: 'C', x: 20, y: 0, kind: 'city', owner: 'zhao', wall: 2, garrison: 1000, grain: 30 },
]
const armies: ArmyDef[] = [
  { id: 'qi-1', name: '中军', faction: 'qi', commander: '田忌', troops: { chariot: 1000, infantry: 5000, cavalry: 500, crossbow: 500 }, morale: 70, fatigue: 10, training: 1, foodDays: 20, city: 'a' },
  { id: 'wei-1', name: '魏军', faction: 'wei', commander: '庞涓', troops: { chariot: 1000, infantry: 5000, cavalry: 500, crossbow: 500 }, morale: 70, fatigue: 10, training: 1, foodDays: 20, city: 'b' },
]
const campaign = {
  meta: {
    id: 'test', title: 'T', subtitle: '', dateLabel: '', startLabel: '', background: '', objective: '', infoTip: '', history: [], disclaimer: '',
  },
  playerFaction: 'qi',
  maxTicks: 30,
  factions: {
    qi: { name: '齐', color: '#000', short: '齐' }, wei: { name: '魏', color: '#111', short: '魏' },
    zhao: { name: '赵', color: '#222', short: '赵' }, song: { name: '宋', color: '#333', short: '宋' },
    wei_state: { name: '卫', color: '#444', short: '卫' }, chu: { name: '楚', color: '#555', short: '楚' },
    qin: { name: '秦', color: '#666', short: '秦' },
  },
  cities, roads, armies, decisions: [],
  difficulty: {
    hist: { id: 'hist', name: '史实', label: '', intelDelay: 1, strengthError: 0.2, falseReportPerTenDays: 0, scoutEfficiency: 1.3, enemyIntelQuality: 0.8, feintBreakChance: 0.02, decisionSeconds: 120, supplyFactor: 0.9, scoreFactor: 0.92, defaultQuality: 0.9 },
    normal: { id: 'normal', name: '普通', label: '', intelDelay: 2, strengthError: 0.35, falseReportPerTenDays: 0.5, scoutEfficiency: 1, enemyIntelQuality: 1, feintBreakChance: 0.12, decisionSeconds: 100, supplyFactor: 1, scoreFactor: 1, defaultQuality: 0.65 },
    hard: { id: 'hard', name: '困难', label: '', intelDelay: 3, strengthError: 0.5, falseReportPerTenDays: 1.2, scoutEfficiency: 0.8, enemyIntelQuality: 1.2, feintBreakChance: 0.32, decisionSeconds: 80, supplyFactor: 1.1, scoreFactor: 1.08, defaultQuality: 0.35 },
    hell: { id: 'hell', name: '地狱', label: '', intelDelay: 4, strengthError: 0.65, falseReportPerTenDays: 2, scoutEfficiency: 0.65, enemyIntelQuality: 1.4, feintBreakChance: 0.5, decisionSeconds: 60, supplyFactor: 1.25, scoreFactor: 1.15, defaultQuality: 0.1 },
  },
  balance: { battleIntensity: 0.09, ambushMultiplier: 2.3, wallDefense: 1, foodConsumption: 1, resupplyDays: 4, maxFoodDays: 42, routTroopRatio: 0.62, routMorale: 30, desertionPerDay: 0.01, siegeGarrisonLoss: 0.008, siegeGrainLoss: 0.9, weiPressurePerThreat: 1, weiPressureDecay: 0.45, returnOrderThreshold: 42, zhaoFallRatio: 0.22 },
  roles: { weiFieldArmy: 'wei-1', zhaoCapital: 'c', weiCapital: 'b', zhaoNorth: 'c', qiStaging: 'a', ambushSites: [] },
  weights: { objective: 30, weiLoss: 20, qiPreserve: 15, zhaoSurvive: 10, cities: 10, diplomacy: 5, logistics: 5, historyEcho: 5 },
} as Campaign

const narrator = {
  line: () => '',
  ending: () => ({ title: '', text: '' }),
}

describe('kernel', () => {
  it('uses deterministic rng per domain and tick', () => {
    const a = makeRng(42, 1)
    const b = makeRng(42, 1)
    const c = makeRng(42, 2)
    expect(a('combat')).toBe(b('combat'))
    expect(a('combat')).not.toBe(c('combat'))
    expect(a('combat', 1)).not.toBe(a('combat', 2))
  })

  it('finds shortest path by road days', () => {
    expect(shortestPath(roads, 'a', 'c').map((s: PathStep) => s.city)).toEqual(['b', 'c'])
  })

  it('applies proportional losses without going negative', () => {
    const state = createGame({ campaign, difficulty: 'normal', seed: 1 })
    const army = state.armies['qi-1']!
    const lost = applyLosses(army, 0.5)
    expect(lost).toBe(3500)
    expect(army.troops.infantry).toBe(2500)
    applyLosses(army, 2)
    expect(army.troops.infantry).toBe(0)
  })

  it('advances days and keeps state serializable', () => {
    const state = createGame({ campaign, difficulty: 'normal', seed: 7 })
    for (let i = 0; i < 10 && !state.over; i++) {
      advanceDay(state, campaign, narrator)
      if (state.pendingNode) state.pendingNode = null
    }
    expect(state.tick).toBe(10)
    expect(() => JSON.stringify(state)).not.toThrow()
  })
})