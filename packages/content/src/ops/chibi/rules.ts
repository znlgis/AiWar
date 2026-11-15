import type {
  OpsCampaign, OpsNarrative, OpsRules, OpsScore, OpsState, OpsArmyState, ScorePart, SourceId,
} from '@aiwar/sim'
import { armiesOf, addReport, shortestRoute, clamp, damageArmy, say } from '@aiwar/sim'
import { makeOpsNarrator } from '../narrator.js'
import { CHIBI_CORPUS } from './corpus.js'

// packs.ts 给所有 ops 战役发的是同一条通用 narrator。本战役语料有近一百八十条，
// 若全走通用池等于白写；这里在 rules 内部再包一层，本文件发出的战报一律带赤壁口吻。
// 引擎各处照旧用调用方传进来的 narrative，行为不受影响。
const voiced = makeOpsNarrator(CHIBI_CORPUS)

// 东南风只在这几日出现（档案：十一月间偶有东南风）。错过就要等下一个窗口，
// 而两次窗口之间的曹军仍在疫病里减员——「等」本身是有代价也有收益的选择。
const WIND_WINDOWS = [18, 22, 27, 33]

// 曹军水师的连环：赤壁初战后连舟，既是曹军的稳，也是火攻的引线。
const CHAIN_DAY = 11

