import { it } from 'vitest'
import { advanceOpsDay, createOpsState, registerRules, resolveOpsNode } from '@aiwar/sim'
import { huaihaiCampaign } from '../src/ops/huaihai/data.js'
import huaihaiRules from '../src/ops/huaihai/rules.js'
import { makeOpsNarrator } from '../src/ops/narrator.js'

registerRules(huaihaiRules)
const narrative = makeOpsNarrator()
const PICKS: Record<string, string> = { d1: 'opt2', d2: 'opt1', d3: 'opt1', d4: 'opt1', d5: 'opt1', d6: 'opt1', d7: 'opt1', d8: 'opt1' }
const loc = (st: any, a: any) => a.pos.kind === 'city' ? a.pos.city : 'road:' + a.pos.from + '>' + a.pos.to + '@' + (a.pos.progress ?? 0).toFixed(1)

it('huaihai state', () => {
  const st = createOpsState(huaihaiCampaign, 'normal', 1)
  huaihaiRules.opening(st, huaihaiCampaign, narrative)
  for (let i = 0; i < 50; i++) {
    if (st.over) break
    const r = advanceOpsDay(st, huaihaiCampaign, narrative, huaihaiRules)
    if (r.pendingNode) { resolveOpsNode(st, huaihaiCampaign, narrative, huaihaiRules, r.pendingNode, PICKS[r.pendingNode] ?? 'opt1') }
    if (st.tick >= 6 && st.tick <= 30 && st.tick % 2 === 0) {
      const kmt = ['kmt-2', 'kmt-13', 'kmt-16'].map(id => st.armies[id]).filter(Boolean).map((a: any) => a.name + '@' + loc(st, a))
      const pla = ['pl-e', 'pl-e2', 'pl-c', 'pl-l'].map(id => st.armies[id]).filter(Boolean).map((a: any) => a.name + '@' + loc(st, a))
      console.log('T' + st.tick, 'retreat', st.vars.xuzhouRetreat, 'enc7', st.vars.encircled7, 'encChen', st.vars.encircledChen, 'KMT', kmt.join(','), 'PLA', pla.join(','))
    }
  }
})
