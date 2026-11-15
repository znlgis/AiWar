import { describe, expect, it } from 'vitest'
import { advanceOpsDay, createOpsState, isHostile } from '@aiwar/sim'
import { chibiCampaign } from '../src/ops/chibi/data.js'
import chibiRules from '../src/ops/chibi/rules.js'
import { huaihaiCampaign } from '../src/ops/huaihai/data.js'
import huaihaiRules from '../src/ops/huaihai/rules.js'
import { makeOpsNarrator } from '../src/ops/narrator.js'

const narrative = makeOpsNarrator()

describe('敌我判定与开局补给', () => {
  it('盟友不算敌人：只有战役声明的敌对阵营才交战', () => {
    // 契约 campaign.enemyFactions 曾经完全没被引擎读取，敌我二分靠「不是我方即敌方」，
    // 于是赤壁的刘备军（shu）驻在孙权的樊口，开局第一天就和自己人打起来。
    expect(isHostile(chibiCampaign, 'sun', 'cao')).toBe(true)
    expect(isHostile(chibiCampaign, 'cao', 'sun')).toBe(true)
    expect(isHostile(chibiCampaign, 'sun', 'shu')).toBe(false)
    expect(isHostile(chibiCampaign, 'shu', 'cao')).toBe(true)
    expect(isHostile(chibiCampaign, 'sun', 'sun')).toBe(false)
  })

  it('赤壁开局二十日不出现友军互殴', () => {
    const st = createOpsState(chibiCampaign, 'normal', 1)
    chibiRules.opening(st, chibiCampaign, narrative)
    for (let i = 0; i < 20 && !st.over; i++) advanceOpsDay(st, chibiCampaign, narrative, chibiRules)
    // 刘备一系不是敌军：它若有伤亡，只可能是被误判成敌人
    expect(st.casualties.shu ?? 0).toBe(0)
    expect(st.armies['shu-main']?.removed).toBeFalsy()
  })

  it('淮海支前运力即粮道：我军不占城也不会全军断粮', () => {
    // 本役 26 座城邑开局全在对方手里，引擎按「有己方城邑才不饿」会把全军判成断粮
    const st = createOpsState(huaihaiCampaign, 'normal', 1)
    huaihaiRules.opening(st, huaihaiCampaign, narrative)
    for (let i = 0; i < 10; i++) advanceOpsDay(st, huaihaiCampaign, narrative, huaihaiRules)
    const owned = Object.values(st.cities).filter(c => c.owner === 'pla').length
    expect(owned).toBe(0)
    const starving = st.armyOrder
      .map(id => st.armies[id])
      .filter(a => a && !a.removed && a.faction === 'pla' && a.supply === 'cut')
    expect(starving.length).toBe(0)
  })
})