function army(state: OpsState, id: string): OpsArmyState | undefined { return state.armies[id] }
function dist(state: OpsState, a: string, b: string): number { return shortestRoute(state.roads, a, b).length }
function moveToward(state: OpsState, a: OpsArmyState, target: string): void {
  if (a.pos.kind === 'city' && a.pos.city === target) return
  a.order = { task: 'march', target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
  a.route = []
}
function holdAt(state: OpsState, a: OpsArmyState): void {
  a.order = { task: 'hold', target: undefined, sinceTick: state.tick, arrived: true, waitTicks: 0 }
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
/** 战报统一走带语料的 narrator；没注册的 key 会自动落回 fallbackText，不会出现空行 */
function report(
  state: OpsState, source: SourceId, place: string, key: string,
  params: Record<string, string> = {}, important = true, delay = 0,
): void {
  say(state, voiced, source, place, key, params, important ? 'high' : 'mid', delay, important)
}

// ---------- 战役特色机制 ----------

/** 军中疾疫：曹营逐日减员、士气下沉。史书里曹军的损失主要来自这里，火攻只是收尾。 */
function plagueTick(state: OpsState): void {
  if (state.tick < 4 || state.tick > 40) return
  // 疫气在冬季营中越积越重：每过九日加一档，玩家若拖延，曹军反而更虚
  const level = Math.min(4, 1 + Math.floor((state.tick - 4) / 9))
  state.vars.plague = level
  const ratio = 0.0035 + level * 0.0008
  for (const id of ['cao-main', 'cao-navy', 'cao-cai']) {
    const a = army(state, id)
    if (!a || a.removed) continue
    damageArmy(a, ratio, state)
    a.morale = clamp(a.morale - 0.7, 5, 100)
  }
  if (state.tick % 6 === 0) report(state, 'scout', '乌林', 'chibi.plague', {}, true, 1)
  // 疫病之外还有逃亡：荆人不愿南征，曹军水师中的逃者日众
  if (level >= 3 && state.tick % 9 === 0) report(state, 'deserter', '乌林', 'chibi.defect_sailors', {}, false, 1)
}

/** 风向窗口：只有窗口日才有东南风，且地狱难度下第一个窗口「看走了眼」，须再等。 */
function windTick(state: OpsState): void {
  const isWindow = WIND_WINDOWS.includes(state.tick)
  // 地狱难度：情报含混、风向难测，首个窗口判错（当作没风），只能等下一个
  const missed = state.difficulty === 'hell' && state.tick === WIND_WINDOWS[0]
  state.vars.wind = isWindow && !missed ? 1 : 0
  if (state.vars.wind === 1 && state.vars.windSeen !== state.tick) {
    state.vars.windSeen = state.tick
    report(state, 'scout', '赤壁', 'chibi.wind', {}, true, 0)
  }
}

/** 连环船：赤壁初战之后曹军以铁环连舟，火攻因此有了蔓延的条件。 */
function chainTick(state: OpsState): void {
  if (state.vars.chained) return
  if (state.tick < CHAIN_DAY && !state.vars.chibiBattle) return
  state.vars.chained = 1
  report(state, 'scout', '乌林', 'chibi.chain', {}, true, 1)
}

/** 冬季江上的苦：一句物候，换一点士气与疲劳的说法，也提醒玩家速决。 */
function winterTick(state: OpsState): void {
  if (state.tick !== 8 && state.tick !== 20) return
  report(state, 'court', '江上', 'chibi.winter', {}, false, 0)
  for (const a of alliedArmies(state)) a.fatigue = clamp(a.fatigue + 1, 0, 100)
  for (const id of ['cao-main', 'cao-navy']) {
    const a = army(state, id)
    if (a && !a.removed) a.fatigue = clamp(a.fatigue + 2, 0, 100)
  }
}

/** 火攻判定。plan 为按计划等风，instant 为不等风硬打，retry 是错过窗口后的二次举火。 */
function fireAttempt(state: OpsState, mode: 'plan' | 'instant' | 'retry'): void {
  const diff = state.difficulty
  let chance = diff === 'hell' ? 0.55 : diff === 'hard' ? 0.68 : diff === 'normal' ? 0.8 : 0.92
  if (mode === 'instant') chance *= 0.45
  if (mode === 'retry') chance *= 0.62
  // 得荆州舟工为向导，火船才找得到敌阵的死角
  if (state.vars.guides) chance += 0.06
  chance = clamp(chance, 0.05, 0.95)
  // 哈希打散，保证不同 seed / tick 上的判定均匀分布
  const roll = (Math.imul(state.seed ^ (state.tick * 2654435761), 2246822519) >>> 0) % 100 / 100
  if (roll >= chance) {
    state.vars.fireFail = 1
    const fireBoat = army(state, 'sun-fire')
    if (fireBoat) { damageArmy(fireBoat, 0.18, state); fireBoat.morale = clamp(fireBoat.morale - 10, 5, 100) }
    for (const a of armiesOf(state, 'sun')) a.morale = clamp(a.morale - 6, 5, 100)
    report(state, 'border', '乌林', 'chibi.fire_miss', {}, true, 0)
    addReport(state, 'border', '乌林', '火攻失手，联军水师退却，曹军自此谨守，不复连舟夜宿。', 'mid', 0, true)
    return
  }
  // 连环之舟首尾相维：一舟起火则众舟俱焚，这是本战役火攻的主要杀伤来源
  const chainBonus = state.vars.chained ? 0.12 : 0
  const planBonus = state.vars.chainFire ? 0.08 : 0
  const navyLoss = clamp(0.4 + chainBonus + planBonus, 0, 0.72)
  const mainLoss = clamp(0.34 + chainBonus * 0.4, 0, 0.6)
  for (const id of ['cao-navy', 'cao-cai']) {
    const a = army(state, id)
    if (!a || a.removed) continue
    damageArmy(a, navyLoss, state)
    a.morale = clamp(a.morale - 35, 5, 100)
  }
  const main = army(state, 'cao-main')
  if (main && !main.removed) {
    damageArmy(main, mainLoss, state)
    main.morale = clamp(main.morale - 32, 5, 100)
  }
  // 二次举火只能得一半战果：分数上打了折，这是错过窗口的代价
  state.vars[mode === 'retry' ? 'caoBurnLate' : 'caoBurn'] = 1
  report(state, 'border', '乌林', 'chibi.pursue', {}, true, 1)
  addReport(state, 'border', '乌林',
    mode === 'retry'
      ? '东南风再起，火船突入曹军连环船阵。曹军已病困旬日，火发而众不能救，水师溃散。'
      : '东南风起，黄盖火船突入曹军连环船阵，火势蔓延，曹军水师大溃。',
    'high', 1, true)
  addReport(state, 'deserter', '乌林', '曹军烧余船退走，沿华容道向西撤退。', 'high', 1, true)
  // 曹军此后转入撤退：主力沿乌林—华容道西走，不再据守江面
  for (const id of ['cao-main', 'cao-navy', 'cao-cai']) {
    const a = army(state, id)
    if (a && !a.removed) moveToward(state, a, 'huarong')
  }
}

/** 火攻时机：必须在风向窗口、且已备火船。每天只判一次，免得一个窗口反复赌。 */
function fireTick(state: OpsState): void {
  if (state.vars.caoBurn || state.vars.caoBurnLate || state.vars.fireFail) return
  if (!state.vars.firePlan) return
  if (state.vars.wind !== 1) return
  if (state.vars.waitWind) { fireAttempt(state, state.vars.retryFire ? 'retry' : 'plan'); return }
  if (state.vars.instantAttack) fireAttempt(state, 'instant')
}

/** 追击：火攻得手且已受命追北，曹军在华容道上逐日折损。 */
function chaseTick(state: OpsState): void {
  if (!(state.vars.caoBurn || state.vars.caoBurnLate)) return
  if (!state.flags.pursueCao && !state.flags.splitForce) return
  if (state.tick % 2 !== 0) return
  const main = army(state, 'cao-main')
  if (main && !main.removed) {
    damageArmy(main, 0.03, state)
    main.foodDays = clamp(main.foodDays - 1, 0, 22)
    main.morale = clamp(main.morale - 2, 5, 100)
  }
  const navy = army(state, 'cao-navy')
  if (navy && !navy.removed) damageArmy(navy, 0.02, state)
  report(state, 'border', '华容道', 'chibi.huarong', {}, false, 1)
}

/** 袭粮道：不论哪条路线选的，只要旗标在，曹军转输就断一截。 */
function raidTick(state: OpsState): void {
  if (!state.vars.raidSupply) return
  if (state.tick % 3 !== 0) return
  const main = army(state, 'cao-main')
  if (main && !main.removed) {
    main.foodDays = clamp(main.foodDays - 2, 0, 22)
    main.morale = clamp(main.morale - 1, 5, 100)
    damageArmy(main, 0.006, state)
  }
  report(state, 'scout', '江北', 'chibi.raid', {}, false, 1)
}

/** 出下一个该决的节点。onTick 也要用它来发「军情急至」，所以抽成独立函数。 */
function nextNode(state: OpsState): string | null {
  const has = (id: string) => state.resolvedNodes.includes(id)
  const day = state.tick
  if (!has('d1') && day >= 2) return 'd1'
  if (!has('d2') && day >= 5) return 'd2'
  if (!has('d8') && day >= 7) return 'd8'
  if (!has('d3') && (day >= 9 || at(state, 'sun', 'chibi'))) return 'd3'
  if (!has('d4') && (day >= 12 || state.vars.chibiBattle)) return 'd4'
  if (!has('d9') && day >= 14) return 'd9'
  if (!has('d5') && (day >= 16 || state.vars.fireReady)) return 'd5'
  if (!has('d6') && (state.vars.caoBurn || state.vars.caoBurnLate || day >= 24)) return 'd6'
  if (!has('d7') && day >= 30) return 'd7'
  // 疫起只在火攻未成时出现：这一支是「错过窗口之后的第二次机会」
  if (!has('d10') && !state.vars.caoBurn && !state.vars.caoBurnLate && day >= 20) return 'd10'
  return null
}

const rules: OpsRules = {
  id: 'chibi-208',

  opening(state, campaign, narrative): void {
    void campaign
    void narrative
    report(state, 'court', '柴桑', 'opening.situation', {}, true, 0)
    addReport(state, 'court', '柴桑', '建安十三年冬，曹操挟荆州新降之众顺江东下；孙刘结盟于柴桑，联军约五万，北岸曹军号称八十万。', 'high', 0, true)
    addReport(state, 'scout', '乌林', '情报：曹军水陆并进，战船相连，营寨绵延；军中已有疾疫。号称八十万，实数不详。', 'mid', 1, true)
    addReport(state, 'envoy', '柴桑', '鲁肃、诸葛亮往来奔走，孙刘联盟已成。周瑜部水军待发。', 'high', 0, false)
  },

  triggerNode(state, campaign): string | null {
    void campaign
    return nextNode(state)
  },

  applyDecision(state, campaign, narrative, nodeId, optionId): void {
    void campaign
    void narrative
    switch (nodeId) {
      case 'd1':
        if (optionId === 'opt1') {
          state.flags.alliance = 1
          for (const a of alliedArmies(state)) a.morale = clamp(a.morale + 4, 5, 100)
          report(state, 'envoy', '柴桑', 'chibi.alliance', {}, true, 0)
          addReport(state, 'envoy', '柴桑', '孙刘联盟达成，共抗曹操。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          // 南走苍梧：放弃荆州，刘备部退往荆南，士气大挫
          state.flags.abandonJing = 1
          state.vars.retreatSouth = 1
          for (const a of armiesOf(state, 'shu')) {
            a.morale = clamp(a.morale - 6, 5, 100)
            moveToward(state, a, 'baling')
          }
          addReport(state, 'court', '当阳', '弃荆州而南走苍梧，部曲离散，粮道愈远。', 'mid', 1, true)
        } else if (optionId === 'opt3') {
          state.flags.surrender = 1
          addReport(state, 'court', '当阳', '刘备请降于曹，战事未开。', 'low', 0, true)
        } else if (optionId === 'opt4') {
          // 退守江夏：依附刘琦，保江夏与夏口，但江东之援未必来
          state.flags.guardXiakou = 1
          state.vars.guardXiakou = 1
          const xiakou = state.cities.xiakou
          if (xiakou) xiakou.garrison = Math.round(xiakou.garrison + 1500)
          for (const a of armiesOf(state, 'shu')) moveToward(state, a, 'xiakou')
          for (const a of armiesOf(state, 'shu')) a.morale = clamp(a.morale + 2, 5, 100)
          addReport(state, 'court', '夏口', '刘备退守江夏，与刘琦合兵，据夏口以观变。', 'mid', 0, true)
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
        } else if (optionId === 'opt3') {
          // 观望：不动兵，只让军队休整，等局势明朗
          state.vars.hesitate = 1
          for (const a of armiesOf(state, 'sun')) {
            a.morale = clamp(a.morale - 3, 5, 100)
            a.fatigue = clamp(a.fatigue - 5, 0, 100)
            holdAt(state, a)
          }
          addReport(state, 'court', '柴桑', '东吴持两端之议，按兵不动，诸将各守本屯。', 'mid', 1, true)
        } else if (optionId === 'opt4') {
          // 迁治鄂县：把江东腹地的守备抽到江上，秣陵空虚
          state.vars.moveCapital = 1
          const jianye = state.cities.jianye
          const chaisang = state.cities.chaisang
          if (jianye) jianye.garrison = Math.max(0, jianye.garrison - 4000)
          if (chaisang) chaisang.garrison = Math.round(chaisang.garrison + 4000)
          for (const a of armiesOf(state, 'sun')) {
            a.morale = clamp(a.morale - 2, 5, 100)
            moveToward(state, a, 'chaisang')
          }
          addReport(state, 'court', '柴桑', '吴侯移治鄂县，江东之众尽聚江上，后方遂虚。', 'mid', 1, true)
        }
        break
      case 'd3':
        if (optionId === 'opt1') {
          state.vars.atChibi = 1
          for (const a of alliedArmies(state)) moveToward(state, a, 'chibi')
          report(state, 'court', '赤壁', 'politics.ferry', {}, true, 0)
          addReport(state, 'court', '赤壁', '联军在赤壁—乌林江面列阵。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          // 退守夏口：城池与粮秣俱在，但江面让与曹军，决战之机后移
          state.vars.atXiakou = 1
          for (const a of alliedArmies(state)) moveToward(state, a, 'xiakou')
          const xiakou = state.cities.xiakou
          if (xiakou) xiakou.grain = Math.round(xiakou.grain + 6)
          addReport(state, 'court', '夏口', '联军退守夏口，以城池为凭，江面遂为曹军所有。', 'mid', 1, true)
        } else if (optionId === 'opt3') {
          // 退守柴桑：保存水军，拉长曹军补给线，但要放弃赤壁
          state.vars.atChaisang = 1
          for (const a of alliedArmies(state)) {
            moveToward(state, a, 'chaisang')
            a.fatigue = clamp(a.fatigue - 6, 0, 100)
          }
          addReport(state, 'court', '柴桑', '联军退保柴桑，水军得休，赤壁空而无人守。', 'mid', 1, true)
        } else if (optionId === 'opt4') {
          // 分兵袭扰：不打决战，只断粮道
          state.vars.raidSupply = 1
          report(state, 'scout', '江北', 'chibi.raid', {}, true, 0)
          report(state, 'court', '赤壁', 'politics.feint', { place: '乌林' }, false, 1)
          const boat = army(state, 'sun-fire')
          if (boat) boat.stealth = 0.65
          addReport(state, 'court', '军前', '分兵袭扰曹军粮道。', 'mid', 0, true)
        }
        break
      case 'd4':
        if (optionId === 'opt1') {
          state.vars.firePlan = 1
          state.vars.fireReady = 1
          const boat = army(state, 'sun-fire')
          if (boat) { moveToward(state, boat, 'chibi'); boat.stealth = 0.6 }
          report(state, 'court', '赤壁', 'chibi.fire_ready', {}, true, 0)
          addReport(state, 'court', '军前', '黄盖诈降，火船准备就绪。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          // 正面水战：凭水军硬拼，小胜而伤
          state.vars.navalBattle = 1
          state.vars.navalExchange = 1
          for (const a of alliedArmies(state)) a.morale = clamp(a.morale + 4, 5, 100)
          const sunMain = army(state, 'sun-main')
          if (sunMain) damageArmy(sunMain, 0.03, state)
          for (const id of ['cao-navy', 'cao-cai']) {
            const a = army(state, id)
            if (!a || a.removed) continue
            damageArmy(a, 0.05, state)
            a.morale = clamp(a.morale - 5, 5, 100)
          }
          addReport(state, 'court', '赤壁', '放弃火攻，以水军正面迎战，江面连日交锋。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          // 夜袭：小股轻舟，战果有限但要冒风险
          state.vars.nightRaid = 1
          const main = army(state, 'cao-main')
          if (main && !main.removed) { damageArmy(main, 0.012, state); main.morale = clamp(main.morale - 4, 5, 100) }
          for (const id of ['cao-navy', 'cao-cai']) {
            const a = army(state, id)
            if (!a || a.removed) continue
            damageArmy(a, 0.02, state)
            a.morale = clamp(a.morale - 5, 5, 100)
          }
          const boat = army(state, 'sun-fire')
          if (boat) { boat.fatigue = clamp(boat.fatigue + 8, 0, 100); boat.stealth = 0.7 }
          report(state, 'border', '乌林', 'chibi.night_raid', {}, true, 0)
        } else if (optionId === 'opt4') {
          // 坚守不战：营垒自固，等曹军粮尽疫盛
          state.vars.holdFast = 1
          for (const a of alliedArmies(state)) {
            a.fatigue = clamp(a.fatigue - 10, 0, 100)
            a.morale = clamp(a.morale + 3, 5, 100)
            holdAt(state, a)
          }
          const main = army(state, 'cao-main')
          if (main && !main.removed) { main.foodDays = clamp(main.foodDays - 2, 0, 22); main.morale = clamp(main.morale - 2, 5, 100) }
          state.vars.plague = clamp((state.vars.plague ?? 0) + 1, 0, 4)
          report(state, 'court', '赤壁', 'chibi.hold', {}, true, 0)
        }
        break
      case 'd5':
        if (optionId === 'opt1') {
          state.vars.waitWind = 1
          addReport(state, 'court', '赤壁', '等东南风起，再行火攻。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          // 不等风：火船逆风而发，多半反烧自己
          state.vars.instantAttack = 1
          const boat = army(state, 'sun-fire')
          if (boat) { boat.fatigue = clamp(boat.fatigue + 6, 0, 100); boat.morale = clamp(boat.morale + 3, 5, 100) }
          addReport(state, 'court', '赤壁', '不等风向，立即出击。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          // 改为夜袭：放弃火攻，用轻舟反复扰之
          state.vars.firePlan = 0
          state.vars.nightRaid2 = 1
          for (const id of ['cao-navy', 'cao-cai']) {
            const a = army(state, id)
            if (!a || a.removed) continue
            damageArmy(a, 0.025, state)
            a.morale = clamp(a.morale - 4, 5, 100)
          }
          for (const a of alliedArmies(state)) a.fatigue = clamp(a.fatigue + 5, 0, 100)
          report(state, 'border', '乌林', 'chibi.night_raid', {}, true, 0)
        } else if (optionId === 'opt4') {
          // 继续对峙：以逸待劳，等曹军自病自退
          state.vars.prolong = 1
          for (const a of alliedArmies(state)) {
            a.fatigue = clamp(a.fatigue - 8, 0, 100)
            a.morale = clamp(a.morale + 2, 5, 100)
            holdAt(state, a)
          }
          const main = army(state, 'cao-main')
          if (main && !main.removed) { main.foodDays = clamp(main.foodDays - 3, 0, 22); main.morale = clamp(main.morale - 2, 5, 100) }
          state.vars.plague = clamp((state.vars.plague ?? 0) + 1, 0, 4)
          report(state, 'court', '赤壁', 'chibi.hold', {}, true, 0)
        }
        break
      case 'd6':
        if (optionId === 'opt1') {
          state.flags.pursueCao = 1
          for (const a of alliedArmies(state)) moveToward(state, a, 'huarong')
          report(state, 'border', '华容道', 'chibi.pursue', {}, true, 0)
          report(state, 'scout', '华容道', 'politics.chase', {}, false, 1)
          addReport(state, 'court', '乌林', '联军追击曹军，直指华容道。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.flags.takeNan = 1
          for (const a of alliedArmies(state)) moveToward(state, a, 'jiangling')
          report(state, 'court', '江陵', 'river.cross', {}, false, 0)
          addReport(state, 'court', '江陵', '联军转向江陵（南郡）。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          // 分兵：一部分追，一部分取城，两处都不足
          state.flags.splitForce = 1
          for (const a of armiesOf(state, 'sun')) moveToward(state, a, 'huarong')
          for (const a of armiesOf(state, 'shu')) moveToward(state, a, 'jiangling')
          for (const a of alliedArmies(state)) a.morale = clamp(a.morale - 2, 5, 100)
          report(state, 'border', '华容道', 'chibi.pursue', {}, true, 0)
          addReport(state, 'court', '军前', '联军分兵：吴军追北，荆州之众取南郡。', 'mid', 0, true)
        } else if (optionId === 'opt4') {
          // 收兵回防：保存水军，放弃追北与南郡
          state.flags.recall = 1
          for (const a of alliedArmies(state)) {
            moveToward(state, a, 'chaisang')
            a.fatigue = clamp(a.fatigue - 6, 0, 100)
            a.morale = clamp(a.morale + 2, 5, 100)
          }
          report(state, 'court', '赤壁', 'chibi.hold', {}, false, 0)
          addReport(state, 'court', '赤壁', '联军收兵回防，江面之胜未能转为地之利。', 'mid', 0, true)
        }
        break
      case 'd7':
        if (optionId === 'opt1') {
          state.flags.shareJing = 1
          for (const id of ['changsha', 'wuling', 'guiyang', 'baling']) {
            const c = state.cities[id]
            if (c) c.owner = 'shu'
          }
          for (const a of armiesOf(state, 'shu')) a.morale = clamp(a.morale + 4, 5, 100)
          report(state, 'court', '江陵', 'chibi.jingnan', {}, true, 0)
          addReport(state, 'court', '江陵', '荆州由孙刘共治。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          // 东吴独占：实力增而联盟裂
          state.flags.sunJing = 1
          state.vars.allianceStrain = 1
          for (const id of ['changsha', 'guiyang', 'baling']) {
            const c = state.cities[id]
            if (c) c.owner = 'sun'
          }
          for (const a of armiesOf(state, 'shu')) a.morale = clamp(a.morale - 8, 5, 100)
          for (const a of armiesOf(state, 'sun')) a.morale = clamp(a.morale + 3, 5, 100)
          addReport(state, 'court', '江陵', '东吴独取荆南，刘备之众愤而离心。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          // 分荆州为三：互相牵制，处处薄
          state.flags.threeJing = 1
          state.vars.threeJing = 1
          const baling = state.cities.baling
          const changsha = state.cities.changsha
          const guiyang = state.cities.guiyang
          if (baling) baling.owner = 'shu'
          if (changsha) changsha.owner = 'sun'
          if (guiyang) guiyang.owner = 'cao'
          report(state, 'court', '江陵', 'chibi.jingnan', {}, true, 0)
          addReport(state, 'court', '江陵', '分荆州为三：吴取其东，刘取其西，桂阳仍属汉廷所署。', 'mid', 0, true)
        } else if (optionId === 'opt4') {
          // 交还朝廷：名义归汉，实权归曹，是一步政治姿态
          state.flags.toCourt = 1
          const baling = state.cities.baling
          if (baling) baling.owner = 'cao'
          for (const a of alliedArmies(state)) a.morale = clamp(a.morale - 3, 5, 100)
          const main = army(state, 'cao-main')
          if (main && !main.removed) main.morale = clamp(main.morale + 3, 5, 100)
          addReport(state, 'court', '江陵', '荆州名义上归朝廷，实则曹操得之；联军所得者，名而已。', 'mid', 0, true)
        }
        break
      case 'd8':
        if (optionId === 'opt1') {
          // 受其舟师、择舟工为向导：火攻的把握从此不同
          state.vars.guides = 1
          state.vars.acceptFleet = 1
          const boat = army(state, 'sun-fire')
          if (boat) boat.foodDays = clamp(boat.foodDays + 2, 0, 22)
          const navy = army(state, 'cao-navy')
          if (navy && !navy.removed) navy.morale = clamp(navy.morale - 5, 5, 100)
          report(state, 'envoy', '夏口', 'chibi.surrender_fleet', {}, true, 1)
          report(state, 'scout', '江上', 'chibi.guides', {}, false, 1)
        } else if (optionId === 'opt2') {
          // 尽释其众：荆人归心，但不能即用
          state.vars.releaseJing = 1
          for (const a of armiesOf(state, 'shu')) a.morale = clamp(a.morale + 4, 5, 100)
          for (const a of armiesOf(state, 'sun')) a.morale = clamp(a.morale + 2, 5, 100)
          const navy = army(state, 'cao-navy')
          if (navy && !navy.removed) damageArmy(navy, 0.02, state)
          report(state, 'envoy', '夏口', 'chibi.surrender_fleet', {}, false, 1)
        } else if (optionId === 'opt3') {
          // 收其舟、分其众：得船工，失荆人之望
          state.vars.absorbFleet = 1
          const sunMain = army(state, 'sun-main')
          if (sunMain) sunMain.troops += 2500
          const navy = army(state, 'cao-navy')
          if (navy && !navy.removed) navy.morale = clamp(navy.morale - 3, 5, 100)
          for (const a of armiesOf(state, 'shu')) a.morale = clamp(a.morale - 2, 5, 100)
          report(state, 'envoy', '夏口', 'chibi.surrender_fleet', {}, false, 1)
        } else if (optionId === 'opt4') {
          // 焚其舟：不留敌资，也断了招降之路
          state.vars.burnFleet = 1
          const navy = army(state, 'cao-navy')
          if (navy && !navy.removed) navy.morale = clamp(navy.morale + 3, 5, 100)
          for (const a of armiesOf(state, 'sun')) a.morale = clamp(a.morale - 2, 5, 100)
          addReport(state, 'court', '夏口', '尽焚所得之舟，江上烟蔽三日；荆人闻之，不复来附。', 'mid', 1, true)
        }
        break
      case 'd9':
        if (optionId === 'opt1') {
          state.vars.chainFire = 1
          state.vars.firePlan = 1
          state.vars.fireReady = 1
          const boat = army(state, 'sun-fire')
          if (boat) { moveToward(state, boat, 'chibi'); boat.stealth = 0.62 }
          report(state, 'court', '赤壁', 'chibi.fire_ready', {}, true, 0)
          addReport(state, 'court', '赤壁', '以火船专攻其连环：一舟焚则众舟俱焚。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          // 断其缆：解其连环，此后火攻之利减，但曹军水师自乱
          state.vars.unchain = 1
          state.vars.chained = 0
          for (const id of ['cao-navy', 'cao-cai']) {
            const a = army(state, id)
            if (!a || a.removed) continue
            damageArmy(a, 0.04, state)
            a.morale = clamp(a.morale - 4, 5, 100)
          }
          for (const a of armiesOf(state, 'sun')) a.morale = clamp(a.morale + 3, 5, 100)
          report(state, 'scout', '乌林', 'chibi.chain', {}, false, 0)
          addReport(state, 'court', '乌林', '夜遣善水者断其巨缆，敌舟散泊，连环之势解。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.raidSupply = 1
          const main = army(state, 'cao-main')
          if (main && !main.removed) main.foodDays = clamp(main.foodDays - 4, 0, 22)
          report(state, 'scout', '江北', 'chibi.raid', {}, true, 0)
          addReport(state, 'court', '军前', '不攻其舟而先绝其食，轻舟往来于江北。', 'mid', 0, true)
        } else if (optionId === 'opt4') {
          state.vars.sabotage = 1
          const main = army(state, 'cao-main')
          if (main && !main.removed) { damageArmy(main, 0.012, state); main.morale = clamp(main.morale - 3, 5, 100) }
          const navy = army(state, 'cao-navy')
          if (navy && !navy.removed) navy.morale = clamp(navy.morale - 5, 5, 100)
          report(state, 'border', '乌林', 'chibi.night_raid', {}, true, 1)
        }
        break
      case 'd10':
        if (optionId === 'opt1') {
          // 二次举火：错过窗口后的第二次机会，战果打折
          state.vars.retryFire = 1
          state.vars.fireFail = 0
          state.vars.firePlan = 1
          const boat = army(state, 'sun-fire')
          if (boat) { moveToward(state, boat, 'chibi'); boat.morale = clamp(boat.morale + 3, 5, 100) }
          report(state, 'court', '赤壁', 'chibi.fire_ready', {}, true, 0)
          addReport(state, 'court', '赤壁', '再备火船，候下一个风向窗口；曹军已病，此机不可再失。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.holdFast = 1
          for (const a of alliedArmies(state)) {
            a.fatigue = clamp(a.fatigue - 10, 0, 100)
            a.morale = clamp(a.morale + 3, 5, 100)
            holdAt(state, a)
          }
          const main = army(state, 'cao-main')
          if (main && !main.removed) { main.foodDays = clamp(main.foodDays - 3, 0, 22); main.morale = clamp(main.morale - 2, 5, 100) }
          state.vars.plague = clamp((state.vars.plague ?? 0) + 1, 0, 4)
          report(state, 'court', '赤壁', 'chibi.hold', {}, true, 0)
        } else if (optionId === 'opt3') {
          // 移军夏口：避开疫气与本军疲劳，放弃江面主动
          state.vars.moveXiakou = 1
          for (const a of alliedArmies(state)) {
            moveToward(state, a, 'xiakou')
            a.morale = clamp(a.morale - 2, 5, 100)
          }
          report(state, 'court', '夏口', 'politics.ferry', {}, false, 0)
          addReport(state, 'court', '夏口', '联军移屯夏口，江面拱手让人。', 'mid', 0, true)
        } else if (optionId === 'opt4') {
          state.vars.raidSupply = 1
          const main = army(state, 'cao-main')
          if (main && !main.removed) {
            main.foodDays = clamp(main.foodDays - 5, 0, 22)
            main.morale = clamp(main.morale - 2, 5, 100)
          }
          report(state, 'scout', '江北', 'chibi.raid', {}, true, 0)
          addReport(state, 'court', '军前', '分兵断其转输，不求一战而定。', 'mid', 0, true)
        }
        break
      default:
        break
    }
  },

  aiTick(state, campaign, narrative): void {
    void campaign
    void narrative
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
    // 曹军水师在乌林按兵：粮秣自江陵、襄阳两路转输，故联军若断其粮道，此处最痛
    if (navy && !navy.removed && state.tick % 4 === 0 && state.vars.raidSupply) {
      navy.morale = clamp(navy.morale - 1, 5, 100)
    }
    void rear
  },

  onTick(state, campaign, narrative): void {
    void campaign
    void narrative
    plagueTick(state)
    windTick(state)
    chainTick(state)
    winterTick(state)
    fireTick(state)
    chaseTick(state)
    raidTick(state)
    // 军情急至：先报一句「请即决断」，免得玩家在结算界面才发现要决策
    if (!state.over && !state.pendingNode) {
      const node = nextNode(state)
      if (node) {
        const title = campaign.decisions.find(d => d.id === node)?.title ?? ''
        report(state, 'note', '军前', 'node.open', { title }, true, 0)
      }
    }
  },

  checkEnd(state, campaign): void {
    void campaign
    if (state.over) return
    if (state.flags.surrender) { end(state, 'surrender'); return }
    const caoMain = state.armies['cao-main']
    const caoNavy = state.armies['cao-navy']
    const caoBroken = (!caoMain || caoMain.removed || caoMain.troops < 30000) && (!caoNavy || caoNavy.removed || caoNavy.troops < 20000)
    if (caoBroken) { end(state, 'great'); return }
    if ((state.vars.caoBurn || state.vars.caoBurnLate) && state.tick >= 26) { end(state, 'victory'); return }
    if (alliedTroops(state) < 15000) { end(state, 'rout'); return }
    if (state.tick >= 60) end(state, (state.vars.caoBurn || state.vars.caoBurnLate) ? 'victory' : 'stalemate')
  },

  score(state, campaign): OpsScore {
    const burned = state.vars.caoBurn === 1
    const burnedLate = state.vars.caoBurnLate === 1
    // 曹军折损按主力、水师全额计，蔡瑁水师按六成计：它多守乌林，不总在江面上
    const initialOf = (id: string): number => campaign.armies.find(a => a.id === id)?.troops ?? 0
    const lostOf = (id: string): number => {
      const a = state.armies[id]
      return a ? Math.max(0, initialOf(id) - a.troops) : initialOf(id)
    }
    const killed = lostOf('cao-main') + lostOf('cao-navy') + Math.round(lostOf('cao-cai') * 0.6)
    const saved = Math.min(1, alliedTroops(state) / 50000)
    const parts: ScorePart[] = [
      {
        key: 'fire', label: '火攻破敌',
        value: burned ? 30 : burnedLate ? 18 : state.vars.fireFail ? 6 : 4, max: 30,
        note: burned ? '乌林火攻成功' : burnedLate ? '错过窗口后二次火攻' : state.vars.fireFail ? '火攻失手' : '火攻未行',
      },
      { key: 'enemy', label: '曹军折损', value: Math.round(clamp(killed / 90000, 0, 1) * 20), max: 20, note: '约 ' + Math.round(killed / 10000) + ' 万' },
      { key: 'saved', label: '联军保存', value: Math.round(saved * 20), max: 20, note: '保存约 ' + Math.round(saved * 100) + '%' },
      { key: 'alliance', label: '联盟与外交', value: state.flags.alliance ? 10 : 3, max: 10, note: state.flags.alliance ? '孙刘联盟' : '未结盟' },
      {
        key: 'jing', label: '荆州归属',
        value: state.flags.shareJing ? 10 : state.flags.takeNan ? 8 : state.flags.sunJing ? 7 : state.flags.threeJing ? 6 : 3, max: 10,
        note: state.flags.shareJing ? '共治荆州' : state.flags.takeNan ? '取南郡' : state.flags.sunJing ? '独占荆南' : state.flags.threeJing ? '荆州三分' : '未定',
      },
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
      deviation: burned ? '火攻成功，与史实主线相近。' : burnedLate ? '火攻迟发，虽胜而机已半失。' : '火攻未成或未行，与史实不同。',
      highlights: [
        { label: '火攻', value: burned ? '成功' : burnedLate ? '迟成' : state.vars.fireFail ? '失败' : '未行' },
        { label: '曹军折损', value: '约 ' + Math.round(killed / 10000) + ' 万' },
        { label: '联军保存', value: Math.round(saved * 100) + '%' },
        { label: '历时', value: state.tick + ' 日' },
      ],
      lines: dedupe(state.log).slice(-10),
    }
  },

  hud(state, campaign): { pressureText: string; objectiveText: string; stageText: string } {
    void campaign
    const fire = state.vars.caoBurn ? '曹军已溃'
      : state.vars.caoBurnLate ? '火攻迟发'
        : state.vars.firePlan ? '火攻待风'
          : state.vars.chained ? '敌舟连环可击' : '隔江对峙'
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
