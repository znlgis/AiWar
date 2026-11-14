import { it } from 'vitest'
import { advanceOpsDay, createOpsState, registerRules, resolveOpsNode } from '@aiwar/sim'
import { huaihaiCampaign } from '../src/ops/huaihai/data.js'
import huaihaiRules from '../src/ops/huaihai/rules.js'
import { makeOpsNarrator } from '../src/ops/narrator.js'

registerRules(huaihaiRules)
const narrative = makeOpsNarrator()
const PICKS: Record<string, string> = { d1: 'opt2', d2: 'opt1', d3: 'opt1', d4: 'opt1', d5: 'opt1', d6: 'opt1', d7: 'opt1', d8: 'opt1' }

it('huaihai historical', () => {
  const st = createOpsState(huaihaiCampaign, 'normal', 1)
  huaihaiRules.opening(st, huaihaiCampaign, narrative)
  for (let i = 0; i < 120; i++) {
    if (st.over) break
    const r = advanceOpsDay(st, huaihaiCampaign, narrative, huaihaiRules)
    if (r.pendingNode) { resolveOpsNode(st, huaihaiCampaign, narrative, huaihaiRules, r.pendingNode, PICKS[r.pendingNode] ?? 'opt1'); console.log('node', r.pendingNode, 'T' + st.tick) }
    if (st.tick % 10 === 0) {
      const pla = Object.values(st.armies).filter(a => a.faction === 'pla' && !a.removed)
      const kmt = Object.values(st.armies).filter(a => a.faction === 'kmt' && !a.removed)
      console.log('T' + st.tick, 'PLA', pla.reduce((s, a) => s + a.troops, 0), 'KMT', kmt.map(a => a.name + ':' + a.troops + '@' + (a.pos.kind === 'city' ? a.pos.city : 'road')).join(','), 'end', st.endingId)
    }
  }
  const score = huaihaiRules.score(st, huaihaiCampaign)
  console.log('END', score.endingId, score.grade, score.total, 'tick', st.tick, JSON.stringify(score.parts.map(p => p.key + ':' + p.value)))
})
