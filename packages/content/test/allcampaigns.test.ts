import { it, expect } from 'vitest'
import { advanceOpsDay, createOpsState, registerRules, resolveOpsNode } from '@aiwar/sim'
import { siduCampaign } from '../src/ops/siduchishui/data.js'
import siduRules from '../src/ops/siduchishui/rules.js'
import { huaihaiCampaign } from '../src/ops/huaihai/data.js'
import huaihaiRules from '../src/ops/huaihai/rules.js'
import { feishuiCampaign } from '../src/ops/feishui/data.js'
import feishuiRules from '../src/ops/feishui/rules.js'
import { chibiCampaign } from '../src/ops/chibi/data.js'
import chibiRules from '../src/ops/chibi/rules.js'
import { makeOpsNarrator } from '../src/ops/narrator.js'

registerRules(siduRules)
registerRules(huaihaiRules)
registerRules(feishuiRules)
registerRules(chibiRules)
const narrative = makeOpsNarrator()

function run(campaign: any, rules: any, seed: number) {
  const st = createOpsState(campaign, 'normal', seed)
  rules.opening(st, campaign, narrative)
  let decisions = 0
  for (let i = 0; i < 120; i++) {
    if (st.over) break
    const r = advanceOpsDay(st, campaign, narrative, rules)
    if (r.pendingNode) { resolveOpsNode(st, campaign, narrative, rules, r.pendingNode, 'opt1'); decisions++ }
  }
  return { st, score: rules.score(st, campaign), decisions }
}

it('all ops campaigns run', () => {
  for (const [name, campaign, rules] of [
    ['sidu', siduCampaign, siduRules],
    ['huaihai', huaihaiCampaign, huaihaiRules],
    ['feishui', feishuiCampaign, feishuiRules],
    ['chibi', chibiCampaign, chibiRules],
  ] as const) {
    const { st, score, decisions } = run(campaign, rules, 1)
    console.log(name, '->', score.endingId, score.grade, score.total, 'tick', st.tick, 'decisions', decisions,
      'cas', JSON.stringify(st.casualties))
    expect(st.tick).toBeGreaterThan(3)
    expect(decisions).toBeGreaterThan(2)
  }
})