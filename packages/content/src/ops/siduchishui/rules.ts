import type {
  OpsCampaign, OpsNarrative, OpsRules, OpsScore, OpsState, OpsArmyState, OpsCityState, OpsBattle,
  OpsTask, Confidence, SourceId, ScorePart,
} from '@aiwar/sim'
import { armiesOf, addReport, shortestRoute, damageArmy, clamp } from '@aiwar/sim'
import { SIDU_CORPUS } from './corpus.js'

// 追击集团只列「会跟着我们跑」的七路。叙永那一路川军是守备部队，
// 它的任务是守住川南门户，不追出省界——这正是档案 §6.6 说的派系矛盾，
// 也避免了「多一支敌军就让合围度凭空涨一档」的平衡事故。
const ENEMY_MAIN = ['kmt-central-1', 'kmt-central-2', 'kmt-guizhou', 'kmt-chuan-1', 'kmt-chuan-2', 'kmt-yunnan', 'kmt-hunan']

/**
 * 战役语料的本地包装。
 *
 * 为什么在 rules 里包一层，而不是直接改 narrator.ts 或 packs.ts：
 * 这两个文件要为四场 ops 战役共用，硬编码某一战役的语料会污染另外三场；
 * 而 rules 是唯一「只属于本战役」的入口，战役专属的 key 从这里优先取。
 * 取不到时退回传入的通用叙事，所以引擎自带 key(接战、围城、断粮)依然有兜底。
 */
type Params = Record<string, string>

function fill(tpl: string, params: Params): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '')
}

function line(state: OpsState, narrative: OpsNarrative, kind: string, params: Params = {}): string {
  const pool = SIDU_CORPUS[kind]
  const salt = state.narrativeSalt++
  if (pool && pool.length > 0) return fill(pool[Math.abs(salt) % pool.length] ?? pool[0]!, params)
  return narrative.line(kind, params, salt)
}

function say(
  state: OpsState, narrative: OpsNarrative, source: SourceId, place: string, kind: string,
  params: Params = {}, confidence: Confidence = 'mid', delay = 0, important = false,
): void {
  addReport(state, source, place, line(state, narrative, kind, params), confidence, delay, important)
}

/**
 * 不使用新的随机源：只用 seed 与 tick 做整数混合。
 * 同一存档重放必须得到同一结果，否则回归测试与读档都会漂。
 */
function roll(state: OpsState, salt: string): number {
  let h = state.seed * 2654435761 + state.tick * 40503 + salt.length * 97
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (Math.abs(h) % 1000) / 1000
}

function army(state: OpsState, id: string): OpsArmyState | undefined { return state.armies[id] }
function cityName(state: OpsState, id?: string): string { return id ? state.cities[id]?.name ?? id : '野外' }
function playerTotal(state: OpsState): number {
  return armiesOf(state, state.playerFaction).reduce((s, a) => s + a.troops, 0)
}
function distance(state: OpsState, a: string, b: string): number {
  return shortestRoute(state.roads, a, b).length
}
function nearestPlayerCity(state: OpsState, from: string): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const army of armiesOf(state, state.playerFaction)) {
    if (army.pos.kind !== 'city') continue
    const d = distance(state, from, army.pos.city)
    if (d < bestD) { bestD = d; best = army.pos.city }
  }
  return best
}

/** 玩家主力所在城（取兵力最多的一支），追兵距离、佯动目标都以它为准 */
function mainCity(state: OpsState): string | null {
  let best: OpsArmyState | null = null
  for (const a of armiesOf(state, state.playerFaction)) {
    if (!best || a.troops > best.troops) best = a
  }
  return best && best.pos.kind === 'city' ? best.pos.city : null
}

function setOrder(state: OpsState, a: OpsArmyState, task: OpsTask, target?: string): void {
  a.order = { task, target, sinceTick: state.tick, arrived: false, waitTicks: 0 }
  a.route = []
}

function moveToward(state: OpsState, army: OpsArmyState, target: string): void {
  if (army.pos.kind === 'city' && army.pos.city === target) return
  setOrder(state, army, 'march', target)
}

/** 决策链的唯一实现：triggerNode 与 onTick 的「即将开议」提示共用，避免两处条件写歪 */
function nextNode(state: OpsState): string | null {
  const done = new Set(state.resolvedNodes)
  const has = (id: string) => done.has(id)
  const at = (city: string) => armiesOf(state, state.playerFaction).some(a => a.pos.kind === 'city' && a.pos.city === city)
  const near = (city: string, n: number) => armiesOf(state, state.playerFaction).some(a => a.pos.kind === 'city' && distance(state, a.pos.city, city) <= n)
  const day = state.tick
  if (!has('d1') && day >= 2) return 'd1'
  if (!has('d2') && has('d1') && (at('tucheng') || day >= 9)) return 'd2'
  if (!has('d3') && has('d2') && (at('zhaxi') || at('taipingdu') || day >= 20)) return 'd3'
  if (!has('d4') && has('d3') && (at('loushanguan') || (at('zunyi') && (state.flags.d2 === 2 || day >= 18)) || day >= 28)) return 'd4'
  if (!has('d5') && has('d4') && (near('yaxi', 1) || at('maotai') || day >= 33)) return 'd5'
  if (!has('d6') && has('d5') && (near('lubanchang', 1) || day >= 40)) return 'd6'
  // d9 三渡：鲁班场撤下来转兵茅台，佯动的主场在这里
  if (!has('d9') && has('d6') && (at('maotai') || near('maotai', 1) || day >= 44)) return 'd9'
  // d10 南渡乌江：四渡回师之后，选渡口
  if (!has('d10') && has('d9') && (near('wujiang', 2) || day >= 52)) return 'd10'
  // d7 东进湘西还是佯攻贵阳（历史上发生在南渡乌江之后，所以排在 d10 后面）
  if (!has('d7') && has('d10') && (at('wujiang') || near('guiyang', 1) || day >= 58)) return 'd7'
  // d11 偏师：威逼昆明前后决定等不等红九军团
  if (!has('d11') && has('d7') && (near('kunming', 3) || near('qujing', 1) || near('songming', 1) || day >= 70)) return 'd11'
  // d8 金沙江：留足七天渡运窗口，否则必定半渡而击
  if (!has('d8') && has('d11') && (near('kunming', 3) || at('jiaopingdu') || at('longjie') || day >= 80)) return 'd8'
  return null
}

