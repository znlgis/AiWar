import type {
  OpsCampaign, OpsNarrative, OpsRules, OpsScore, OpsState, OpsArmyState, ScorePart,
} from '@aiwar/sim'
import { armiesOf, addReport, shortestRoute, clamp, damageArmy } from '@aiwar/sim'

function army(state: OpsState, id: string): OpsArmyState | undefined { return state.armies[id] }
function dist(state: OpsState, a: string, b: string): number { return shortestRoute(state.roads, a, b).length }
function moveToward(state: OpsState, a: OpsArmyState, target: string): void {
  if (a.pos.kind === 'city' && a.pos.city === target) return
  a.order = { task: 'march', target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
  a.route = []
}
function alliedArmies(state: OpsState): OpsArmyState[] {
  return armiesOf(state, 'sun').concat(armiesOf(state, 'shu'))
}
function alliedTroops(state: OpsState): number {
  return alliedArmies(state).reduce((s, a) => s + a.troops, 0)
}
function at(state: OpsState, faction: string, city: string): boolean {
  return armiesOf(state, faction).some(a => a.pos.kind === 'city' && a.pos.city === city)
}

const WIND_CYCLE = [0, 0, 1, 0, 1, 1, 0]

const rules: OpsRules = {
  id: 'chibi-208',

  opening(state, campaign, narrative): void {
    addReport(state, 'court', '柴桑', '建安十三年冬，曹操挟荆州新降之众顺江东下；孙刘结盟于柴桑，联军约五万，北岸曹军号称八十万。', 'high', 0, true)
    addReport(state, 'scout', '乌林', '情报：曹军水陆并进，战船相连，营寨绵延；军中已有疾疫。号称八十万，实数不详。', 'mid', 1, true)
    addReport(state, 'envoy', '柴桑', '鲁肃、诸葛亮往来奔走，孙刘联盟已成。周瑜部水军待发。', 'high', 0, false)
  },

  triggerNode(state, campaign): string | null {
    const has = (id: string) => state.resolvedNodes.includes(id)
    const day = state.tick
    if (!has('d1') && day >= 2) return 'd1'
    if (!has('d2') && day >= 5) return 'd2'
    if (!has('d3') && (day >= 9 || at(state, 'sun', 'chibi'))) return 'd3'
    if (!has('d4') && (day >= 12 || state.vars.chibiBattle)) return 'd4'
    if (!has('d5') && (day >= 16 || state.vars.fireReady)) return 'd5'
    if (!has('d6') && (state.vars.caoBurn || day >= 24)) return 'd6'
    if (!has('d7') && day >= 30) return 'd7'
    return null
  },

  applyDecision(state, campaign, narrative, nodeId, optionId): void {
    switch (nodeId) {
      case 'd1':
        if (optionId === 'opt1') {
          state.flags.alliance = 1
          addReport(state, 'envoy', '柴桑', '孙刘联盟达成，共抗曹操。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.surrender = 1
        }
        break
      case 'd2':
        if (optionId === 'opt1') {
          state.flags.war = 1
          for (const a of armiesOf(state, 'sun')) { a.morale = clamp(a.morale + 4, 5, 100) }
          addReport(state, 'court', '柴桑', '东吴决定主战，周瑜、程普率军西进。', 'high', 0, true)
          for (const a of armiesOf(state, 'sun')) moveToward(state, a, 'chibi')
        } else if (optionId === 'opt2') {
          state.flags.surrender = 1
          addReport(state, 'court', '柴桑', '东吴决定主降，战事未开。', 'low', 0, true)
        }
        break
      case 'd3':
        if (optionId === 'opt1') {
          state.vars.atChibi = 1
          for (const a of alliedArmies(state)) moveToward(state, a, 'chibi')
          addReport(state, 'court', '赤壁', '联军在赤壁—乌林江面列阵。', 'high', 0, true)
        } else if (optionId === 'opt4') {
          state.vars.raidSupply = 1
          addReport(state, 'court', '军前', '分兵袭扰曹军粮道。', 'mid', 0, true)
        }
        break
      case 'd4':
        if (optionId === 'opt1') {
          state.vars.firePlan = 1
          addReport(state, 'court', '军前', '黄盖诈降，火船准备就绪。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.navalBattle = 1
          addReport(state, 'court', '赤壁', '放弃火攻，以水军正面迎战。', 'mid', 0, true)
        }
        break
      case 'd5':
        if (optionId === 'opt1') {
          state.vars.waitWind = 1
          addReport(state, 'court', '赤壁', '等东南风起，再行火攻。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.instantAttack = 1
          addReport(state, 'court', '赤壁', '不等风向，立即出击。', 'mid', 0, true)
        }
        break
      case 'd6':
        if (optionId === 'opt1') {
          state.flags.pursueCao = 1
          for (const a of alliedArmies(state)) moveToward(state, a, 'huarong')
          addReport(state, 'court', '乌林', '联军追击曹军，直指华容道。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.flags.takeNan = 1
          for (const a of alliedArmies(state)) moveToward(state, a, 'jiangling')
          addReport(state, 'court', '江陵', '联军转向江陵（南郡）。', 'high', 0, true)
        }
        break
      case 'd7':
        if (optionId === 'opt1') {
          state.flags.shareJing = 1
          addReport(state, 'court', '江陵', '荆州由孙刘共治。', 'high', 0, true)
        }
        break
      default:
        break
    }
    void narrative
  },

  aiTick(state, campaign, narrative): void {
    // 曹军 AI：水师与主力在乌林待机，后队自襄阳南调
    if (state.tick % 2 !== 0) return
    const cao = army(state, 'cao-main')
    const navy = army(state, 'cao-navy')
    const rear = army(state, 'cao-rear')
    if (cao && navy && state.tick > 6 && state.tick <= 12) {
      const shift = Math.min(8000, rear?.troops ?? 0)
      if (rear && shift > 0) { rear.troops -= shift; cao.troops += shift }
    }
    // 曹军前锋自北岸乌林沿江向东南压迫，试探南岸赤壁（乌林在赤壁西北，江段西南—东北流向）
    if (cao && !cao.removed && state.tick > 8 && state.tick < 20) {
      if (cao.pos.kind === 'city' && cao.pos.city === 'wulin') moveToward(state, cao, 'chibi')
    }
    // 赤壁初战：联军与曹军接触，曹军小败
    if (!state.vars.chibiBattle && at(state, 'sun', 'chibi') && cao && cao.pos.kind === 'city' && dist(state, cao.pos.city, 'chibi') <= 1) {
      state.vars.chibiBattle = 1
      if (navy) { damageArmy(navy, 0.08, state); navy.morale = clamp(navy.morale - 6, 5, 100) }
      addReport(state, 'border', '赤壁', '赤壁初战，曹军水师小败，退驻乌林，战船相连。', 'high', 0, true)
    }
    // 风向判定
    const wind = WIND_CYCLE[state.tick % WIND_CYCLE.length]
    state.vars.wind = wind
    // 风向窗口只来一次：火攻失手后曹军加强戒备，不再给第二次机会
    if (state.vars.firePlan && state.vars.waitWind && wind === 1 && !state.vars.caoBurn && !state.vars.fireFail) {
      // 火攻成功率：史实窗口宽松，高难度下风向、曹军戒备都更难对付
      // 哈希打散，保证不同 seed / tick 上的判定均匀分布
      const roll = (Math.imul(state.seed ^ (state.tick * 2654435761), 2246822519) >>> 0) % 100 / 100
      const fireChance = state.difficulty === 'hell' ? 0.55 : state.difficulty === 'hard' ? 0.68 : state.difficulty === 'normal' ? 0.8 : 0.92
      if (roll < fireChance) {
        state.vars.caoBurn = 1
        for (const id of ['cao-navy', 'cao-main']) {
          const a = army(state, id)
          if (!a || a.removed) continue
          damageArmy(a, 0.4, state)
          a.morale = clamp(a.morale - 35, 5, 100)
        }
        addReport(state, 'border', '乌林', '东南风起，黄盖火船突入曹军连环船阵，火势蔓延，曹军水师大溃。', 'high', 1, true)
        addReport(state, 'deserter', '乌林', '曹军烧余船退走，沿华容道向西撤退。', 'high', 1, true)
      } else {
        state.vars.fireFail = 1
        addReport(state, 'border', '乌林', '火攻失手，曹军已有防备，联军水师退却。', 'mid', 1, true)
      }
    }
    void narrative
    void rear
  },

  checkEnd(state, campaign): void {
    if (state.over) return
    if (state.flags.surrender) { end(state, 'surrender'); return }
    const caoMain = state.armies['cao-main']
    const caoNavy = state.armies['cao-navy']
    const caoBroken = (!caoMain || caoMain.removed || caoMain.troops < 30000) && (!caoNavy || caoNavy.removed || caoNavy.troops < 20000)
    if (caoBroken) { end(state, 'great'); return }
    if (state.vars.caoBurn && state.tick >= 26) { end(state, 'victory'); return }
    if (alliedTroops(state) < 15000) { end(state, 'rout'); return }
    if (state.tick >= 60) end(state, state.vars.caoBurn ? 'victory' : 'stalemate')
  },

  score(state, campaign): OpsScore {
    const burned = state.vars.caoBurn === 1
    const caoMain = state.armies['cao-main']
    const caoNavy = state.armies['cao-navy']
    const killed = (caoMain ? Math.max(0, (campaign.armies.find(a => a.id === 'cao-main')?.troops ?? 0) - caoMain.troops) : 0)
      + (caoNavy ? Math.max(0, (campaign.armies.find(a => a.id === 'cao-navy')?.troops ?? 0) - caoNavy.troops) : 0)
    const saved = Math.min(1, alliedTroops(state) / 50000)
    const parts: ScorePart[] = [
      { key: 'fire', label: '火攻破敌', value: burned ? 30 : state.vars.fireFail ? 6 : 4, max: 30, note: burned ? '乌林火攻成功' : state.vars.fireFail ? '火攻失手' : '火攻未行' },
      { key: 'enemy', label: '曹军折损', value: Math.round(clamp(killed / 90000, 0, 1) * 20), max: 20, note: '约 ' + Math.round(killed / 10000) + ' 万' },
      { key: 'saved', label: '联军保存', value: Math.round(saved * 20), max: 20, note: '保存约 ' + Math.round(saved * 100) + '%' },
      { key: 'alliance', label: '联盟与外交', value: state.flags.alliance ? 10 : 3, max: 10, note: state.flags.alliance ? '孙刘联盟' : '未结盟' },
      { key: 'jing', label: '荆州归属', value: state.flags.shareJing ? 10 : state.flags.takeNan ? 8 : 3, max: 10, note: state.flags.shareJing ? '共治荆州' : state.flags.takeNan ? '取南郡' : '未定' },
      { key: 'time', label: '战役节奏', value: state.tick < 40 ? 5 : 2, max: 5, note: '历 ' + state.tick + ' 日' },
    ]
    const raw = parts.reduce((s, p) => s + p.value, 0)
    const total = Math.min(100, Math.round(raw * campaign.difficulty[state.difficulty].scoreFactor))
    const grade: OpsScore['grade'] = total >= 75 ? 'S' : total >= 66 ? 'A' : total >= 54 ? 'B' : total >= 40 ? 'C' : 'D'
    const endings: Record<string, { title: string; text: string }> = {
      great: { title: '赤壁大捷', text: '曹军主力与水师覆灭，曹操北归。长江以南格局就此奠定。' },
      victory: { title: '乌林火攻', text: '火攻得手，曹军溃退。孙刘联军以少胜多，守住江东。' },
      surrender: { title: '降曹', text: '东吴未战而降，战事未开。历史走向了另一条路。' },
      rout: { title: '联军溃败', text: '联军水师受挫，曹军突破长江。江南震动。' },
      stalemate: { title: '对峙', text: '双方隔江相持，赤壁火攻未成，战役在僵持中结束。' },
    }
    const ending = endings[state.endingId ?? 'stalemate'] ?? endings.stalemate
    return {
      grade, total, parts, endingId: state.endingId ?? 'stalemate',
      endingTitle: ending.title, endingText: ending.text,
      deviation: burned ? '火攻成功，与史实主线相近。' : '火攻未成或未行，与史实不同。',
      highlights: [
        { label: '火攻', value: burned ? '成功' : state.vars.fireFail ? '失败' : '未行' },
        { label: '曹军折损', value: '约 ' + Math.round(killed / 10000) + ' 万' },
        { label: '联军保存', value: Math.round(saved * 100) + '%' },
        { label: '历时', value: state.tick + ' 日' },
      ],
      lines: dedupe(state.log).slice(-10),
    }
  },

  hud(state, campaign): { pressureText: string; objectiveText: string; stageText: string } {
    const fire = state.vars.caoBurn ? '曹军已溃' : state.vars.firePlan ? '火攻待风' : '隔江对峙'
    return {
      pressureText: fire,
      objectiveText: at(state, 'sun', 'chibi') ? '赤壁在我' : '赤壁未控',
      stageText: state.tick < 10 ? '结盟与进军' : state.tick < 22 ? '决战' : '追击与善后',
    }
  },
}

function dedupe(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) if (out[out.length - 1] !== line) out.push(line)
  return out
}
function end(state: OpsState, id: string): void { state.over = true; state.endingId = id }

export default rules
export { rules as chibiRules }
