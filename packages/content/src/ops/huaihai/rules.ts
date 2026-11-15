import type {
  OpsCampaign, OpsNarrative, OpsRules, OpsScore, OpsState, OpsArmyState, OpsBattle, ScorePart, OpsCityState, SourceId,
} from '@aiwar/sim'
import { armiesOf, addReport, shortestRoute, clamp, damageArmy } from '@aiwar/sim'
import { HUAIHAI_CORPUS } from './corpus.js'

function army(state: OpsState, id: string): OpsArmyState | undefined { return state.armies[id] }
function cityName(state: OpsState, id?: string): string { return id ? state.cities[id]?.name ?? id : '战场' }
function dist(state: OpsState, a: string, b: string): number { return shortestRoute(state.roads, a, b).length }
function playerTroops(state: OpsState): number {
  return armiesOf(state, state.playerFaction).reduce((s, a) => s + a.troops, 0)
}
function moveToward(state: OpsState, a: OpsArmyState, target: string): void {
  if (a.pos.kind === 'city' && a.pos.city === target) return
  a.order = { task: 'march', target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
  a.route = []
}
function orderPlayer(state: OpsState, target: string, ids?: string[]): void {
  const list = ids ? ids.map(id => army(state, id)).filter((a): a is OpsArmyState => !!a && !a.removed) : armiesOf(state, state.playerFaction)
  for (const a of list) moveToward(state, a, target)
}
function encircle(state: OpsState, targetId: string, by: string[]): boolean {
  const target = army(state, targetId)
  if (!target || target.removed || target.pos.kind !== 'city') return false
  const ring = state.cities[target.pos.city]
  if (!ring) return false
  let present = 0
  for (const id of by) {
    const a = army(state, id)
    if (!a || a.removed || a.pos.kind !== 'city') continue
    if (dist(state, a.pos.city, target.pos.city) <= 1) present++
  }
  return present >= 2
}
function stageCount(state: OpsState): number {
  const gone = (id: string) => { const a = state.armies[id]; return !a || a.removed }
  return [gone('kmt-7'), gone('kmt-12'), ['kmt-2', 'kmt-13', 'kmt-16'].every(gone)].filter(Boolean).length
}

function enemyKilled(state: OpsState, id: string): boolean {
  const a = state.armies[id]
  return !!a && (a.removed || a.troops < 4000)
}

// ---------- 战役专属语料 ----------
//
// 为什么要有这一层：通用 narrator 的 BASE 语料要跨 208 年水战、383 年淝水与 1948 年平原决战，
// 只能写得极空；淮海的味道（支前、圩墙、铁路、兵团建制、政治攻势）放不进那种通用句。
// 所以 rules 在这里直接取 HUAIHAI_CORPUS 的句子发战报：同一件事，引擎发一句通用的，
// 这里再补一句带淮海细节的。取不到该 key 时返回 false，调用方回退到原有写法，
// 保证语料文件缺失或 key 拼错时不会静默丢战报。
function fillLine(t: string, p: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_m: string, k: string) => p[k] ?? '')
}
function haiLine(kind: string, params: Record<string, string>, salt: number): string {
  const pool = HUAIHAI_CORPUS[kind]
  if (!pool || pool.length === 0) return ''
  return fillLine(pool[Math.abs(salt) % pool.length] ?? pool[0] ?? '', params)
}
function hai(
  state: OpsState, source: SourceId, place: string, kind: string,
  params: Record<string, string> = {}, confidence: 'high' | 'mid' | 'low' = 'mid',
  delay = 0, important = false,
): boolean {
  const text = haiLine(kind, params, state.narrativeSalt++)
  if (!text) return false
  addReport(state, source, place, text, confidence, delay, important)
  return true
}
/** 同一件事只补一句：避免每回合都往战报里塞重复的战役语料。 */
function once(state: OpsState, tag: string): boolean {
  const key = 'said:' + tag
  if (state.vars[key]) return false
  state.vars[key] = 1
  return true
}
function armyAt(state: OpsState, city: string, faction?: string): OpsArmyState[] {
  return armiesOf(state, faction ?? state.playerFaction).filter(a => a.pos.kind === 'city' && a.pos.city === city)
}
function power(state: OpsState, list: OpsArmyState[]): number {
  return list.reduce((s, a) => s + Math.pow(Math.max(1, a.troops), 0.92) * (0.45 + a.morale / 100 * 0.75) * (1 - a.fatigue / 100 * 0.35), 0)
}

const WATCH_CITIES = ['guzhen', 'suxian', 'jiagou', 'lingbi']
const EAT_CITIES = ['nianzhuang', 'shuangduiji', 'chenguanzhuang']

// 触发条件单独抽成纯函数：onTick 要在弹出之前先发一条"军情到案头"，
// 如果写在 rules 对象里就只能靠 this 取，方法被解构调用时 this 会丢。
function triggerFor(state: OpsState): string | null {
  const has = (id: string) => state.resolvedNodes.includes(id)
  const day = state.tick
  if (!has('d1') && day >= 2) return 'd1'
  if (!has('d2') && has('d1') && day >= 6) return 'd2'
  if (!has('d3') && has('d2') && (day >= 9 || state.cities.nianzhuang.besieged)) return 'd3'
  if (!has('d4') && has('d3') && (day >= 12 || state.cities.jiawang.besieged)) return 'd4'
  if (!has('d5') && has('d4') && (day >= 15 || state.cities.suxian.besieged)) return 'd5'
  if (!has('d6') && has('d5') && (day >= 20 || state.cities.shuangduiji.besieged)) return 'd6'
  if (!has('d7') && has('d6') && (state.vars.xuzhouRetreat || day >= 30)) return 'd7'
  if (!has('d8') && has('d7') && (state.vars.encircledChen === 1 || day >= 50)) return 'd8'
  // 以下四节点是淮海的特色机制：三线配平、支前运力、策反点数、政治时钟。
  // 条件都挂在前序节点之后，避免与主线节点抢同一回合（每回合只能弹一个）。
  if (!has('d9') && has('d6') && day >= 22) return 'd9'
  if (!has('d10') && has('d1') && day >= 14) return 'd10'
  if (!has('d11') && has('d4') && day >= 32) return 'd11'
  if (!has('d12') && has('d8') && (state.vars.encircledChen === 1 || day >= 54)) return 'd12'
  return null
}

