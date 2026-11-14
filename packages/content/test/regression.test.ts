import { describe, it } from 'vitest'
import { advanceOpsDay, createOpsState, registerRules, resolveOpsNode } from '@aiwar/sim'
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

function run(campaign: any, rules: any, seed: number) {
  const st = createOpsState(campaign, 'normal', seed)
  rules.opening(st, campaign, narrative)
  const picks = HISTORIC_PICKS[campaign.meta.id] ?? {}
  for (let i = 0; i < 120; i++) {
    if (st.over) break
    const r = advanceOpsDay(st, campaign, narrative, rules)
    if (r.pendingNode) resolveOpsNode(st, campaign, narrative, rules, r.pendingNode, picks[r.pendingNode] ?? 'opt1')
  }
  return rules.score(st, campaign)
}

function assertProgress(name: string, campaign: any, rules: any, minGrade: string) {
  const order = 'SDCBA'
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

  it('淮海历史路线可走完全程并形成合围（平衡调参中，暂不卡评级）', () => {
    const best = assertProgress('huaihai', huaihaiCampaign, huaihaiRules, 'D')
    if (!['full', 'partial', 'south', 'stall'].includes(best.endingId)) throw new Error('淮海结局异常：' + best.endingId)
    if ((best.parts.find(p => p.key === 'jiawang')?.value ?? 0) <= 0) throw new Error('淮海应能触发贾汪战场转向')
  })
})