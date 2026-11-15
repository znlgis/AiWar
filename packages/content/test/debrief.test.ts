import { describe, expect, it } from 'vitest'
import {
  advanceDay, advanceOpsDay, createGame, createOpsState, debriefForLegacy, debriefForOps,
  debriefToText, finalize, normalizeLedgers, registerRules, resolveNode, resolveOpsNode, seedOpening,
  verdictOf,
} from '@aiwar/sim'
import { guilingCampaign } from '../src/guiling-353bc/campaign.js'
import { narrator } from '../src/guiling-353bc/narratives.js'
import { siduCampaign } from '../src/ops/siduchishui/data.js'
import siduRules from '../src/ops/siduchishui/rules.js'
import { chibiCampaign } from '../src/ops/chibi/data.js'
import chibiRules from '../src/ops/chibi/rules.js'
import { feishuiCampaign } from '../src/ops/feishui/data.js'
import feishuiRules from '../src/ops/feishui/rules.js'
import { huaihaiCampaign } from '../src/ops/huaihai/data.js'
import huaihaiRules from '../src/ops/huaihai/rules.js'
import { makeOpsNarrator } from '../src/ops/narrator.js'

registerRules(siduRules)
registerRules(chibiRules)
registerRules(feishuiRules)
registerRules(huaihaiRules)
const narrative = makeOpsNarrator()

const HISTORIC: Record<string, Record<string, string>> = {
  'siduchishui-1935': { d1: 'opt1', d2: 'opt2', d3: 'opt1', d4: 'opt1', d5: 'opt2', d6: 'opt2', d7: 'opt2', d8: 'opt1' },
  'chibi-208': { d1: 'opt1', d2: 'opt1', d3: 'opt1', d4: 'opt1', d5: 'opt1', d6: 'opt1', d7: 'opt1' },
  'feishui-383': { d1: 'opt1', d2: 'opt1', d3: 'opt1', d4: 'opt1', d5: 'opt1', d6: 'opt1', d7: 'opt1', d8: 'opt1' },
  'huaihai-1948': { d1: 'opt2', d2: 'opt1', d3: 'opt1', d4: 'opt1', d5: 'opt1', d6: 'opt1', d7: 'opt1', d8: 'opt1' },
}

const OPS = [
  ['sidu', siduCampaign, siduRules],
  ['chibi', chibiCampaign, chibiRules],
  ['feishui', feishuiCampaign, feishuiRules],
  ['huaihai', huaihaiCampaign, huaihaiRules],
] as const

function runOps(campaign: any, rules: any, seed: number, pickStrategy: 'historic' | 'last') {
  const state = createOpsState(campaign, 'normal', seed)
  rules.opening(state, campaign, narrative)
  const picks = HISTORIC[campaign.meta.id] ?? {}
  for (let i = 0; i < 120; i++) {
    if (state.over) break
    const result = advanceOpsDay(state, campaign, narrative, rules)
    if (result.pendingNode) {
      const node = campaign.decisions.find((d: any) => d.id === result.pendingNode)
      const optionId = pickStrategy === 'historic'
        ? (picks[result.pendingNode] ?? 'opt1')
        : (node?.options[node.options.length - 1]?.id ?? 'opt1')
      resolveOpsNode(state, campaign, narrative, rules, result.pendingNode, optionId)
    }
  }
  return { state, score: rules.score(state, campaign) }
}

function runLegacy() {
  const state = createGame({ campaign: guilingCampaign, difficulty: 'normal', seed: 5 })
  seedOpening(state, guilingCampaign, narrator)
  for (let i = 0; i < 120; i++) {
    if (state.over) break
    const result = advanceDay(state, guilingCampaign, narrator)
    if (result.pendingNode) resolveNode(state, guilingCampaign, narrator, result.pendingNode, 'opt1')
  }
  return { state, score: finalize(state, guilingCampaign) }
}

describe('debrief：不论输赢都出得来', () => {
  for (const [name, campaign, rules] of OPS) {
    it(name + ' 胜局有战报、有分析', () => {
      const { state, score } = runOps(campaign, rules, 1, 'historic')
      const debrief = debriefForOps(state, campaign, score)
      expect(debrief.verdict).toBe(verdictOf(campaign.meta.id, state.endingId))
      expect(debrief.chronicle.length).toBeGreaterThan(0)
      expect(debrief.reading.length).toBe(score.parts.length)
      expect(debrief.metrics.length).toBe(7)
      expect(debrief.turningPoint.text.length).toBeGreaterThan(0)
      expect(debriefToText(debrief, { campaignTitle: campaign.meta.title, grade: score.grade, total: score.total }).length).toBeGreaterThan(80)
      console.log('debrief', name, 'verdict', debrief.verdict, 'chronicle', debrief.chronicle.length,
        'battles', debrief.battles.length, 'cities', debrief.cities.length, 'decisions', debrief.decisions.length)
    })

    it(name + ' 劣局同样有战报，且失败时给「如果当时」', () => {
      const { state, score } = runOps(campaign, rules, 2, 'last')
      const debrief = debriefForOps(state, campaign, score)
      expect(debrief.chronicle.length).toBeGreaterThan(0)
      expect(debrief.metrics.length).toBe(7)
      if (debrief.verdict === 'lose') expect(debrief.hintIfLose.length).toBeGreaterThan(10)
      else expect(debrief.hintIfLose).toBe('')
    })

    it(name + ' 弃局也出残局战报', () => {
      const { state, score } = runOps(campaign, rules, 3, 'historic')
      const debrief = debriefForOps(state, campaign, score, { abandoned: true })
      expect(debrief.verdict).toBe('abandoned')
      expect(debrief.verdictLabel).toBe('弃局')
      expect(debrief.headline.startsWith('战至中途')).toBe(true)
    })
  }

  it('围魏救赵（legacy）同样出得来战报', () => {
    const { state, score } = runLegacy()
    const debrief = debriefForLegacy(state, guilingCampaign, score)
    expect(debrief.chronicle.length).toBeGreaterThan(0)
    expect(debrief.reading.length).toBe(score.parts.length)
    console.log('debrief guiling', 'verdict', debrief.verdict, 'ending', state.endingId,
      'chronicle', debrief.chronicle.length, 'battles', debrief.battles.length, 'choices', debrief.decisions.length)
  })

  it('账本记录不改变推演结果（同 seed 同决策 → 同结局同分数）', () => {
    for (const [name, campaign, rules] of OPS) {
      const a = runOps(campaign, rules, 7, 'historic')
      const b = runOps(campaign, rules, 7, 'historic')
      expect(a.state.tick, name).toBe(b.state.tick)
      expect(a.score.total, name).toBe(b.score.total)
      expect(a.state.endingId, name).toBe(b.state.endingId)
    }
  })

  it('旧存档缺账本字段时补空数组，不抛错', () => {
    const ledgers = normalizeLedgers({ battleLog: undefined as never })
    expect(ledgers.battleLog).toEqual([])
    expect(ledgers.cityLog).toEqual([])
    expect(ledgers.choiceLog).toEqual([])
    expect(ledgers.orderLog).toEqual([])
  })
})