const rules: OpsRules = {
  id: 'huaihai-1948',

  opening(state, campaign, narrative): void {
    // 开场态势走 narrator（packs.ts 已把淮海语料作为 extra 传进去），这里只管发具体军情
    addReport(state, 'court', '总前委', narrative.line('opening.situation', {}, 0) || '', 'high', 0, true)
    addReport(state, 'scout', '徐州', '情报：第 2、13、16 兵团守徐州，第 7 兵团在新安镇，第 12 兵团由蒙城北上。', 'mid', 1, true)
    addReport(state, 'note', '总前委', '战役决心：先打第 7 兵团，同时切断徐蚌线。', 'high', 0, false)
    addReport(state, 'court', '后方', '支前系统开始运转：粮食、弹药、担架与民工按区县编队，随军前送。', 'mid', 0, false)
    // 支前是淮海的第二条战线：开局给一个基线值，后面所有攻势强度都挂在它上面
    state.vars.logistics = 100
    state.vars.mobilizeDays = 0
    state.vars.covert = 0
    // 难度不能只靠 scoreFactor 放大分数，否则高难度反而更容易拿高分：
    // 这里让对方的充实程度随难度上浮（对应"多路反扑"），高难度真的更难打。
    if (state.difficulty === 'hard' || state.difficulty === 'hell') {
      const boost = state.difficulty === 'hell' ? 1.28 : 1.06
      const bonus = state.difficulty === 'hell' ? 14 : 5
      for (const a of armiesOf(state, 'kmt')) {
        a.troops = Math.round(a.troops * boost)
        a.initialTroops = a.troops
        a.morale = clamp(a.morale + bonus, 5, 100)
      }
    }
    orderPlayer(state, 'xinan')
  },

  triggerNode(state, campaign): string | null {
    void campaign
    return triggerFor(state)
  },

  applyDecision(state, campaign, narrative, nodeId, optionId): void {
    switch (nodeId) {
      case 'd1':
        state.flags.strategy = optionId === 'opt2' ? 2 : 1
        if (optionId === 'opt2') {
          addReport(state, 'court', '总前委', '决心打大淮海：准备连续围歼。', 'high', 0, true)
        } else if (optionId === 'opt1') {
          // 小淮海：目标只有一个兵团，兵力与后勤都按小规模配，但后续战果封顶
          state.vars.smallScope = 1
          state.vars.logistics = clamp((state.vars.logistics ?? 100) + 6, 0, 100)
          addReport(state, 'court', '总前委', '先打第7兵团，视情况扩大。战役规模收着打，后勤压力相应减轻。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.attackXuzhouFirst = 1
          orderPlayer(state, 'xuzhou', ['pl-e', 'pl-e2'])
          addReport(state, 'court', '总前委', '先打徐州，主力向徐州开进。', 'mid', 0, true)
        } else {
          state.vars.holdFirst = 1
          for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale - 2, 5, 100)
          addReport(state, 'court', '总前委', '暂不动作，等对方先动；部队转入待机。', 'mid', 0, true)
        }
        break
      case 'd2':
        if (optionId === 'opt1') {
          state.vars.cutRail = 1
          orderPlayer(state, 'suxian', ['pl-c'])
          addReport(state, 'court', '总前委', '中野向宿县方向行动，准备切断徐蚌线。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.assaultXuzhou = 1
          orderPlayer(state, 'xuzhou')
          state.vars.logistics = clamp((state.vars.logistics ?? 100) - 6, 0, 100)
          addReport(state, 'court', '总前委', '主力直取徐州，运输线拉长，支前压力加大。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.southFirst = 1
          orderPlayer(state, 'bengbu', ['pl-c', 'pl-l'])
          state.vars.logistics = clamp((state.vars.logistics ?? 100) - 4, 0, 100)
          addReport(state, 'court', '总前委', '主力南压先打蚌埠，徐州方向只留监视。', 'high', 0, true)
        } else {
          state.vars.waitEnemy = 1
          for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale - 2, 5, 100)
          state.vars.logistics = clamp((state.vars.logistics ?? 100) - 3, 0, 100)
          addReport(state, 'court', '总前委', '按兵不动，只作侦察；对方得以从容收缩。', 'mid', 0, true)
        }
        break
      case 'd3':
        if (optionId === 'opt1') {
          state.vars.chase7 = 1
          orderPlayer(state, 'nianzhuang')
          hai(state, 'border', '陇海线', 'politics.chase', { place: '陇海线' }, 'high', 0, true)
          addReport(state, 'border', '陇海线', '华野主力沿陇海线追击第7兵团。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.wait7 = 1
          orderPlayer(state, 'caobaji')
          addReport(state, 'court', '总前委', '命令部队先占要点，等敌军停下来再围。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.holdPizhou = 1
          orderPlayer(state, 'pizhou', ['pl-e2', 'pl-e3'])
          hai(state, 'court', '邳县渡口', 'politics.ferry', {}, 'high', 0, true)
          hai(state, 'court', '邳县渡口', 'politics.feint', { place: '新安镇' }, 'mid', 1, false)
          addReport(state, 'court', '总前委', '先取运河渡口，断其西退通路；以一部向东佯动。', 'high', 0, true)
        } else {
          state.vars.abandon7 = 1
          orderPlayer(state, 'shuangduiji', ['pl-e', 'pl-e2'])
          const seven = army(state, 'kmt-7')
          if (seven && !seven.removed) seven.morale = clamp(seven.morale + 4, 5, 100)
          addReport(state, 'court', '总前委', '放弃追击，转兵南线；第7兵团得以从容西撤。', 'mid', 0, true)
        }
        break
      case 'd4':
        if (optionId === 'opt1') {
          const defector = army(state, 'kmt-3')
          if (defector) {
            defector.troops = 0
            defector.removed = true
            state.cities.jiawang.owner = 'pla'
            state.cities.taierzhuang.owner = 'pla'
            state.vars.jiawang = 1
            addReport(state, 'note', '贾汪', '第3绥靖区在贾汪、台儿庄脱离原建制，徐州东北门户打开。', 'high', 0, true)
            hai(state, 'note', '贾汪', 'huaihai.defect', {}, 'high', 0, true)
          }
        } else if (optionId === 'opt2') {
          // 继续潜伏：把策反点数攒起来，留到双堆集方向一次性用掉
          state.vars.covert = (state.vars.covert ?? 0) + 2
          state.vars.jiawangDelay = 1
          addReport(state, 'deserter', '贾汪', '按兵不动，继续潜伏，策反点数累积。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.assaultJiawang = 1
          orderPlayer(state, 'jiawang', ['pl-e', 'pl-l'])
          addReport(state, 'court', '总前委', '不强求策反，准备强攻贾汪。', 'mid', 0, true)
        } else {
          state.vars.covert = (state.vars.covert ?? 0) + 1
          state.vars.jiawangProbe = 1
          // 只做接触不承诺：对方守军心里没底，城防士气先掉一截
          state.cities.jiawang.morale = clamp(state.cities.jiawang.morale - 6, 5, 100)
          addReport(state, 'deserter', '贾汪', '只派人接触、不作承诺；贾汪守军态度游移。', 'mid', 0, true)
        }
        break
      case 'd5':
        if (optionId === 'opt1') {
          state.vars.takeSuxian = 1
          orderPlayer(state, 'suxian', ['pl-c', 'pl-l'])
          addReport(state, 'court', '总前委', '中野攻占宿县，切断徐蚌联系。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.noSuxian = 1
          orderPlayer(state, 'nianzhuang', ['pl-c'])
          addReport(state, 'court', '总前委', '暂不攻宿县，集中兵力先围歼；徐蚌线仍然通着。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.raidRail = 1
          orderPlayer(state, 'jiagou', ['pl-l'])
          hai(state, 'border', '夹沟', 'huaihai.rail_cut', {}, 'high', 1, true)
          addReport(state, 'court', '总前委', '只派小部队破路袭扰，不占城。', 'mid', 0, true)
        } else {
          state.vars.pinSuxian = 1
          orderPlayer(state, 'shuangduiji', ['pl-c'])
          orderPlayer(state, 'suxian', ['pl-l'])
          addReport(state, 'court', '总前委', '派兵牵制宿县，主力南下。', 'mid', 0, true)
        }
        break
      case 'd6':
        if (optionId === 'opt1') {
          state.vars.eat7 = 1
          orderPlayer(state, 'nianzhuang', ['pl-e', 'pl-e2'])
          orderPlayer(state, 'shuangduiji', ['pl-c'])
          addReport(state, 'court', '总前委', '先吃第7兵团，再打第12兵团。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.twoFronts = 1
          orderPlayer(state, 'nianzhuang', ['pl-e'])
          orderPlayer(state, 'shuangduiji', ['pl-c', 'pl-l'])
          addReport(state, 'court', '总前委', '分兵同时围歼两处，风险很大。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.eat12First = 1
          orderPlayer(state, 'shuangduiji', ['pl-e', 'pl-e2', 'pl-c'])
          addReport(state, 'court', '总前委', '先打第12兵团，回头再收拾第7兵团。', 'mid', 0, true)
        } else {
          state.vars.letSeven = 1
          orderPlayer(state, 'xuzhou', ['pl-e'])
          const seven = army(state, 'kmt-7')
          if (seven && !seven.removed) seven.morale = clamp(seven.morale + 3, 5, 100)
          addReport(state, 'court', '总前委', '放开一路，集中打一处；被放开的那一路得以完整西撤。', 'mid', 0, true)
        }
        break
      case 'd7':
        if (optionId === 'opt1') {
          state.vars.expectSouthwest = 1
          orderPlayer(state, 'chenguanzhuang', ['pl-c', 'pl-l'])
          orderPlayer(state, 'nianzhuang', ['pl-e', 'pl-e2'])
          addReport(state, 'court', '总前委', '判断徐州集团向西南撤退，主力向永城、陈官庄方向截击。', 'high', 0, true)
          state.vars.pursueSouthwest = 1
        } else if (optionId === 'opt2') {
          state.vars.expectSoutheast = 1
          orderPlayer(state, 'guzhen', ['pl-e', 'pl-e2'])
          addReport(state, 'court', '总前委', '判断徐州集团向东南撤退，主力向固镇方向追击。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.expectSouthwest = 1
          orderPlayer(state, 'chenguanzhuang', ['pl-e', 'pl-e2'])
          orderPlayer(state, 'guzhen', ['pl-c'])
          addReport(state, 'court', '总前委', '分兵两路堵截，兵力有所分散。', 'mid', 0, true)
        } else {
          state.vars.pursueTail = 1
          orderPlayer(state, 'yongcheng', ['pl-e', 'pl-e2'])
          const two = army(state, 'kmt-2')
          if (two && !two.removed) two.morale = clamp(two.morale + 4, 5, 100)
          addReport(state, 'court', '总前委', '不强求包围，仅追歼后尾。', 'mid', 0, true)
        }
        break
      case 'd8':
        orderPlayer(state, 'xuzhou', ['pl-e2'])
        if (optionId === 'opt1') {
          state.vars.siegeNotAssault = 1
          state.vars.politicalClock = 0
          addReport(state, 'court', '陈官庄', '围而不打，先做政治攻势，等待总攻时机。', 'high', 0, true)
          hai(state, 'court', '陈官庄', 'huaihai.clock', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.generalAssault = 1
          addReport(state, 'court', '陈官庄', '立即总攻陈官庄。', 'high', 0, true)
          hai(state, 'border', '陈官庄', 'huaihai.artillery', {}, 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.generalAssault = 1
          state.vars.feintExit = 1
          addReport(state, 'court', '陈官庄', '围三缺一，诱敌突围，在运动中歼敌。', 'high', 0, true)
        } else {
          state.vars.siegeNotAssault = 1
          state.vars.politicalClock = 0
          state.vars.longSiege = 1
          state.vars.logistics = clamp((state.vars.logistics ?? 100) - 6, 0, 100)
          addReport(state, 'court', '陈官庄', '长期围困，等其自溃；运力消耗比总攻小不了多少。', 'mid', 0, true)
        }
        break
      case 'd9':
        // 三线配平：吃（围歼线）/挟（钳制线）/看（阻击线）
        if (optionId === 'opt1') {
          state.vars.eatLine = 1
          state.vars.pinLine = 1
          state.vars.watchLine = 1
          for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale + 1, 5, 100)
          hai(state, 'court', '总前委', 'huaihai.three_lines', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.pushAll = 1
          orderPlayer(state, 'nianzhuang', ['pl-e', 'pl-e2'])
          orderPlayer(state, 'shuangduiji', ['pl-c'])
          state.vars.logistics = clamp((state.vars.logistics ?? 100) - 5, 0, 100)
          hai(state, 'court', '总前委', 'huaihai.three_lines', {}, 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.thinWatch = 1
          orderPlayer(state, 'nianzhuang', ['pl-l'])
          state.vars.watchLine = 0
          addReport(state, 'court', '总前委', '抽空阻击线，兵力集中到围歼方向。', 'mid', 0, true)
        } else {
          state.vars.holdLines = 1
          for (const a of armiesOf(state, state.playerFaction)) {
            a.fatigue = clamp(a.fatigue - 6, 0, 100)
            a.morale = clamp(a.morale - 1, 5, 100)
          }
          addReport(state, 'court', '总前委', '只留监视部队，其余休整；攻势暂停。', 'mid', 0, true)
        }
        break
      case 'd10':
        // 支前运力：动员规模换运力，也换民工疲劳
        if (optionId === 'opt1') {
          state.vars.mobilize = 2
          state.vars.logistics = clamp((state.vars.logistics ?? 100) + 12, 0, 100)
          hai(state, 'court', '后方', 'huaihai.mobilize', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.mobilize = 1
          state.vars.logistics = clamp((state.vars.logistics ?? 100) + 7, 0, 100)
          addReport(state, 'court', '后方', '轮换动员，前后方分批，运力稳中有升。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.forageLocal = 1
          state.vars.logistics = clamp((state.vars.logistics ?? 100) + 4, 0, 100)
          for (const a of armiesOf(state, state.playerFaction)) {
            if (a.pos.kind !== 'city') continue
            const c = state.cities[a.pos.city]
            if (c && c.owner === state.playerFaction) c.grain = Math.max(0, c.grain - 4)
          }
          addReport(state, 'court', '后方', '就地筹粮，前送压力减轻，新区粮食消耗加快。', 'mid', 0, true)
        } else {
          state.vars.lootSupply = 1
          state.vars.logistics = clamp((state.vars.logistics ?? 100) - 8, 0, 100)
          for (const a of armiesOf(state, state.playerFaction)) a.foodDays = clamp(a.foodDays - 2, 0, 24)
          addReport(state, 'court', '后方', '不动员民工，主要靠缴获补给；运力不稳。', 'mid', 0, true)
        }
        break
      case 'd11':
        // 策反点数：攒够就能换来一次战场转向
        if (optionId === 'opt1') {
          state.vars.covertFocus = 1
          state.vars.covert = (state.vars.covert ?? 0) + 4
          defect110(state)
        } else if (optionId === 'opt2') {
          state.vars.covert = (state.vars.covert ?? 0) + 2
          state.vars.covertJiawang = 1
          for (const id of ['jiawang', 'taierzhuang']) {
            const c = state.cities[id]
            if (c && c.owner !== state.playerFaction) c.morale = clamp(c.morale - 8, 5, 100)
          }
          addReport(state, 'deserter', '贾汪', '继续争取贾汪余部，守军态度更加动摇。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.covert = (state.vars.covert ?? 0) + 1
          state.vars.broadcast = 1
          for (const a of armiesOf(state, 'kmt')) a.morale = clamp(a.morale - 2, 5, 100)
          hai(state, 'deserter', '前沿', 'huaihai.broadcast', {}, 'mid', 0, true)
        } else {
          state.vars.covertNone = 1
          state.vars.logistics = clamp((state.vars.logistics ?? 100) + 5, 0, 100)
          for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale - 1, 5, 100)
          addReport(state, 'court', '总前委', '策反点数不再投入，全部靠正面兵力解决。', 'mid', 0, true)
        }
        break
      case 'd12':
        // 政治时钟的最后一段：第16兵团战力最弱，先垮的必然是它
        if (optionId === 'opt1') {
          state.vars.tightChen = 1
          for (const id of ['kmt-2', 'kmt-13', 'kmt-16']) {
            const a = army(state, id)
            if (a && !a.removed) a.morale = clamp(a.morale - 3, 5, 100)
          }
          hai(state, 'court', '陈官庄', 'huaihai.chen', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.vars.openCorner = 1
          orderPlayer(state, 'qinglongji', ['pl-l'])
          addReport(state, 'court', '陈官庄', '围三缺一，留出缺口诱其突围。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.vars.assaultChen = 1
          state.vars.generalAssault = 1
          orderPlayer(state, 'chenguanzhuang', ['pl-e', 'pl-e2'])
          state.vars.logistics = clamp((state.vars.logistics ?? 100) - 8, 0, 100)
          addReport(state, 'court', '陈官庄', '不等了，立即总攻，趁其冻饿一举解决。', 'high', 0, true)
        } else {
          state.vars.parley = 1
          state.vars.covert = (state.vars.covert ?? 0) + 2
          for (const a of armyAt(state, 'chenguanzhuang', 'kmt')) a.morale = clamp(a.morale - 5, 5, 100)
          addReport(state, 'note', '陈官庄', '派人接洽，政治争取先行。', 'mid', 0, true)
        }
        break
      default:
        break
    }
    void narrative
  },

  aiTick(state, campaign, narrative): void {
    // 敌军 AI：徐州集团按兵不动，第7兵团西撤，第12兵团北上
    if (state.tick % 2 !== 0) return
    const seven = army(state, 'kmt-7')
    if (seven && !seven.removed && state.vars.chase7 !== 1 && state.tick > 8) {
      moveToward(state, seven, 'xuzhou')
    }
    const twelve = army(state, 'kmt-12')
    if (twelve && !twelve.removed && state.tick > 10) {
      moveToward(state, twelve, 'shuangduiji')
    }
    const two = army(state, 'kmt-2')
    if (two && !two.removed && state.tick > 12 && !state.vars.jiawang && state.tick < 20) {
      moveToward(state, two, 'daxujia')
    }
    // 看一个：阻击线在，蚌埠两个兵团就上不来；阻击线空，它们沿津浦线北上
    // 地狱难度：南北对进就是常态，阻击线在不在都挡不住援军往上顶
    const hellRelief = state.difficulty === 'hell' && state.tick > 14
    if (hellRelief || (state.vars.watchLine !== 1 && state.tick > 24)) {
      for (const id of ['kmt-6', 'kmt-8']) {
        const a = army(state, id)
        if (a && !a.removed && state.tick % 6 === 0) moveToward(state, a, 'guzhen')
      }
    }
    // 第7兵团覆灭后，华野主力自动南下参加陈官庄合围
    if ((!seven || seven.removed) && state.vars.eat7 === 1 && state.vars.expectSouthwest === 1 && state.tick % 4 === 0) {
      for (const id of ['pl-e', 'pl-e2']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        if (a.pos.kind === 'city' && a.pos.city === 'chenguanzhuang') continue
        moveToward(state, a, 'chenguanzhuang')
      }
    }
    // 包围判定
    if (seven && !seven.removed && seven.pos.kind === 'city') {
      const b = encircle(state, 'kmt-7', ['pl-e', 'pl-e2'])
      if (b && state.vars.encircled7 !== 1) {
        state.vars.encircled7 = 1
        state.vars.encircled7Tick = state.tick
        addReport(state, 'border', cityName(state, seven.pos.city), '第7兵团被包围。', 'high', 0, true)
        hai(state, 'border', cityName(state, seven.pos.city), 'politics.ring', { place: cityName(state, seven.pos.city) }, 'high', 0, true)
      }
    }
    // 徐州集团弃城南撤：第7兵团覆灭后，三个兵团经永城向陈官庄方向撤退（与史实一致）
    const sevenDown = !seven || seven.removed
    const encircledLong = state.vars.encircled7 === 1 && state.tick >= (state.vars.encircled7Tick ?? 99) + 7
    if ((sevenDown || encircledLong) && !state.vars.xuzhouRetreat) {
      state.vars.xuzhouRetreat = state.tick
      for (const id of ['kmt-2', 'kmt-13', 'kmt-16']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        moveToward(state, a, 'yongcheng')
      }
      addReport(state, 'scout', '徐州', '徐州集团放弃徐州，向西南方向撤退。', 'mid', 1, true)
      if (once(state, 'xuzhou_leave')) {
        hai(state, 'scout', '徐州', 'huaihai.xuzhou', {}, 'mid', 1, true)
      }
    }
    if (state.vars.xuzhouRetreat) {
      for (const id of ['kmt-2', 'kmt-13', 'kmt-16']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        if (a.pos.kind === 'city' && (a.pos.city === 'yongcheng' || a.pos.city === 'chenguanzhuang')) continue
        moveToward(state, a, 'chenguanzhuang')
      }
      // 到达陈官庄地域即构成被围（前提：解放军主力在南线或已追至）
      const atChen = ['kmt-2', 'kmt-13', 'kmt-16'].some(id => {
        const a = army(state, id)
        return !!a && !a.removed && a.pos.kind === 'city' && a.pos.city === 'chenguanzhuang'
      })
      const plaNear = armiesOf(state, state.playerFaction).some(p => p.pos.kind === 'city' && p.pos.city && dist(state, p.pos.city, 'chenguanzhuang') <= 4)
      if (atChen && plaNear && state.vars.generalAssault !== 1 && state.vars.encircledChen !== 1) {
        state.vars.encircledChen = 1
        addReport(state, 'border', '陈官庄', '徐州撤退集团被合围于陈官庄地区。', 'high', 0, true)
        hai(state, 'border', '陈官庄', 'huaihai.chen', {}, 'high', 0, true)
      }
    }
    // 徐州集团被点验为「已围」：政治时钟从这里起算
    if (state.vars.encircledChen === 1 && once(state, 'chen_ring')) {
      hai(state, 'border', '陈官庄', 'politics.ring', { place: '陈官庄' }, 'high', 0, true)
    }
    // 第110师（南线那一支）在围歼开始后向双堆集靠拢，与第12兵团会合
    const d110 = army(state, 'kmt-110')
    if (d110 && !d110.removed && state.vars.eat7 === 1 && state.tick > 20 && state.tick % 8 === 0) {
      moveToward(state, d110, 'shuangduiji')
    }
    void campaign
    void narrative
  },

  onTick(state, campaign, narrative): void {
    // 抵达敌占城市的部队自动转入攻城（玩家只需下达"去某城"的命令）
    for (const a of armiesOf(state, state.playerFaction)) {
      if (a.removed || a.inBattle) continue
      if (a.pos.kind !== 'city') continue
      const city = state.cities[a.pos.city]
      if (!city || city.owner === state.playerFaction || city.garrison < 300) continue
      if (!a.order || a.order.task !== 'assault') {
        a.order = { task: 'assault', target: city.id, sinceTick: state.tick, arrived: true, waitTicks: 0 }
      }
    }
    // 补充兵员：解放区动员与俘虏转化（每天少量补充）
    if (state.tick <= 50) {
      for (const a of armiesOf(state, state.playerFaction)) {
        if (a.removed) continue
        const base = campaign.armies.find(c => c.id === a.id)?.troops ?? a.troops
        a.troops = Math.min(base, Math.round(a.troops + base * 0.0012))
      }
    }
    // 后勤：支前运力——总攻最耗运力，围而不打最省
    if (state.tick % 4 === 0) {
      const diffDrain = state.difficulty === 'hell' ? 1.5 : state.difficulty === 'hard' ? 1.25 : state.difficulty === 'normal' ? 1 : 0.85
      const drain = (state.vars.generalAssault === 1 ? 5 : state.vars.siegeNotAssault === 1 ? 1.2 : 3) * diffDrain
      state.vars.logistics = clamp((state.vars.logistics ?? 100) - drain, 0, 100)
      const lg = state.vars.logistics ?? 100
      if (lg < 35) {
        for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale - 0.25, 5, 100)
        if (state.tick % 12 === 0) addReport(state, 'court', '后方', '支前运力告急，前线粮食与弹药吃紧。', 'mid', 1, true)
      }
    }
    // ---- 事件一：支前运力（雨雪折减、连续动员效率减半） ----
    // 这是淮海区别于一般会战的地方：后勤不是背景，它直接挂在 powerMod 上。
    if (state.tick % 3 === 0) {
      state.vars.mobilizeDays = (state.vars.mobilizeDays ?? 0) + 1
      const mobilizing = state.vars.mobilize === 2
      // 连续动员 12 个回合（36 天）以后，民工的效率减半：人会累，车队会坏
      const fatigueFactor = (state.vars.mobilizeDays ?? 0) >= 12 ? 0.5 : 1
      let drain = 0
      if (state.weather === 'snow') drain += 1.5 * (mobilizing ? 1 : 0.7)   // 雨雪天运力 -30%
      if (mobilizing) drain += 0.8 * fatigueFactor
      if (drain > 0) {
        state.vars.logistics = clamp((state.vars.logistics ?? 100) - drain, 0, 100)
        if (state.tick % 12 === 0) {
          hai(state, 'court', '后方', state.weather === 'snow' ? 'huaihai.snow' : 'huaihai.mobilize', {}, 'mid', 1, false)
        }
      }
      // 运力账面：前送一次就报一次数，让玩家看得见"后勤在跑"
      if (mobilizing && state.tick % 12 === 6) hai(state, 'court', '后方', 'huaihai.transport', {}, 'mid', 1, false)
      const lg = state.vars.logistics ?? 100
      if (lg <= 0) {
        for (const a of armiesOf(state, state.playerFaction)) a.morale = clamp(a.morale - 1, 5, 100)
        if (state.tick % 9 === 0) hai(state, 'court', '后方', 'supply.empty', { army: '前线各部' }, 'high', 1, true)
      } else if (lg < 30 && state.tick % 9 === 0) {
        hai(state, 'court', '后方', 'supply.low', { army: '前线各部' }, 'mid', 1, true)
      }
    }
    // ---- 事件二：三线配平与阻击线上的接触 ----
    // 「吃一个、挟一个、看一个」不是口号：围歼线厚了，阻击线就薄；阻击线空了，援军就会顶上来。
    if (state.tick >= 18 && state.tick % 6 === 0) {
      const eat = armiesOf(state, state.playerFaction).filter(a => a.pos.kind === 'city' && EAT_CITIES.includes(a.pos.city)).length
      const watch = armiesOf(state, state.playerFaction).filter(a => a.pos.kind === 'city' && WATCH_CITIES.includes(a.pos.city)).length
      state.vars.eatCount = eat
      state.vars.watchCount = watch
      const relief = ['kmt-6', 'kmt-8'].map(id => army(state, id)).filter((a): a is OpsArmyState => !!a && !a.removed)
      const atGuzhen = armyAt(state, 'guzhen')
      if (watch === 0 && relief.length > 0 && eat >= 1) {
        // 阻击线空：援军北上，与我军（如果有人在固镇）打一场遭遇战
        for (const r of relief) moveToward(state, r, 'guzhen')
        if (atGuzhen.length === 0) {
          // 无人可调：军令作废，正面只能先扛着
          if (once(state, 'blocked_' + state.tick)) {
            // 这条不是引擎的军令回执，而是"阻击线抽空了"的判断：用支前/三线语料更贴切
            hai(state, 'court', '固镇', 'huaihai.three_lines', {}, 'high', 1, true)
          }
          for (const a of armiesOf(state, state.playerFaction)) if (EAT_CITIES.includes(a.pos.kind === 'city' ? a.pos.city : '')) a.morale = clamp(a.morale - 0.6, 5, 100)
        } else {
          const ambush = atGuzhen.some(a => a.order?.task === 'ambush')
          if (ambush) hai(state, 'border', '固镇', 'battle.ambush_start', { place: '固镇' }, 'high', 0, true)
          else hai(state, 'border', '固镇', 'battle.start', { place: '固镇' }, 'high', 0, true)
          const mine = power(state, atGuzhen)
          const theirs = power(state, relief)
          if (mine * (ambush ? 1.35 : 1) >= theirs) {
            for (const r of relief) {
              damageArmy(r, ambush ? 0.07 : 0.05, state)
              r.morale = clamp(r.morale - (ambush ? 12 : 8), 5, 100)
              r.order = null
              moveToward(state, r, 'bengbu')
            }
            damageArmy(atGuzhen[0]!, 0.014, state)
            hai(state, 'border', '固镇', ambush ? 'battle.ambush_win' : 'battle.rout',
              { place: '固镇', winner: '我军', loser: '援军' }, 'high', 0, true)
          } else {
            damageArmy(atGuzhen[0]!, 0.026, state)
            for (const r of relief) damageArmy(r, 0.012, state)
            hai(state, 'border', '固镇', 'battle.draw', { place: '固镇' }, 'mid', 0, true)
          }
        }
      } else if (watch > 0 && state.tick % 18 === 0) {
        hai(state, 'court', '总前委', 'huaihai.three_lines', {}, 'mid', 1, false)
      }
    }
    // ---- 事件三：策反点数与战场转向 ----
    if (state.tick % 5 === 0) {
      const covert = state.vars.covert ?? 0
      if (covert >= 4) defect110(state)
      const broadcast = state.vars.broadcast === 1
      if (broadcast && state.tick % 10 === 0) {
        // 广播喊话是慢性药：被围部队士气一点点掉
        for (const a of armiesOf(state, 'kmt')) {
          if (a.pos.kind === 'city' && EAT_CITIES.includes(a.pos.city)) a.morale = clamp(a.morale - 1.5, 5, 100)
        }
        hai(state, 'deserter', '前沿', 'huaihai.surrender', {}, 'mid', 1, false)
      }
    }
    // ---- 事件四：政治时钟 vs 军事时钟 ----
    // 围而不打是"不作为的决策"：对方在掉，我方运力与严寒也在掉，谁先撑不住决定总攻日。
    if (state.vars.siegeNotAssault === 1 && state.vars.encircledChen === 1) {
      state.vars.politicalClock = (state.vars.politicalClock ?? 0) + 1
      for (const id of ['kmt-2', 'kmt-13', 'kmt-16']) {
        const a = army(state, id)
        if (a && !a.removed && a.pos.kind === 'city' && a.pos.city === 'chenguanzhuang') {
          a.morale = clamp(a.morale - 0.8, 5, 100)
        }
      }
      state.vars.surrender = (state.vars.surrender ?? 0) + 1
      // 军事时钟：严寒与运力消耗
      state.vars.logistics = clamp((state.vars.logistics ?? 100) - 0.4, 0, 100)
      if (state.vars.politicalClock === 10) hai(state, 'court', '陈官庄', 'huaihai.clock', {}, 'mid', 1, true)
      // 政治时钟走满 20 回合，攻势自动转入总攻（对应史实 1 月 6 日）
      // 地狱难度下这个窗口更短：对方不会被围到自溃，等到点只是浪费自己的运力。
      const clockLimit = state.difficulty === 'hell' ? 15 : 20
      if (state.vars.politicalClock >= clockLimit && state.vars.generalAssault !== 1) {
        state.vars.generalAssault = 1
        addReport(state, 'court', '陈官庄', '政治时钟走满，攻势转入总攻。', 'high', 0, true)
        hai(state, 'border', '陈官庄', 'huaihai.artillery', {}, 'high', 0, true)
      }
    }
    // 运河渡口：引擎只报渡河结果，这里补一句"渡口拥挤"的淮海细节（走一次水路才报）
    const crossings = state.vars.riverCrossings ?? 0
    if (crossings > (state.vars.crossSeen ?? 0)) {
      state.vars.crossSeen = crossings
      if (crossings === 1 || crossings % 4 === 0) {
        hai(state, 'court', '邳县渡口', 'politics.ferry', {}, 'mid', 0, false)
      }
    }
    // 情报卡不再由规则另发：引擎的 intelTick 已经在发 intel.sighting，
    // 语料接进 narrator 之后两边会撞成两条同义战报，只留引擎那一路。
    // 双堆集围歼：第12兵团被围后，中野持续压缩；玩家不再改令时保持围困
    const twelve = army(state, 'kmt-12')
    if (twelve && !twelve.removed && state.vars.eat7 === 1 && state.tick % 8 === 0) {
      orderPlayer(state, 'shuangduiji', ['pl-c', 'pl-l'])
    }
    if (twelve && !twelve.removed && twelve.pos.kind === 'city' && twelve.pos.city === 'shuangduiji') {
      const ring = ['pl-c', 'pl-l'].map(id => army(state, id)).filter((a): a is NonNullable<typeof a> => !!a && !a.removed && a.pos.kind === 'city' && a.pos.city === 'shuangduiji')
      if (ring.length > 0) {
        damageArmy(twelve, 0.012, state)
        if (once(state, 'shuang_ring')) hai(state, 'border', '双堆集', 'huaihai.shuang', {}, 'high', 0, true)
      }
    }
    // 歼灭判定：兵力低于建制两成三，或残部不足五千，即视为建制瓦解（被围歼）
    // 第13兵团只是陈官庄被围三个兵团之一，不能当作「徐州集团」整体
    const labels: Record<string, string> = { 'kmt-7': '第7兵团', 'kmt-12': '第12兵团', 'kmt-13': '第13兵团', 'kmt-2': '第2兵团', 'kmt-16': '第16兵团' }
    for (const id of Object.keys(labels)) {
      const a = army(state, id)
      if (!a || a.removed) continue
      const base = campaign.armies.find(c => c.id === id)?.troops ?? a.troops
      // 地狱难度：对方兵团建制更完整，不到更低的比例不会瓦解（多路反扑的一种表现）
      const hellHard = state.difficulty === 'hell' ? 0.8 : 1
      const threshold = (state.vars.encircledChen === 1 ? 0.4 : 0.22) * hellHard
      if (a.troops > Math.max(5000, Math.round(base * threshold))) continue
      a.removed = true
      a.troops = 0
      const where = a.pos.kind === 'city' ? a.pos.city : undefined
      const whereName = cityName(state, where)
      // 引擎在 resolveBattle 里已经发过 battle.annihilated（带淮海语料），
      // 这里是 onTick 侧的建制判散，只记一条明确"哪个兵团"的账目，不再重复渲染战况。
      addReport(state, 'border', whereName, labels[id] + '建制瓦解，番号不再出现在序列里。', 'high', 0, true)
      state.log.push('第' + (state.tick + 1) + '日：' + whereName + '，' + labels[id] + '被围歼')
    }
    // 第7兵团被围后继续压缩
    const seven = army(state, 'kmt-7')
    if (seven && !seven.removed && state.vars.encircled7 === 1) {
      damageArmy(seven, 0.02, state)
    }
    // 陈官庄集团解决后，中野转向双堆集围歼第12兵团
    const chenAlive = ['kmt-2', 'kmt-13'].some(id => { const a = army(state, id); return !!a && !a.removed })
    if (state.vars.encircledChen === 1 && !chenAlive) {
      for (const id of ['pl-c', 'pl-l']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        if (a.pos.kind === 'city' && a.pos.city === 'shuangduiji') continue
        moveToward(state, a, 'shuangduiji')
      }
      const twelve2 = army(state, 'kmt-12')
      if (twelve2 && !twelve2.removed) damageArmy(twelve2, 0.02, state)
    }
    // 陈官庄被围集团：围而不打靠政治攻势瓦解，总攻更快但自身有损耗
    if (state.vars.encircledChen === 1) {
      for (const id of ['kmt-2', 'kmt-13', 'kmt-16']) {
        const a = army(state, id)
        if (!a || a.removed) continue
        if (a.pos.kind !== 'city' || a.pos.city !== 'chenguanzhuang') continue
        if (state.vars.generalAssault === 1) {
          damageArmy(a, 0.06, state)
          a.morale = clamp(a.morale - 3, 5, 100)
        } else if (state.vars.siegeNotAssault === 1) {
          damageArmy(a, 0.024, state)
          a.morale = clamp(a.morale - 1.2, 5, 100)
        } else {
          damageArmy(a, 0.008, state)
        }
      }
      if (state.vars.generalAssault === 1) {
        for (const p of armiesOf(state, state.playerFaction)) {
          if (p.pos.kind === 'city' && p.pos.city === 'chenguanzhuang') damageArmy(p, 0.004, state)
        }
      }
    }
    // 战役节点提示：下一天要弹的节点，提前发一条"军情到案头"
    const upcoming = triggerFor(state)
    if (upcoming && !state.vars['nodeSaid:' + upcoming]) {
      state.vars['nodeSaid:' + upcoming] = 1
      const node = campaign.decisions.find(d => d.id === upcoming)
      if (node) hai(state, 'court', '军前', 'node.open', { title: node.title }, 'high', 0, true)
    }
    void narrative
  },

  onBattleResolved(state, campaign, battle, winner, narrative): void {
    const place = battle.city ? cityName(state, battle.city) : battle.place
    // 只补战术细节，不重复胜负通报：打了三天的仗一定在挖交通壕，总攻阶段一定是炮火先行
    if (battle.days >= 3 && once(state, 'eng_' + battle.id)) {
      hai(state, 'border', place, 'huaihai.engineer', {}, 'mid', 0, false)
    } else if (state.vars.generalAssault === 1 && once(state, 'gun_' + battle.id)) {
      hai(state, 'border', place, 'huaihai.artillery', {}, 'mid', 0, false)
    }
    if (winner !== 'draw' && state.vars.generalAssault === 1 && once(state, 'relief_' + battle.id)) {
      hai(state, 'scout', place, 'huaihai.relief', {}, 'mid', 0, false)
    }
    void campaign
    void narrative
  },

  onCityCaptured(state, campaign, city: OpsCityState, by, narrative): void {
    if (by !== state.playerFaction) return
    // 要点城市给专属战报，其余城邑不赘述（引擎已经发过通用战报）
    const kindByCity: Record<string, string> = {
      xuzhou: 'huaihai.xuzhou',
      caobaji: 'huaihai.caobaji',
      jiagou: 'huaihai.rail_cut',
      nianzhuang: 'huaihai.nianzhuang',
      shuangduiji: 'huaihai.shuang',
      chenguanzhuang: 'huaihai.chen',
    }
    const key = kindByCity[city.id]
    // 引擎在 siegeTick 里已经发过 siege.fall，这里只补要点城邑的专属一句
    if (key) hai(state, 'border', city.name, key, {}, 'high', 0, true)
    // 攻下徐州：政治上等于"关门"完成，客观压力下降
    if (city.id === 'xuzhou') {
      state.vars.tookXuzhou = 1
      state.vars.logistics = clamp((state.vars.logistics ?? 100) + 6, 0, 100)
    }
    void campaign
    void narrative
  },

  checkEnd(state, campaign): void {
    if (state.over) return
    // 三个阶段各自对应一个重兵集团：第7兵团、第12兵团、陈官庄（第2/13/16兵团）
    const gone = (id: string) => { const a = state.armies[id]; return !a || a.removed }
    const sevenDown = gone('kmt-7')
    const twelveDown = gone('kmt-12')
    const xuzhouDown = ['kmt-2', 'kmt-13', 'kmt-16'].every(gone)
    const stages = [sevenDown, twelveDown, xuzhouDown].filter(Boolean).length
    if (stages >= 3) { end(state, 'full'); return }
    if (state.cities.bengbu.owner === 'pla' && state.cities.xuzhou.owner === 'pla') { end(state, 'south'); return }
    if (playerTroops(state) < 130000) { end(state, 'heavy'); return }
    if (state.tick >= 66) end(state, stages >= 2 ? 'partial' : 'stall')
  },

  score(state, campaign): OpsScore {
    const killed = ['kmt-7', 'kmt-12', 'kmt-13', 'kmt-2', 'kmt-16'].filter(id => { const a = state.armies[id]; return !a || a.removed }).length
    const hubs = ['xuzhou', 'suxian', 'bengbu'].filter(id => state.cities[id]?.owner === state.playerFaction).length
    // 参战兵力从战役表里取，而不是写死一个数：加了新的兵团（苏北兵团、特纵）之后，
    // 写死的基数会把"伤亡"一栏永远算成满分，等于这条评分失效。
    const initial = Math.max(1, campaign.armies.filter(a => a.faction === state.playerFaction).reduce((s, a) => s + a.troops, 0))
    const hurt = Math.max(0, 1 - playerTroops(state) / initial)
    const logistics = state.vars.logistics ?? 100
    const jw = state.vars.jiawang ? 6 : 0
    const covert = state.vars.defect110 === 1 ? 6 : (state.vars.covert ?? 0) >= 2 ? 3 : 0
    const linesHeld = (state.vars.eatLine === 1 ? 1 : 0) + (state.vars.pinLine === 1 ? 1 : 0) + (state.vars.watchLine === 1 ? 1 : 0)
    const lines = state.vars.pushAll === 1 ? 2 : state.vars.thinWatch === 1 ? 1 : linesHeld * 2
    const clock = state.vars.siegeNotAssault === 1 ? ((state.vars.politicalClock ?? 0) >= 5 ? 4 : 2) : state.vars.longSiege === 1 ? 2 : state.vars.generalAssault === 1 ? 1 : 0
    const parts: ScorePart[] = [
      { key: 'killed', label: '歼敌集团', value: Math.min(30, killed * 6), max: 30, note: '歼灭 ' + killed + ' 个兵团' },
      { key: 'hubs', label: '控制枢纽', value: hubs * 8, max: 24, note: '徐州 / 宿县 / 蚌埠' },
      { key: 'loss', label: '自身伤亡', value: Math.round(clamp(1 - hurt / 0.35, 0, 1) * 15), max: 15, note: '约 ' + Math.round(hurt * 14.5) + ' 万' },
      { key: 'logistics', label: '支前后勤', value: Math.round((logistics / 100) * 10), max: 10, note: logistics > 60 ? '运力充足' : '运力紧张' },
      { key: 'jiawang', label: '战场转向', value: jw, max: 6, note: state.vars.jiawang ? '贾汪转向成功' : '未实现' },
      // 三阶段全部完成是史实主线，给一个明确的分项：原评分天花板 78 低于 S 线 80，打完也拿不到 S
      { key: 'stages', label: '三阶段完成', value: stageCount(state) >= 3 ? 8 : stageCount(state) * 2, max: 8, note: '已完成 ' + stageCount(state) + '/3 阶段' },
      { key: 'time', label: '战役节奏', value: state.tick < 60 ? 5 : 2, max: 5, note: '历 ' + state.tick + ' 日' },
      // 以下三项是淮海的特色机制：策反点数、三线配平、政治时钟
      { key: 'covert', label: '策反与政治攻势', value: covert, max: 6, note: state.vars.defect110 === 1 ? '战场转向成功' : (state.vars.covert ?? 0) > 0 ? '点数在攒' : '未投入' },
      { key: 'lines', label: '三线配平', value: Math.min(6, lines), max: 6, note: '吃 / 挟 / 看 各线保有兵力' },
      { key: 'clock', label: '政治时钟', value: clock, max: 4, note: state.vars.siegeNotAssault === 1 ? '围而不打，' + (state.vars.politicalClock ?? 0) + ' 日' : '未使用围困' },
    ]
    const raw = parts.reduce((s, p) => s + p.value, 0)
    const total = Math.min(100, Math.round(raw * campaign.difficulty[state.difficulty].scoreFactor))
    const grade: OpsScore['grade'] = total >= 80 ? 'S' : total >= 66 ? 'A' : total >= 54 ? 'B' : total >= 40 ? 'C' : 'D'
    const endings: Record<string, { title: string; text: string }> = {
      full: { title: '全胜', text: '三个重兵集团依次被解决，徐州枢纽易手。淮海战役达成全部目标。' },
      partial: { title: '大胜', text: '两个集团被歼，敌军退守淮河以南。战役获得决定性胜利，但南线仍有遗憾。' },
      south: { title: '南线突破', text: '徐州、蚌埠相继易手，敌南线体系瓦解。' },
      heavy: { title: '伤亡过重', text: '虽重创敌军，但自身伤亡超出预期，战役节奏被打乱。' },
      stall: { title: '僵持', text: '敌军收缩成功，战役未能打成预期的大规模围歼。' },
    }
    const ending = endings[state.endingId ?? 'stall'] ?? endings.stall
    return {
      grade, total, parts, endingId: state.endingId ?? 'stall',
      endingTitle: ending.title, endingText: ending.text,
      deviation: killed >= 3 ? '完成三阶段围歼，与史实主线一致。' : '与史实主线存在偏差。',
      highlights: [
        { label: '歼敌兵团', value: String(killed) },
        { label: '控制枢纽', value: hubs + '/3' },
        { label: '支前运力', value: Math.round(logistics) + '%' },
        { label: '历时', value: state.tick + ' 日' },
      ],
      lines: dedupe(state.log).slice(-10),
    }
  },

  powerMod(state, campaign, armyId, side): number {
    if (armyId.startsWith('pl-')) {
      // 支前运力直接决定攻势强度：运力不足，弹药粮食跟不上，攻坚与野战都打折
      const lg = state.vars.logistics ?? 100
      const supplyMod = lg >= 70 ? 1 : lg >= 45 ? 0.9 : lg >= 25 ? 0.78 : 0.6
      // 策反与政治攻势的效果：点数用出去之后，对方阵前转向，正面压力小一截
      const covertMod = state.vars.defect110 === 1 ? 1.04 : 1
      // 高难度的"多路反扑"必须落到推演上，而不是只乘一个分数系数：
      // 只乘系数会让地狱档比史实档更容易拿高分（raw × 1.15 直接顶到 100）。
      const diffMod = state.difficulty === 'hell' ? 0.78 : state.difficulty === 'hard' ? 0.92 : 1
      return (side === 'attacker' ? 2.3 : 1.55) * supplyMod * covertMod * diffMod
    }
    return 1
  },

  hud(state, campaign): { pressureText: string; objectiveText: string; stageText: string } {
    const gone = (id: string) => { const a = state.armies[id]; return !a || a.removed }
    const killed = [gone('kmt-7'), gone('kmt-12'), ['kmt-2', 'kmt-13', 'kmt-16'].every(gone)].filter(Boolean).length
    const stage = state.tick < 17 ? '第一阶段' : state.tick < 40 ? '第二阶段' : '第三阶段'
    return {
      pressureText: '已解决 ' + killed + '/3 阶段 · 运力 ' + Math.round(state.vars.logistics ?? 100) + '%',
      objectiveText: state.cities.xuzhou.owner === 'pla' ? '徐州已克' : state.cities.suxian.owner === 'pla' ? '徐蚌线已断' : '徐州未克',
      stageText: stage,
    }
  },
}

// 第110师战场转向：点数是淮海最"便宜"的战果——一次转向，等于少打一仗、多抢两天。
function defect110(state: OpsState): void {
  const d110 = state.armies['kmt-110']
  if (!d110 || d110.removed) return
  if ((state.vars.covert ?? 0) < 4) return
  state.vars.covert = (state.vars.covert ?? 0) - 4
  d110.troops = 0
  d110.removed = true
  state.vars.defect110 = 1
  const twelve = state.armies['kmt-12']
  if (twelve && !twelve.removed) {
    twelve.morale = clamp(twelve.morale - 12, 5, 100)
    twelve.troops = Math.round(twelve.troops * 0.96)
  }
  hai(state, 'deserter', '双堆集', 'huaihai.defect', {}, 'high', 0, true)
  addReport(state, 'note', '双堆集', '第110师脱离原建制，防区由我军接防；第12兵团的部署与突围方向随之暴露。', 'high', 0, true)
}

function dedupe(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) if (out[out.length - 1] !== line) out.push(line)
  return out
}
function end(state: OpsState, id: string): void { state.over = true; state.endingId = id }

export default rules
export { rules as huaihaiRules }