/** 节点 id 的先后次序：onTick 只能记一个数字，所以用下标当「已通报到第几步」 */
const NODE_ORDER = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd9', 'd10', 'd7', 'd11', 'd8']

function orderPlayer(state: OpsState, target: string, ids?: string[]): void {
  const list = ids ? ids.map(id => army(state, id)).filter((a): a is OpsArmyState => !!a && !a.removed) : armiesOf(state, state.playerFaction)
  for (const a of list) moveToward(state, a, target)
}

function orderPlayerTask(state: OpsState, task: OpsTask, ids?: string[]): void {
  const list = ids ? ids.map(id => army(state, id)).filter((a): a is OpsArmyState => !!a && !a.removed) : armiesOf(state, state.playerFaction)
  for (const a of list) {
    if (a.pos.kind === 'city') setOrder(state, a, task, a.pos.city)
    else setOrder(state, a, task)
  }
}

/** 对所有红军部队统一施加代价，避免逐处手写漏掉新加的部队 */
function costPlayer(state: OpsState, morale: number, fatigue: number): void {
  for (const a of armiesOf(state, state.playerFaction)) {
    a.morale = clamp(a.morale + morale, 5, 100)
    a.fatigue = clamp(a.fatigue + fatigue, 0, 100)
  }
}

const rules: OpsRules = {
  id: 'siduchishui-1935',

  opening(state, campaign, narrative): void {
    say(state, narrative, 'court', '军前', 'opening.situation', {}, 'mid', 0, true)
    const enemyCount = campaign.armies.filter(a => a.faction !== state.playerFaction).reduce((s, a) => s + a.troops, 0)
    say(state, narrative, 'scout', '赤水河', 'sidu.radio', {}, 'mid', 1, true)
    addReport(state, 'scout', '赤水河',
      '侦察汇总：川军一部在土城、赤水城方向，中央军两个纵队在鲁班场、乌江方向，滇军一部在镇雄，湘军一部在松坎。敌军总计约'
      + Math.round(enemyCount / 10000) + '万。', 'mid', 1, true)
    addReport(state, 'note', '遵义', '全军完成整编待发。遵义会议已确定北渡长江的方向。', 'high', 0, false)
  },

  /**
   * 触发次序（编号是追加顺序，不是时间顺序，已在 data.ts 注明）：
   * d1 北上 → d2 土城 → d3 扎西 → d4 娄山关/遵义 → d5 苟坝 → d6 鲁班场
   * → d9 三渡佯动 → d10 南渡乌江 → d7 东进还是西进 → d11 偏师 → d8 金沙江渡口
   */
  triggerNode(state, campaign): string | null {
    void campaign
    return nextNode(state)
  },

  applyDecision(state, campaign, narrative, nodeId, optionId): void {
    switch (nodeId) {
      case 'd1':
        state.flags.d1 = optionId === 'opt1' ? 1 : 2
        if (optionId === 'opt1') {
          orderPlayer(state, 'tucheng')
          addReport(state, 'court', '军前', '决定北渡长江。全军向土城、赤水方向开进。', 'high', 0, true)
        } else if (optionId === 'opt4') {
          state.flags.d1 = 4
          orderPlayer(state, 'bijie')
          addReport(state, 'court', '军前', '决定南下云南，绕道北上。全军经毕节西进。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.d1 = 3
          orderPlayer(state, 'songkan')
          addReport(state, 'court', '军前', '决定东进湘西，全军向松坎方向开进。', 'high', 0, true)
        } else {
          state.flags.d1 = 2
          state.vars.guerrilla = 1
          orderPlayerTask(state, 'forage')
          addReport(state, 'court', '军前', '暂留川黔边，就地筹粮，观察敌军动向。', 'high', 0, true)
        }
        break
      case 'd2':
        if (optionId === 'opt1') {
          state.flags.d2 = 1
          state.vars.mainged = 1
          costPlayer(state, -4, 8)
          const chuan = army(state, 'kmt-chuan-1')
          if (chuan) chuan.troops += 4500
          say(state, narrative, 'deserter', '土城', 'sidu.radio', {}, 'mid', 2, true)
        } else if (optionId === 'opt2') {
          state.flags.d2 = 2
          orderPlayer(state, 'yuanhou')
          addReport(state, 'court', '军前', '决定撤出战斗，西渡赤水。全军向太平渡方向转进。', 'high', 0, true)
        } else if (optionId === 'opt4') {
          // 转向东南放弃北渡：命令改了，但部队先要脱离接触，机动代价落在疲劳上
          state.flags.d2 = 4
          state.vars.mainged = 1
          costPlayer(state, -2, 6)
          orderPlayer(state, 'yaxi')
          addReport(state, 'court', '土城', '放弃北渡，部队转向东南，脱离接触时后卫被咬住一段。', 'mid', 0, true)
        } else {
          state.flags.d2 = 3
          state.vars.mainged = 1
          costPlayer(state, -3, 5)
          orderPlayerTask(state, 'hold')
          say(state, narrative, 'deserter', '土城', 'sidu.encircled_warn', {}, 'mid', 2, true)
        }
        break
      case 'd3':
        if (optionId === 'opt1') {
          state.flags.d3 = 1
          for (const a of armiesOf(state, state.playerFaction)) {
            a.stealth = clamp(a.stealth + 0.15, 0, 1)
            a.training = clamp(a.training + 0.05, 0.8, 1.3)
            a.morale = clamp(a.morale - 3, 5, 100)
          }
          state.vars.compact = 1
          say(state, narrative, 'court', '扎西', 'sidu.reorg', {}, 'high', 0, true)
          say(state, narrative, 'note', '扎西', 'sidu.reorg_cost', {}, 'mid', 0, false)
          orderPlayer(state, 'taipingdu')
        } else if (optionId === 'opt2') {
          // 不缩编：机关与辎重都留着，行军更慢、连队更薄——代价必须落在数值上
          state.flags.d3 = 2
          state.vars.compact = 0
          state.vars.reorgSlow = 1
          for (const a of armiesOf(state, state.playerFaction)) {
            a.training = clamp(a.training - 0.03, 0.8, 1.3)
            a.fatigue = clamp(a.fatigue + 4, 0, 100)
          }
          orderPlayer(state, 'taipingdu')
          addReport(state, 'court', '扎西', '决定保持建制，稳定军心。机关与辎重照旧，行军速度提不上来。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.d3 = 3
          state.vars.base = 1
          orderPlayerTask(state, 'forage')
          costPlayer(state, 2, -4)
          addReport(state, 'court', '扎西', '部队就地展开，准备建立根据地。部队得到几天喘息，但敌军正在合围。', 'mid', 0, true)
        } else {
          state.flags.d3 = 4
          state.vars.mainged = 1
          orderPlayer(state, 'chishuicheng')
          costPlayer(state, -3, 4)
          say(state, narrative, 'court', '扎西', 'sidu.sector', {}, 'mid', 0, true)
        }
        break
      case 'd4':
        if (optionId === 'opt1') {
          state.flags.d4 = 1
          orderPlayer(state, 'zunyi')
          const wu = army(state, 'kmt-central-2')
          if (wu) { wu.troops = Math.round(wu.troops * 0.85); wu.morale = clamp(wu.morale - 8, 5, 100) }
          state.cities.loushanguan.owner = 'red'
          state.cities.zunyi.owner = 'red'
          state.vars.zunyiWin = 1
          say(state, narrative, 'border', '遵义', 'sidu.zunyi_win', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          // 停手巩固：战果只到娄山关，黔军残部得以收拢，但部队也休整了一天
          state.flags.d4 = 2
          state.cities.loushanguan.owner = 'red'
          const gz = army(state, 'kmt-guizhou')
          if (gz) { gz.troops = Math.round(gz.troops * 0.94); gz.morale = clamp(gz.morale - 4, 5, 100) }
          costPlayer(state, 3, -5)
          addReport(state, 'border', '娄山关', '我军控制娄山关，就地巩固。敌军残部得以收拢，追击的机会放掉了。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          // 分兵两路：一路追、一路西进，命令与体力两头吃紧
          state.flags.d4 = 3
          moveToward(state, army(state, 'red-1')!, 'zunyi')
          moveToward(state, army(state, 'red-3')!, 'yaxi')
          costPlayer(state, -2, 6)
          addReport(state, 'court', '军前', '分兵两路，一路追击、一路西进。兵力一散，两边的拳头都不硬。', 'mid', 0, true)
        } else {
          // 放弃遵义转兵打鼓新场：城得而复失，换来一次向西的机动
          state.flags.d4 = 4
          orderPlayer(state, 'yaxi')
          costPlayer(state, -1, 4)
          const gz = army(state, 'kmt-guizhou')
          if (gz) gz.morale = clamp(gz.morale + 3, 5, 100)
          addReport(state, 'court', '军前', '放弃遵义，转兵打鼓新场方向。黔北的工作得而复失。', 'mid', 0, true)
        }
        break
      case 'd5':
        if (optionId === 'opt1') {
          state.flags.d5 = 1
          state.vars.attackDagu = 1
          const gz = army(state, 'kmt-guizhou')
          if (gz) gz.troops += 6000
          costPlayer(state, -3, 4)
          say(state, narrative, 'scout', '打鼓新场', 'sidu.radio', {}, 'low', 3, true)
          addReport(state, 'scout', '打鼓新场', '侦察发现：打鼓新场周围三日内可到之敌约三个纵队。', 'low', 3, true)
        } else if (optionId === 'opt2') {
          state.flags.d5 = 2
          addReport(state, 'court', '苟坝', '决定不打打鼓新场，全军转向西进。', 'high', 0, true)
          orderPlayer(state, 'maotai')
          // 指挥体制改为三人小组：命令更集中，效率稍好，但也意味着此后再无会议可推
          state.vars.triumvirate = 1
          costPlayer(state, 1, -2)
        } else if (optionId === 'opt3') {
          // 只派一部佯攻：真正被调动的是自己的一支部队
          state.flags.d5 = 3
          state.vars.feintDagu = 1
          moveToward(state, army(state, 'red-9')!, 'yaxi')
          costPlayer(state, -1, 3)
          const gz = army(state, 'kmt-guizhou')
          if (gz) gz.morale = clamp(gz.morale - 2, 5, 100)
          addReport(state, 'court', '苟坝', '以一部佯攻打鼓新场，主力待机。佯攻部队分成两半，两头都不够用。', 'mid', 0, true)
        } else {
          // 分兵同时打两处：兵家大忌，敌军得以各个应付
          state.flags.d5 = 4
          state.vars.daguSplit = 1
          moveToward(state, army(state, 'red-1')!, 'yaxi')
          moveToward(state, army(state, 'red-3')!, 'lubanchang')
          costPlayer(state, -3, 6)
          const zhou = army(state, 'kmt-central-1')
          if (zhou) zhou.morale = clamp(zhou.morale + 3, 5, 100)
          addReport(state, 'court', '苟坝', '分兵同时打两处。两处都打成了消耗战。', 'mid', 0, true)
        }
        break
      case 'd6':
        if (optionId === 'opt1') {
          state.flags.d6 = 1
          state.vars.attackLu = 1
          costPlayer(state, -3, 10)
          say(state, narrative, 'deserter', '鲁班场', 'sidu.lubanchang', {}, 'mid', 2, true)
        } else if (optionId === 'opt2') {
          state.flags.d6 = 2
          orderPlayer(state, 'maotai')
          const zhou = army(state, 'kmt-central-1')
          if (zhou) { zhou.troops = Math.round(zhou.troops * 0.92); zhou.morale = clamp(zhou.morale - 6, 5, 100) }
          costPlayer(state, -1, 6)
          say(state, narrative, 'border', '鲁班场', 'sidu.lubanchang', {}, 'high', 0, true)
        } else if (optionId === 'opt4') {
          state.flags.d6 = 4
          orderPlayer(state, 'maotai')
          costPlayer(state, 1, 3)
          say(state, narrative, 'court', '军前', 'sidu.feint_decoy', {}, 'mid', 0, true)
        } else {
          state.flags.d6 = 3
          orderPlayer(state, 'maotai')
          costPlayer(state, 1, 2)
          addReport(state, 'court', '军前', '绕过鲁班场，直接向茅台方向转进。敌军未受打击，会继续尾随。', 'high', 0, true)
        }
        break
      case 'd9':
        // 三渡赤水的佯动：渡河本身不难，难在让敌人相信这是真的北渡
        if (optionId === 'opt1') {
          state.flags.d9 = 1
          state.flags.ferryShow = 1
          state.vars.feintPower = 3
          orderPlayer(state, 'taipingdu')
          costPlayer(state, -1, 5)
          say(state, narrative, 'note', '茅台', 'sidu.feint_decoy', {}, 'high', 0, true)
          const chuan = army(state, 'kmt-chuan-2')
          if (chuan) moveToward(state, chuan, 'taipingdu')
          addReport(state, 'border', '茅台', '茅台上下渡口同时架桥，白天渡河，船筏一字排开，毫不遮掩。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.flags.d9 = 2
          state.vars.stealthCross = 1
          orderPlayer(state, 'taipingdu')
          costPlayer(state, 1, 2)
          addReport(state, 'note', '茅台', '夜间静默渡河，火把不点，号令不吹。敌人没有看见，也没有被骗。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.d9 = 3
          state.vars.feintPower = 1
          state.vars.bridgeOnly = 1
          orderPlayerTask(state, 'hold')
          costPlayer(state, -1, 2)
          addReport(state, 'note', '茅台', '只架浮桥，主力不动。桥在那里，敌人却看得出一半是空架子。', 'mid', 0, true)
        } else {
          state.flags.d9 = 4
          state.vars.mainged = 1
          orderPlayer(state, 'chishuicheng')
          costPlayer(state, -3, 6)
          const chuan = army(state, 'kmt-chuan-2')
          if (chuan) { chuan.troops += 4000; chuan.morale = clamp(chuan.morale + 4, 5, 100) }
          addReport(state, 'court', '茅台', '全军真北进，佯动做成真动作。川军江防正面迎上，道路越走越窄。', 'mid', 0, true)
        }
        break
      case 'd10':
        // 南渡乌江：渡口只有那么几处，选哪一处等于选追兵从哪里来
        if (optionId === 'opt1') {
          state.flags.d10 = 1
          state.vars.wujiangFerry = 1
          orderPlayer(state, 'wujiang')
          costPlayer(state, 0, 4)
          addReport(state, 'court', '乌江', '工兵连夜在江口架浮桥，主力按渡次过江。天亮之前必须过完。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.flags.d10 = 2
          state.vars.wujiangFerry = 2
          orderPlayer(state, 'wujiang')
          costPlayer(state, -1, 7)
          addReport(state, 'court', '乌江', '走大塘徒涉。水急，队伍在江心排成一线，慢而险。', 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.d10 = 3
          state.vars.wujiangFerry = 3
          orderPlayer(state, 'qingjiang')
          costPlayer(state, 1, 8)
          addReport(state, 'court', '乌江', '走梯子岩，绕远一天，换一个不设防的渡口。', 'mid', 0, true)
        } else {
          state.flags.d10 = 4
          state.vars.wujiangFerry = 4
          orderPlayer(state, 'wujiang')
          costPlayer(state, -2, 6)
          addReport(state, 'court', '乌江', '沿江另寻渡口，工兵在生疏的河段临时架桥，多花了大半天。', 'mid', 0, true)
        }
        break
      case 'd7':
        if (optionId === 'opt2') {
          state.flags.d7 = 2
          state.flags.feint = 1
          state.vars.feintDays = 0
          state.vars.feintPower = (state.vars.feintPower ?? 0) + 2
          // 佯动要分真兵：主力少一个团，敌人多信一天
          const decoy = army(state, 'red-9')
          if (decoy) moveToward(state, decoy, 'qingjiang')
          const yunnan = army(state, 'kmt-yunnan')
          if (yunnan) moveToward(state, yunnan, 'guiyang')
          const guizhou = army(state, 'kmt-guizhou')
          if (guizhou) moveToward(state, guizhou, 'guiyang')
          costPlayer(state, 0, 3)
          say(state, narrative, 'envoy', '贵阳', 'sidu.feint_decoy', {}, 'mid', 1, true)
          orderPlayer(state, 'kunming')
        } else if (optionId === 'opt1') {
          state.flags.d7 = 1
          orderPlayer(state, 'songkan')
          costPlayer(state, -2, 5)
          addReport(state, 'court', '军前', '决定东进湘西，会合红二、红六军团。湘军封锁线就在前面。', 'high', 0, true)
        } else if (optionId === 'opt4') {
          state.flags.d7 = 4
          orderPlayer(state, 'chishuicheng')
          costPlayer(state, -2, 6)
          addReport(state, 'court', '军前', '北上重渡长江，回到敌军重兵方向。', 'low', 0, true)
        } else {
          // 就地建立根据地：部队得到休整，但合围度会一天天涨上去
          state.flags.d7 = 3
          state.vars.base = 1
          orderPlayerTask(state, 'forage')
          costPlayer(state, 2, -8)
          addReport(state, 'court', '军前', '就地建立根据地，部队休整筹粮。敌人的合围圈不会等我们。', 'mid', 0, true)
        }
        break
      case 'd11':
        if (optionId === 'opt1') {
          state.flags.d11 = 1
          state.vars.splitFerry = 1
          moveToward(state, army(state, 'red-9')!, 'shujudu')
          orderPlayer(state, 'jiaopingdu', ['red-main', 'red-1', 'red-3', 'red-5', 'red-cadre'])
          costPlayer(state, 0, 2)
          addReport(state, 'court', '军前', '令红九军团单独由树桔渡北渡，主力直趋皎平渡。两路分渡，各自算时间。', 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.flags.d11 = 2
          state.vars.regroup9 = 1
          orderPlayer(state, 'shujudu')
          costPlayer(state, 1, 5)
          addReport(state, 'court', '军前', '主力北返接应红九军团，会合后再一同渡江。多走两三天，队伍能齐。', 'high', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.d11 = 3
          state.vars.abandon9 = 1
          orderPlayer(state, 'jiaopingdu', ['red-main', 'red-1', 'red-3', 'red-5', 'red-cadre'])
          costPlayer(state, -1, 0)
          addReport(state, 'court', '军前', '主力先渡，不等偏师。红九军团被留在了江东。', 'mid', 0, true)
        } else {
          state.flags.d11 = 4
          state.vars.allShujudu = 1
          orderPlayer(state, 'shujudu')
          costPlayer(state, -1, 6)
          addReport(state, 'court', '军前', '全军改走树桔渡，与偏师同渡。渡口窄、船更少，全部挤在一处。', 'mid', 0, true)
        }
        break
      case 'd8':
        if (optionId === 'opt1') {
          state.flags.crossStart = 1
          state.vars.ferry = 0
          state.vars.ferryGang = 1
          // 渡江窗口：难度越高，追兵越近、船工越难集中，渡完全军需要的天数越多
          state.vars.ferryHold = state.difficulty === 'hell' ? 11 : state.difficulty === 'hard' ? 9 : state.difficulty === 'normal' ? 8 : 7
          orderPlayer(state, 'jiaopingdu')
          say(state, narrative, 'court', '金沙江', 'sidu.ferry_choice', {}, 'high', 0, true)
        } else if (optionId === 'opt2') {
          state.flags.crossStart = 2
          state.vars.ferry = 0
          state.vars.ferryGang = 0
          state.vars.ferryHold = state.difficulty === 'hell' ? 14 : state.difficulty === 'hard' ? 12 : 10
          orderPlayer(state, 'longjie')
          say(state, narrative, 'court', '金沙江', 'sidu.ferry_ships', {}, 'mid', 0, true)
        } else if (optionId === 'opt3') {
          state.flags.crossStart = 3
          state.vars.ferry = 0
          state.vars.ferryGang = 0
          state.vars.ferryHold = 9
          orderPlayer(state, 'longjie')
          addReport(state, 'court', '金沙江', '分兵多路，同时抢渡。船、船工、指挥都分成了几份。', 'mid', 0, true)
        } else {
          state.flags.crossStart = 4
          state.vars.ferry = 0
          state.vars.ferryGang = 0
          state.vars.ferryHold = 14
          orderPlayerTask(state, 'hold')
          addReport(state, 'court', '金沙江', '就地阻击，等待时机。时间站在追兵那一边。', 'low', 0, true)
        }
        break
      default:
        break
    }
  },

  aiTick(state, campaign, narrative): void {
    const feintActive = (state.flags.feint ?? 0) === 1 && (state.vars.feintDays ?? 0) < 3
    // 敌军协同差、情报滞后：按难度刷新追击目标（史实 8 天 / 普通 7 天 / 困难 4 天 / 地狱 3 天）
    const diff = campaign.difficulty[state.difficulty]
    const cadence = diff.id === 'hell' ? 3 : diff.id === 'hard' ? 4 : diff.id === 'normal' ? 7 : 8
    for (const id of ENEMY_MAIN) {
      const enemy = army(state, id)
      if (!enemy || enemy.removed) continue
      if (state.tick % cadence !== 0) continue
      if ((id === 'kmt-chuan-1' || id === 'kmt-chuan-2') && !feintActive) continue
      const fromCity = enemy.pos.kind === 'city' ? enemy.pos.city : enemy.pos.from
      if (!fromCity) continue
      // 佯动期间敌军往假主力方向调动；佯动一过，各自回头找最近的我军
      // （不用「全体扑主力」：那等于让七个纵队共用一个大脑，不符合各派系自行其是的设定）
      const next = feintActive && (id === 'kmt-yunnan' || id === 'kmt-guizhou')
        ? 'qingjiang'
        : nearestPlayerCity(state, fromCity)
      if (!next) continue
      if (enemy.pos.kind === 'city' && (next === enemy.pos.city || distance(state, enemy.pos.city, next) <= 1)) continue
      moveToward(state, enemy, next)
    }
    // 敌军逼近报告
    if (state.tick % 5 === 0) {
      const ring = computeRing(state)
      if (ring > 50) {
        const lead = armiesOf(state, state.playerFaction)[0]
        const leadCity = lead && lead.pos.kind === 'city' ? lead.pos.city : undefined
        say(state, narrative, 'scout', cityName(state, leadCity), 'politics.ring', { place: '四周' }, 'mid', 1, ring > 80)
      }
    }
  },

  onTick(state, campaign, narrative): void {
    // 沿途补充：宣传与动员带来少量兵员（历史红军沿途扩红）
    if (state.tick <= 90) {
      for (const a of armiesOf(state, state.playerFaction)) {
        if (a.removed) continue
        const base = campaign.armies.find(c => c.id === a.id)?.troops ?? a.troops
        // 缩编之后骨干被稀释，补充兵员的恢复速度明显变慢（档案 M4 的代价项）
        const rate = state.vars.compact ? 0.0007 : 0.0015
        a.troops = Math.min(base, Math.round(a.troops + base * rate))
      }
    }
    // 事件零：决策节点将开——node.open 要让玩家在「军情急报」里先看到节点标题，
    // 而不是先看到一个没有题目的选项框。triggerNode 没有 narrative 参数，
    // 所以在这里用同一个 nextNode 提前播报，并用 vars 记住报过哪一步。
    const upcoming = nextNode(state)
    if (upcoming) {
      const idx = NODE_ORDER.indexOf(upcoming)
      if (idx >= 0 && idx > (state.vars.nodeOpenAt ?? -1)) {
        state.vars.nodeOpenAt = idx
        const node = campaign.decisions.find(d => d.id === upcoming)
        say(state, narrative, 'court', '军前', 'node.open', { title: node?.title ?? upcoming }, 'high', 0, true)
      }
    }

    // 事件一点五：行军与掉队。红军大部分日子在走不在打，掉队是这一年的日常减员，
    // 但只有疲劳真的堆起来才发生，否则就成了无代价的日日减员
    if (state.tick % 6 === 0) {
      const lead = mainCity(state)
      const worn = armiesOf(state, state.playerFaction).filter(a => a.fatigue >= 70)
      if (worn.length > 0) {
        say(state, narrative, 'deserter', cityName(state, lead ?? undefined), 'sidu.dropout', {}, 'mid', 0, false)
        for (const a of worn) a.troops = Math.max(1, Math.round(a.troops * 0.996))
        costPlayer(state, -1, 0)
      } else if (state.weather === 'rain') {
        say(state, narrative, 'court', cityName(state, lead ?? undefined), 'sidu.road_walk', {}, 'mid', 0, false)
      }
    }
    // 就地筹粮：只有在自己的城镇里才筹得到（走出来才有的吃，这一年的后勤就这一句话）
    if (state.tick % 7 === 0) {
      const hungry = armiesOf(state, state.playerFaction).find(a =>
        a.foodDays <= 3 && a.pos.kind === 'city' && state.cities[a.pos.city]?.owner === state.playerFaction)
      if (hungry) {
        const city = hungry.pos.kind === 'city' ? state.cities[hungry.pos.city] : undefined
        if (city) {
          say(state, narrative, 'merchant', city.name, 'sidu.forage', {}, 'mid', 0, false)
          hungry.foodDays = clamp(hungry.foodDays + 1, 0, campaign.balance.maxFoodDays)
          city.grain = Math.max(0, city.grain - 1)
        }
      }
    }
    // 分散行动的偏师：脱离主力就脱离了补给线，只能就地筹粮。
    // 不给这一口气，d11 选「两路分渡」等于处死红九军团，与史实（树桔渡三千余人过江）相反。
    if (state.vars.splitFerry && state.tick % 2 === 0) {
      const nine = army(state, 'red-9')
      if (nine && !nine.removed) {
        nine.foodDays = clamp(nine.foodDays + 1, 0, campaign.balance.maxFoodDays)
        if (state.tick % 10 === 0) say(state, narrative, 'merchant', '东川', 'sidu.forage', {}, 'mid', 0, false)
      }
    }
    // 合围度
    state.vars.ring = computeRing(state)

    // 事件一：佯动欺骗（M3）。只买得到 2—3 天，过了就作废，这一点必须写死在数值里
    if (state.flags.feint === 1) {
      const days = (state.vars.feintDays ?? 0) + 1
      state.vars.feintDays = days
      if (days === 1) {
        say(state, narrative, 'envoy', '贵阳', 'sidu.feint_decoy', {}, 'mid', 0, true)
      } else if (days === 2) {
        const chance = campaign.difficulty[state.difficulty].feintBreakChance ?? 0.2
        // 分出的真兵越多越可信；佯动规模写在 feintPower 里，史实是一个团
        const power = state.vars.feintPower ?? 2
        if (roll(state, 'feint') > chance + power * 0.05) {
          state.vars.feintOk = (state.vars.feintOk ?? 0) + 1
          const yunnan = army(state, 'kmt-yunnan')
          if (yunnan) moveToward(state, yunnan, 'qingjiang')
          const guizhou = army(state, 'kmt-guizhou')
          if (guizhou) moveToward(state, guizhou, 'qingjiang')
          say(state, narrative, 'envoy', '贵阳', 'sidu.feint_ok', {}, 'high', 0, true)
          costPlayer(state, 2, 2)
        } else {
          say(state, narrative, 'envoy', '贵阳', 'sidu.feint_fail', {}, 'mid', 0, true)
          // 骗术被看破的代价是敌人更警觉：合围度直接加一档
          state.vars.ring = Math.min(100, (state.vars.ring ?? 0) + 8)
          costPlayer(state, -2, 3)
        }
      } else if (days >= 3 && (state.vars.feintExpired ?? 0) === 0) {
        // 只标记「窗口过了」，不清 flags.feint：结算里的「欺骗与佯动」算的是
        // 「这一局有没有用过这手」，不是「最后一刻还灵不灵」
        state.vars.feintExpired = 1
        addReport(state, 'envoy', '贵阳', '佯动的有效期过了：敌军重新按真主力的位置调动。', 'mid', 0, true)
      }
    }

    // 事件二：追兵距离（本战役的命门）。距离 = 最近敌到主力的行军日数
    if (state.tick % 3 === 0) {
      const base = mainCity(state)
      if (base) {
        let gap = 99
        for (const id of ENEMY_MAIN) {
          const e = army(state, id)
          if (!e || e.removed || e.pos.kind !== 'city') continue
          gap = Math.min(gap, distance(state, e.pos.city, base))
        }
        state.vars.gap = gap
        if (gap <= 1) {
          say(state, narrative, 'scout', cityName(state, base), 'politics.chase', {}, 'high', 0, true)
          costPlayer(state, -1, 3)
        } else if (gap >= 5 && (state.vars.gapWarned ?? 0) === 0) {
          state.vars.gapWarned = 1
          say(state, narrative, 'court', cityName(state, base), 'sidu.chase_gap', {}, 'mid', 0, false)
          costPlayer(state, 1, -2)
        } else if (gap < 5) {
          state.vars.gapWarned = 0
        }
      }
    }

    // 事件三：雨季与河水（档案 §3.4）。涨水不停渡，但拖慢一切
    if (state.weather === 'rain' && state.tick % 7 === 0) {
      say(state, narrative, 'court', cityName(state, mainCity(state) ?? undefined), 'sidu.rain', {}, 'mid', 0, false)
      costPlayer(state, 0, 3)
      state.vars.mud = (state.vars.mud ?? 0) + 1
    }

    // 事件四：渡口与船只（M5）。船数是硬上限，追兵进到一日距离内就停渡
    if (state.flags.crossStart) {
      const choice = state.flags.crossStart
      const crossing = state.vars.ferry ?? 0
      const total = state.vars.ferryHold ?? 7
      const atFerry = armiesOf(state, state.playerFaction).some(a => a.pos.kind === 'city' && (a.pos.city === 'jiaopingdu' || a.pos.city === 'kunming' || a.pos.city === 'longjie' || a.pos.city === 'shujudu'))
      // 高难度下敌军封锁半径更大，渡口更容易被盯死
      const blockRadius = state.difficulty === 'hell' ? 3 : state.difficulty === 'hard' ? 2 : 1
      const enemyNear = ENEMY_MAIN.some(id => {
        const e = army(state, id)
        if (!e || e.removed || e.pos.kind !== 'city') return false
        return distance(state, e.pos.city, 'jiaopingdu') <= blockRadius
      })
      if (atFerry && !enemyNear) {
        // 无船的选择（龙街）要先架桥，这一天不产生渡次
        const needsBridge = choice === 2 || choice === 4
        if (needsBridge) {
          state.vars.bridge = (state.vars.bridge ?? 0) + 1
          if (state.vars.bridge === 1) say(state, narrative, 'court', '江岸', 'sidu.ferry_limit', {}, 'mid', 0, true)
          // 架桥是「第一步」而不是终点：桥架好后要转为渡运，否则选了龙街渡就永远渡不完
          if ((state.vars.bridge ?? 0) >= 2) state.vars.ferry = Math.min(total, crossing + 1)
        } else {
          state.vars.ferry = Math.min(total, crossing + 1)
        }
        if (state.vars.ferry === 1) say(state, narrative, 'court', '皎平渡', 'politics.ferry', {}, 'high', 0, true)
        if (state.vars.ferry === 1 && (state.vars.shipsTold ?? 0) === 0) {
          state.vars.shipsTold = 1
          say(state, narrative, 'court', '皎平渡', 'sidu.ferry_ships', {}, 'high', 0, true)
        }
        if (state.vars.ferry >= total - 1) say(state, narrative, 'court', '皎平渡', 'sidu.ferry_limit', {}, 'mid', 0, false)
      } else if (enemyNear && atFerry) {
        say(state, narrative, 'border', '皎平渡', 'sidu.ferry_block', {}, 'high', 0, true)
        costPlayer(state, -1, 2)
      }
      if (state.vars.ferry >= total && state.flags.crossed !== 1) {
        state.flags.crossed = 1
        say(state, narrative, 'court', '金沙江', 'sidu.ferry_done', {}, 'high', 0, true)
      }
    }

    // 一渡、二渡等渡河事件
    if (state.tick === 8 && state.flags.d2 === 2) {
      say(state, narrative, 'court', '赤水河', 'river.cross', {}, 'high', 0, true)
    }
    if (state.tick === 30 && (state.flags.d9 ?? 0) >= 1) {
      say(state, narrative, 'court', '赤水河', 'politics.feint', { place: '川南' }, 'mid', 0, true)
    }
    // 合围度逼近上限时，提前给一条明确的警告（失败也是内容）
    if ((state.vars.ring ?? 0) >= 85 && (state.vars.ringWarned ?? 0) === 0) {
      state.vars.ringWarned = 1
      say(state, narrative, 'court', cityName(state, mainCity(state) ?? undefined), 'sidu.encircled_warn', {}, 'high', 0, true)
    }
    void campaign
  },

  checkEnd(state, campaign): void {
    if (state.over) return
    const total = playerTotal(state)
    const initial = campaign.armies.filter(a => a.faction === state.playerFaction).reduce((s, a) => s + a.troops, 0)
    if (total <= initial * 0.25) { end(state, 'wiped'); return }
    if ((state.vars.ring ?? 0) >= 100) { end(state, 'encircled'); return }
    if (state.flags.crossed === 1) { end(state, 'crossing'); return }
    if (state.tick >= 110) { end(state, state.flags.crossStart ? 'halfway' : 'timeout') }
  },

  score(state, campaign): OpsScore {
    const initial = campaign.armies.filter(a => a.faction === state.playerFaction).reduce((s, a) => s + a.troops, 0)
    const saved = playerTotal(state) / Math.max(1, initial)
    const crossed = state.flags.crossed === 1
    const enemyInitial = campaign.armies.filter(a => a.faction !== state.playerFaction).reduce((s, a) => s + a.troops, 0)
    const enemyLossTotal = campaign.armies.filter(a => a.faction !== state.playerFaction).reduce((s, a) => {
      const now = army(state, a.id)
      return s + (now ? Math.max(0, a.troops - now.troops) : a.troops)
    }, 0)
    const parts: ScorePart[] = [
      { key: 'cross', label: '战略转移', value: crossed ? 30 : state.flags.crossStart ? 12 : 0, max: 30, note: crossed ? '渡过金沙江' : '尚未渡江' },
      { key: 'saved', label: '兵力保存', value: Math.round(clamp(saved / 0.7, 0, 1) * 25), max: 25, note: '保存约 ' + Math.round(saved * 100) + '%' },
      { key: 'enemy', label: '敌军折损', value: Math.round(clamp(enemyLossTotal / Math.max(1, enemyInitial) / 0.15, 0, 1) * 15), max: 15, note: '约 ' + Math.round(enemyLossTotal / 10000 * 10) / 10 + ' 万' },
      { key: 'feint', label: '欺骗与佯动', value: state.flags.feint ? 15 : state.vars.feintOk ? 8 : 0, max: 15, note: state.flags.feint ? '调动敌军成功' : state.vars.feintOk ? '佯动部分奏效' : '未实施' },
      { key: 'compact', label: '组织与机动', value: state.vars.compact ? 10 : 4, max: 10, note: state.vars.compact ? '扎西整编' : '未整编' },
      { key: 'time', label: '行军效率', value: state.tick < 80 ? 5 : 2, max: 5, note: '历 ' + state.tick + ' 日' },
    ]
    const raw = parts.reduce((s, p) => s + p.value, 0)
    const total = Math.min(100, Math.round(raw * campaign.difficulty[state.difficulty].scoreFactor))
    const grade: OpsScore['grade'] = total >= 75 ? 'S' : total >= 66 ? 'A' : total >= 54 ? 'B' : total >= 40 ? 'C' : 'D'
    // 结局只保留五条：crossing / encircled / wiped / halfway / timeout，
    // 新增的变量（偏师去向、佯动成败）不另开结局，只进 highlights 与本局评语。
    const endings: Record<string, { title: string; text: string }> = {
      crossing: { title: '巧渡金沙江', text: '主力渡过金沙江，追兵被甩在江东。战略转移取得决定性胜利。' },
      encircled: { title: '合围', text: '敌军数路收口，我军被压在狭小地域。机动空间耗尽。' },
      wiped: { title: '主力溃散', text: '部队损失过重，建制难以维持，只能分散突围。' },
      halfway: { title: '半渡而击', text: '渡江中断，后卫被追兵截住。主力虽过江，损失惨重。' },
      timeout: { title: '滞留江东', text: '时间耗尽，追兵合围，渡江计划落空。' },
    }
    const ending = endings[state.endingId ?? 'timeout'] ?? endings.timeout
    // 偏师的去向要如实写：弃师独走、单独渡江、还是在转战中损失掉，三者不是一回事
    const nine = army(state, 'red-9')
    const nineText = (state.vars.abandon9 ?? 0) === 1 ? '隔在江东' : !nine || nine.removed || nine.troops <= 0 ? '转战中损失' : (state.vars.splitFerry ? '单独渡江' : '随主力行动')
    const highlights = [
      { label: '渡过金沙江', value: crossed ? '是' : '否' },
      { label: '保存兵力', value: Math.round(saved * 100) + '%' },
      { label: '敌军折损', value: '约 ' + Math.round(enemyLossTotal / 10000 * 10) / 10 + ' 万' },
      { label: '合围度', value: Math.round(state.vars.ring ?? 0) + '%' },
      { label: '偏师', value: nineText },
      { label: '历时', value: state.tick + ' 日' },
    ]
    return {
      grade, total, parts, endingId: state.endingId ?? 'timeout',
      endingTitle: ending.title, endingText: ending.text,
      deviation: crossed ? '完成战略转移；历史以皎平渡为主渡口，你的路径可能不同。' : '未能完成渡江，与史实走向不同。',
      highlights,
      lines: dedupe(state.log).slice(-10),
    }
  },

  powerMod(state, campaign, armyId, side): number {
    if (armyId.startsWith('red-')) {
      // 土城加码留下的疲态、扎西整编带来的效率，都落在同一支部队的战力上
      let mod = state.flags.d2 === 1 ? 0.95 : 1
      if (state.vars.compact) mod *= 1.05
      if (state.vars.reorgSlow) mod *= 0.97
      return mod
    }
    if (state.vars.attackLu && armyId === 'kmt-central-1') return 1.1
    if (state.vars.attackDagu && armyId === 'kmt-guizhou') return 1.15
    if (state.vars.feintDagu && armyId === 'kmt-guizhou') return 1.05
    if (side === 'defender' && state.cities) return 1
    return 1
  },

  // 战报落地：攻城与战斗的收尾用战役语料补一句，而不是全用通用句
  onCityCaptured(state, campaign, city: OpsCityState, by, narrative): void {
    if (state.over) return
    if (by === state.playerFaction) {
      say(state, narrative, 'border', city.name, 'siege.fall', { city: city.name, side: '我军' }, 'high', 0, true)
      if (city.id === 'zunyi') state.vars.zunyiWin = 1
      // 打下大城才谈得上「精神一振」：小据点不值得单独报一条士气
      if (city.kind === 'capital' || city.initialGarrison >= 2000) {
        state.vars.bigWins = (state.vars.bigWins ?? 0) + 1
        say(state, narrative, 'note', city.name, 'sidu.morale_up', {}, 'mid', 0, false)
        costPlayer(state, 2, -2)
      }
    }
    void campaign
  },

  onBattleResolved(state, campaign, battle: OpsBattle, winner, narrative): void {
    if (state.over) return
    if (winner === 'draw') {
      say(state, narrative, 'border', battle.place, 'battle.draw', { place: battle.place }, 'mid', 0, false)
    }
    void campaign
  },

  hud(state, campaign): { pressureText: string; objectiveText: string; stageText: string } {
    const ring = Math.round(state.vars.ring ?? 0)
    const crossed = state.flags.crossed === 1
    const ferry = state.vars.ferry ?? 0
    const hold = state.vars.ferryHold ?? 7
    const gap = state.vars.gap ?? 0
    return {
      pressureText: '合围度 ' + ring + '%' + (gap > 0 ? ' · 追兵 ' + gap + ' 日' : ''),
      objectiveText: crossed ? '已渡江' : state.flags.crossStart ? '渡江中 ' + ferry + '/' + hold : '待渡江',
      stageText: state.resolvedNodes.length >= 10 ? '战役后段' : state.resolvedNodes.length >= 5 ? '战役中段' : '战役前段',
    }
  },
}

function computeRing(state: OpsState): number {
  const players = armiesOf(state, state.playerFaction)
  if (players.length === 0) return 100
  let count = 0
  for (const id of ENEMY_MAIN) {
    const e = state.armies[id]
    if (!e || e.removed || e.pos.kind !== 'city') continue
    for (const p of players) {
      if (p.pos.kind !== 'city') continue
      const d = shortestRoute(state.roads, e.pos.city, p.pos.city).length
      if (d <= 2) { count += 1; break }
    }
  }
  // 七路各 14 分，全部到位封顶 98：合围度 100 必须是「再被压一步」而不是「恰好凑齐」，
  // 否则玩家会觉得只要敌人都在图上就该判负
  return Math.min(98, count * 14)
}

function dedupe(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) if (out[out.length - 1] !== line) out.push(line)
  return out
}

function end(state: OpsState, endingId: string): void {
  state.over = true
  state.endingId = endingId
}

export default rules
export { rules as siduRules, computeRing }
