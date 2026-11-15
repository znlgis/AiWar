import { describe, expect, it } from 'vitest'
import { createOpsState, registerRules, resolveOpsNode } from '@aiwar/sim'
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

const CASES = [
  ['sidu', siduCampaign, siduRules],
  ['chibi', chibiCampaign, chibiRules],
  ['feishui', feishuiCampaign, feishuiRules],
  ['huaihai', huaihaiCampaign, huaihaiRules],
] as const

/** 决策后必须留下可观测后果：旗标、变量、城邑、部队或军令任一变化即可 */
function fingerprint(state: any): string {
  const armies = Object.values(state.armies as Record<string, any>).map(a =>
    [a.id, Math.round(a.troops), Math.round(a.morale), Math.round(a.fatigue), Math.round(a.foodDays),
      a.order ? a.order.task + '@' + (a.order.target ?? '') : '-'].join(':')).join('|')
  return JSON.stringify({
    flags: state.flags, vars: state.vars,
    cities: Object.values(state.cities as Record<string, any>).map((c: any) => [c.id, c.owner, Math.round(c.garrison), Math.round(c.grain)]),
    armies,
  })
}

describe('每个决策选项都必须有可观测后果', () => {
  for (const [name, campaign, rules] of CASES) {
    it(name + ' 没有空选项', () => {
      const empty: string[] = []
      const state = createOpsState(campaign, 'normal', 1)
      const seen = new Set<string>()
      void state
      for (const node of campaign.decisions) {
        for (const option of node.options) {
          // 每个选项用一份独立的新局面，避免前序效果污染判定
          const fresh = createOpsState(campaign, 'normal', 1)
          const before = fingerprint(fresh)
          resolveOpsNode(fresh, campaign, narrative, rules, node.id, option.id)
          const after = fingerprint(fresh)
          if (before === after) empty.push(node.id + '/' + option.id + ' ' + option.label)
        }
        seen.add(node.id)
      }
      if (empty.length > 0) {
        console.log(name, '空选项:', empty.join(' ; '))
      }
      expect(empty, name + ' 存在空选项（选了等于没选）：\n' + empty.join('\n')).toEqual([])
    })
  }
})
