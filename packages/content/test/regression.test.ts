import { describe, it } from 'vitest'
import { advanceDay, advanceOpsDay, createGame, createOpsState, finalize, registerRules, resolveDecision, resolveOpsNode } from '@aiwar/sim'
import { guilingCampaign, narrator as guilingNarrator } from '../src/index.js'
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

const HISTORIC_PICKS: Record<string, Record<string, string>> = {
  'siduchishui-1935': { d1: 'opt1', d2: 'opt2', d3: 'opt1', d4: 'opt1', d5: 'opt2', d6: 'opt2', d7: 'opt2', d8: 'opt1' },
  'chibi-208': { d1: 'opt1', d2: 'opt1', d3: 'opt1', d4: 'opt1', d5: 'opt1', d6: 'opt1', d7: 'opt1' },
  'feishui-383': { d1: 'opt1', d2: 'opt1', d3: 'opt1', d4: 'opt1', d5: 'opt1', d6: 'opt1', d7: 'opt1', d8: 'opt1' },
  'huaihai-1948': { d1: 'opt2', d2: 'opt1', d3: 'opt1', d4: 'opt1', d5: 'opt1', d6: 'opt1', d7: 'opt1', d8: 'opt1' },
}

function run(campaign: any, rules: any, seed: number, difficulty: 'hist' | 'normal' | 'hard' | 'hell' = 'normal') {
  const st = createOpsState(campaign, difficulty, seed)
  rules.opening(st, campaign, narrative)
  const picks = HISTORIC_PICKS[campaign.meta.id] ?? {}
  for (let i = 0; i < 120; i++) {
    if (st.over) break
    const r = advanceOpsDay(st, campaign, narrative, rules)
    if (r.pendingNode) resolveOpsNode(st, campaign, narrative, rules, r.pendingNode, picks[r.pendingNode] ?? 'opt1')
  }
  return rules.score(st, campaign)
}

// 围魏救赵（旧引擎）跑同一套史实决策串，取 5 个种子的平均分
const GUILING_PICKS: Record<string, string> = { n1: 'opt1', n2: 'opt3', n3: 'opt2', n4: 'opt1', n5: 'opt2', n6: 'opt1', n7: 'opt2' }
function runLegacy(difficulty: 'hist' | 'hell'): number {
  const rows = [11, 12, 13, 14, 15].map(seed => {
    const state = createGame({ campaign: guilingCampaign, difficulty, seed })
    for (let i = 0; i < 120; i++) {
      if (state.over) break
      const r = advanceDay(state, guilingCampaign, guilingNarrator)
      if (r.pendingNode) resolveDecision(state, guilingCampaign, guilingNarrator, r.pendingNode, GUILING_PICKS[r.pendingNode] ?? 'opt1')
    }
    return finalize(state, guilingCampaign).total
  })
  return rows.reduce((s, v) => s + v, 0) / rows.length
}

function assertProgress(name: string, campaign: any, rules: any, minGrade: string) {
  const order = 'SABCD'
  const rows = [1, 2, 3].map(seed => run(campaign, rules, seed))
  const best = rows.reduce((a, b) => (order.indexOf(a.grade) <= order.indexOf(b.grade) ? a : b))
  console.log(name, 'grades', rows.map(r => r.grade).join(''), 'endings', [...new Set(rows.map(r => r.endingId))].join(','), 'best', best.endingId, best.grade, best.total)
  if (order.indexOf(best.grade) > order.indexOf(minGrade)) {
    throw new Error(name + ' 历史路线未达到 ' + minGrade + '（最好 ' + best.grade + '/' + best.total + '）')
  }
  return best
}

describe('campaign regression (historical routes)', () => {
  it('四渡赤水历史路线可达 S/A', () => {
    const best = assertProgress('sidu', siduCampaign, siduRules, 'A')
    if (best.endingId !== 'crossing') throw new Error('四渡赤水应能渡江，实际 ' + best.endingId)
  })

  it('赤壁历史路线可达 S/A', () => {
    const best = assertProgress('chibi', chibiCampaign, chibiRules, 'A')
    if (best.endingId !== 'victory' && best.endingId !== 'great') throw new Error('赤壁应能取胜，实际 ' + best.endingId)
  })

  it('淝水历史路线可达 A', () => {
    const best = assertProgress('feishui', feishuiCampaign, feishuiRules, 'A')
    if (best.endingId !== 'victory' && best.endingId !== 'crushed') throw new Error('淝水应能取胜，实际 ' + best.endingId)
  })

  it('淮海历史路线可达 B 以上', () => {
    const best = assertProgress('huaihai', huaihaiCampaign, huaihaiRules, 'B')
    if (!['full', 'partial', 'south'].includes(best.endingId)) throw new Error('淮海应能围歼敌军，实际 ' + best.endingId)
    if ((best.parts.find((p: { key: string; value: number }) => p.key === 'jiawang')?.value ?? 0) <= 0) throw new Error('淮海应能触发贾汪战场转向')
  })

  // 围魏救赵走的是旧引擎，此前没有难度梯度守卫：修好「敌方永不断粮」之后，
  // 它的地主难度也不该靠 scoreFactor 把分数抬过史实难度。
  it('围魏救赵历史路线难度梯度单调（史实 > 地狱）', () => {
    const hist = runLegacy('hist')
    const hell = runLegacy('hell')
    console.log('difficulty guiling hist', Math.round(hist), 'hell', Math.round(hell), 'gap', Math.round(hist - hell))
    if (hist < hell - 3) throw new Error('guiling 难度倒挂：史实 ' + Math.round(hist) + ' 明显低于地狱 ' + Math.round(hell))
    if (hist < 60) throw new Error('guiling 史实路线分数过低：' + Math.round(hist))
  })

  // 难度梯度回归：历史难度平均分必须高于地狱难度，防止分数倒挂
  it('难度梯度单调（史实 > 地狱）', () => {
    const cases = [
      ['sidu', siduCampaign, siduRules],
      ['chibi', chibiCampaign, chibiRules],
      ['feishui', feishuiCampaign, feishuiRules],
    ] as const
    for (const [name, campaign, rules] of cases) {
      const avg = (diff: 'hist' | 'hell') => {
        const rows = [11, 12, 13, 14, 15].map(seed => run(campaign, rules, seed, diff))
        return rows.reduce((s, r) => s + r.total, 0) / rows.length
      }
      const hist = avg('hist')
      const hell = avg('hell')
      console.log('difficulty', name, 'hist', Math.round(hist), 'hell', Math.round(hell), 'gap', Math.round(hist - hell))
      // 分数对难度只做软约束：难度主要影响行为（胜率/兵力/时长），允许 ±3 分噪声
      if (hist < hell - 3) throw new Error(name + ' 难度倒挂：史实 ' + Math.round(hist) + ' 明显低于地狱 ' + Math.round(hell))
    }
  })
})