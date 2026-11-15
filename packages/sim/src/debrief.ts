// 战报与战役分析：把「一局里到底发生了什么」从只增不删的账本里读出来。
//
// 设计要点：
// 1. 纯函数、零 DOM 依赖 → 可在无头测试里跑满五场战役的胜/败/放弃三条路径。
// 2. 胜负判定不散落在战役规则里：checkEnd 只置 endingId，这里按 endingId 归档。
//    所谓「不论输赢」就是：verdict 一定有值，战报一定生成。
// 3. 折损只给分档，不给精确人数（与结算页口径一致，也符合内容规范）。

import type { Score, ScorePart } from './types.js'
import type {
  BattleRecord, ChoiceRecord, CityRecord, Ledgers, OrderRecord,
} from './ledger.js'
import { lossBand, lossSeverity, normalizeLedgers } from './ledger.js'

export type DebriefVerdict = 'win' | 'lose' | 'draw' | 'abandoned'

export interface DebriefBattle {
  place: string
  tick: number
  days: number
  result: '胜' | '败' | '平'
  ours: string
  theirs: string
  ambush: boolean
  line: string
}

export interface DebriefCity {
  name: string
  tick: number
  fromLabel: string
  toLabel: string
  gained: boolean
}

export interface DebriefDecision {
  tick: number
  title: string
  label: string
  recommended: boolean
  timeout: boolean
  /** 该决策之后发生的第一件不利事件（用于「几天后反噬」） */
  echo?: string
}

export interface DebriefMetric {
  label: string
  value: string
  hint: string
}

export interface DebriefLine {
  tick: number
  kind: 'decision' | 'battle' | 'city' | 'order' | 'other'
  text: string
}

export interface Debrief {
  verdict: DebriefVerdict
  verdictLabel: string
  headline: string
  chronicle: DebriefLine[]
  battles: DebriefBattle[]
  cities: DebriefCity[]
  decisions: DebriefDecision[]
  metrics: DebriefMetric[]
  reading: { label: string; text: string }[]
  turningPoint: { tick: number; text: string }
  historyCompare: { same: string[]; diff: string[] }
  hintIfLose: string
  sides: { player: string; enemy: string }
}

/** 各战役的结局归档：决定「这一局算赢、算输，还是算平」。 */
const ENDING_VERDICTS: Record<string, Record<string, DebriefVerdict>> = {
  'guiling-353bc': {
    grand: 'win', bitter: 'win', relief: 'draw', daliang: 'win', conquest: 'win',
    rout: 'lose', abandon: 'lose', peace: 'draw', long: 'draw', stalemate: 'draw',
  },
  'chibi-208': {
    great: 'win', victory: 'win', rout: 'lose', surrender: 'lose', stalemate: 'draw',
  },
  'feishui-383': {
    crushed: 'win', victory: 'win', won: 'win', rout: 'lose', stalemate: 'draw',
  },
  'siduchishui-1935': {
    crossing: 'win', encircled: 'lose', wiped: 'lose', halfway: 'lose', timeout: 'lose',
  },
  'huaihai-1948': {
    full: 'win', partial: 'win', south: 'win', heavy: 'draw', stall: 'draw',
  },
}

export function verdictOf(campaignId: string, endingId: string | null, abandoned = false): DebriefVerdict {
  if (abandoned) return 'abandoned'
  const table = ENDING_VERDICTS[campaignId]
  if (table && endingId && table[endingId]) return table[endingId]!
  return 'draw'
}

const VERDICT_LABEL: Record<DebriefVerdict, string> = {
  win: '胜', lose: '败', draw: '未分', abandoned: '弃局',
}

/** 失败时的「如果当时……」：按战役给一句，缺省给通用建议 */
const LOSE_HINT: Record<string, string> = {
  'guiling-353bc': '若当时先示弱于平陵、把主力压在桂陵道上，魏军回师必经的这条道就会变成伏击场——史书里的胜负手从来不在邯郸城下。',
  'chibi-208': '若当时把决战点再往东挪一段、或者等风向稳定后再发火船，曹军的水师未必会连成一片送到火里。',
  'feishui-383': '若当时不急于求战、先让秦军自己把阵列拉开，淝水那一下后撤就有可能变成你想要的溃退，而不是自己的溃退。',
  'siduchishui-1935': '若当时在土城就收手、把主力留给后面的佯动，追兵不会那么快贴上来；这一局真正输掉的地方，往往比最后一次战斗早得多。',
  'huaihai-1948': '若当时把兵力在三线之间留出一支机动，被围集团的突围就不会那么容易——大兵团作战拼的是配置，不是勇气。',
}

const GENERIC_HINT = '若当时在关键节点上留一手、不把全部兵力压到一个方向上，局面未必没有回旋余地。'

export interface DebriefInput {
  campaignId: string
  playerLabel: string
  enemyLabel: string
  score: Score
  endingId: string | null
  tick: number
  abandoned: boolean
  ledgers: Ledgers
  casualties: { player: number; enemy: number }
  citiesTaken: string[]
  log: string[]
  departmentNames: Record<string, string>
  playerFaction: string
  cityOwners: Record<string, { name: string; owner: string }>
}

export function buildDebrief(input: DebriefInput): Debrief {
  const ledgers = normalizeLedgers(input.ledgers)
  const verdict = verdictOf(input.campaignId, input.endingId, input.abandoned)
  const factionLabel = (id: string): string => {
    if (id === input.playerFaction) return input.playerLabel
    return input.departmentNames[id] ?? '敌军'
  }

  const battles = buildBattles(ledgers.battleLog, input.playerLabel, input.enemyLabel)
  const cities = buildCities(ledgers.cityLog, factionLabel, input.playerLabel)
  const decisions = buildDecisions(ledgers.choiceLog, ledgers.cityLog, ledgers.battleLog, input.playerFaction)
  const chronicle = buildChronicle(decisions, battles, cities, ledgers.orderLog, input.log, factionLabel)
  const metrics = buildMetrics(ledgers, battles, cities, casualtiesOf(input), input.tick)
  const reading = buildReading(input.score.parts)
  const turningPoint = buildTurningPoint(battles, cities, decisions, input.campaignId)

  return {
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    headline: buildHeadline(verdict, input.score.endingTitle, input.score.endingText, battles, cities, input.playerLabel),
    chronicle,
    battles,
    cities,
    decisions,
    metrics,
    reading,
    turningPoint,
    historyCompare: buildHistoryCompare(decisions, input.score),
    hintIfLose: verdict === 'lose' ? (LOSE_HINT[input.campaignId] ?? GENERIC_HINT) : '',
    sides: { player: input.playerLabel, enemy: input.enemyLabel },
  }
}

function casualtiesOf(input: DebriefInput): { player: number; enemy: number } {
  return input.casualties
}

function buildBattles(log: BattleRecord[], playerLabel: string, enemyLabel: string): DebriefBattle[] {
  return log.map(record => {
    const playerAttack = record.playerSide === 'attacker'
    const playerWon = record.playerSide === 'none'
      ? false
      : (record.winner === record.playerSide)
    const draw = record.winner === 'draw'
    const result: DebriefBattle['result'] = draw ? '平' : playerWon ? '胜' : '败'
    const ourLost = playerAttack ? record.attackerLost : record.defenderLost
    const theirLost = playerAttack ? record.defenderLost : record.attackerLost
    const ourStart = playerAttack ? record.attackerInitial : record.defenderInitial
    const theirStart = playerAttack ? record.defenderInitial : record.attackerInitial
    const ourSeverity = lossSeverity(ourStart > 0 ? ourLost / ourStart : 0)
    const theirSeverity = lossSeverity(theirStart > 0 ? theirLost / theirStart : 0)
    const line = record.ambush
      ? `${playerLabel}于${record.place}设伏，战${record.days}日，${result}（我${ourSeverity}、敌${theirSeverity}）`
      : `${record.place}一战，战${record.days}日，${result}（我${ourSeverity}、敌${theirSeverity}）`
    void enemyLabel
    return {
      place: record.place,
      tick: record.tick,
      days: record.days,
      result,
      ours: ourSeverity,
      theirs: theirSeverity,
      ambush: record.ambush,
      line,
    }
  })
}

function buildCities(log: CityRecord[], factionLabel: (id: string) => string, playerLabel: string): DebriefCity[] {
  return log.map(record => ({
    name: record.name,
    tick: record.tick,
    fromLabel: factionLabel(record.from),
    toLabel: factionLabel(record.to),
    // 「我方得城」与「我方失城」在战报里的措辞不同，这里先算好
    gained: factionLabel(record.to) === playerLabel,
  }))
}

function buildDecisions(
  choices: ChoiceRecord[],
  cityLog: CityRecord[],
  battleLog: BattleRecord[],
  playerFaction: string,
): DebriefDecision[] {
  // 同一个不利事件会被时间窗内的多个决策各命中一次（例如「第16日赤壁失利」连着挂三行），
  // 只让第一个命中它的决策认领这条「之后」，后面的标 em dash。
  const claimed = new Set<string>()
  // 保住已用的「之后」条目：同一个不利事件只归一个决策，后出现的标破折号
  const usedCities = new Set<string>()
  const usedBattles = new Set<string>()
  return choices.map(choice => {
    // 「反噬」：这次决策之后 12 天内，玩家丢掉的第一座城或打输的第一仗
    const window = 12
    const lostCity = cityLog.find(c => c.tick > choice.tick && c.tick <= choice.tick + window && c.from === playerFaction)
    const lostBattle = battleLog.find(b => b.tick > choice.tick && b.tick <= choice.tick + window && b.winner !== 'draw' && b.winner !== b.playerSide && b.playerSide !== 'none')

    const parts: string[] = []
    if (lostCity) {
      const key = lostCity.city + ':' + lostCity.tick
      if (!usedCities.has(key)) { usedCities.add(key); parts.push(`第${lostCity.tick}日失去${lostCity.name}`) }
    }
    if (lostBattle) {
      const key = lostBattle.id + ':' + lostBattle.tick
      if (!usedBattles.has(key)) { usedBattles.add(key); parts.push(`第${lostBattle.tick}日${lostBattle.place}失利`) }
    }
    // 顺手局里没有「反噬」，但不能整列破折号——改填这次决策之后拿下的城或打赢的仗，
    // 决策复盘才有「这一步带来了什么」的读法。
    if (parts.length === 0) {
      const gainedCity = cityLog.find(c => c.tick > choice.tick && c.tick <= choice.tick + window && c.to === playerFaction)
      if (gainedCity) parts.push(`第${gainedCity.tick}日取${gainedCity.name}`)
      const wonBattle = battleLog.find(b => b.tick > choice.tick && b.tick <= choice.tick + window && b.winner !== 'draw' && b.winner === b.playerSide)
      if (wonBattle) parts.push(`第${wonBattle.tick}日${wonBattle.place}得手`)
    }
    // 同一决策里城市与战斗可能指同一件事，两个都写会读成两次损失，只留一个
    const echo = Array.from(new Set(parts)).slice(0, 1).join('、')
    return {
      tick: choice.tick,
      title: choice.title,
      label: choice.label,
      recommended: choice.recommended,
      timeout: choice.timeout,
      echo: echo || undefined,
    }
  })
}

function buildChronicle(
  decisions: DebriefDecision[],
  battles: DebriefBattle[],
  cities: DebriefCity[],
  orders: OrderRecord[],
  log: string[],
  factionLabel: (id: string) => string,
): DebriefLine[] {
  void factionLabel
  const lines: DebriefLine[] = []
  for (const d of decisions) lines.push({ tick: d.tick, kind: 'decision', text: `定策「${d.title}」：${d.label}${d.timeout ? '（逾时依令）' : ''}` })
  for (const b of battles) lines.push({ tick: b.tick, kind: 'battle', text: b.line })
  for (const c of cities) lines.push({ tick: c.tick, kind: 'city', text: `${c.name}由${c.fromLabel}转入${c.toLabel}` })
  for (const o of orders) {
    if (o.result !== 'void') continue
    lines.push({ tick: o.tick, kind: 'order', text: `军令作废：${o.task}${o.reason ? '（' + o.reason + '）' : ''}` })
  }
  // 日志里补编年缺口：只取未被上面三类覆盖的事件，避免重复
  for (const raw of log) {
    const match = raw.match(/^第(\d+)日：(.+)$/)
    if (!match) continue
    const tick = Number(match[1])
    const text = match[2] ?? ''
    if (/之战|接战|会战未分|易手|陷落|——/.test(text)) continue
    lines.push({ tick, kind: 'other', text })
  }
  lines.sort((a, b) => a.tick - b.tick || rank(a.kind) - rank(b.kind))
  return lines
}

function rank(kind: DebriefLine['kind']): number {
  switch (kind) {
    case 'decision': return 0
    case 'battle': return 1
    case 'city': return 2
    case 'order': return 3
    default: return 4
  }
}

function buildMetrics(
  ledgers: Ledgers,
  battles: DebriefBattle[],
  cities: DebriefCity[],
  casualties: { player: number; enemy: number },
  tick: number,
): DebriefMetric[] {
  const won = battles.filter(b => b.result === '胜').length
  const lost = battles.filter(b => b.result === '败').length
  const voidOrders = ledgers.orderLog.filter(o => o.result === 'void').length
  const decisions = ledgers.choiceLog.length
  const deviated = ledgers.choiceLog.filter(c => !c.recommended).length
  return [
    { label: '历时', value: tick + ' 日', hint: '从开局到结束的推演天数' },
    { label: '交战', value: battles.length ? `${battles.length} 阵 · 胜${won} 负${lost}` : '未接战', hint: '实际发生的战斗场次' },
    { label: '我军折损', value: lossBand(casualties.player), hint: '分档展示，不写精确人数' },
    { label: '敌军折损', value: lossBand(casualties.enemy), hint: '分档展示，不写精确人数' },
    { label: '城邑变动', value: cities.length ? `${cities.length} 次易手` : '无变动', hint: '归属发生变化过的城邑' },
    { label: '决策', value: `${decisions} 次${deviated ? `，其中 ${deviated} 次偏离史实` : '，全部依史实思路'}`, hint: '关键节点上的选择' },
    {
      label: '军令',
      value: ledgers.orderLog.length === 0
        ? '未下军令'
        : `${ledgers.orderLog.length - voidOrders} 次生效${voidOrders ? `，${voidOrders} 次作废` : ''}`,
      hint: '作废的军令会给出回执',
    },
  ]
}

function buildReading(parts: ScorePart[]): { label: string; text: string }[] {
  return parts.map(part => {
    const ratio = part.max > 0 ? part.value / part.max : 0
    const grade = ratio >= 0.85 ? '几乎拿满' : ratio >= 0.6 ? '得分尚可' : ratio >= 0.3 ? '只拿到一部分' : '基本没有拿到'
    // 「保存约 0%」是数据上没错、读起来别扭的写法，统一改成人话
    const note = part.note.replace(/保存约 0%/g, '兵力折损殆尽')
    return {
      label: part.label,
      text: `${grade}（${Math.round(part.value)}/${part.max}）：${note}`,
    }
  })
}

function buildTurningPoint(
  battles: DebriefBattle[],
  cities: DebriefCity[],
  decisions: DebriefDecision[],
  campaignId: string,
): { tick: number; text: string } {
  // 转折点只看「真正丢掉的城」，不看我方夺回的城
  const lostCity = cities.find(c => !c.gained && c.fromLabel !== c.toLabel)
  const lostBattle = battles.find(b => b.result === '败')
  const wonBattle = battles.find(b => b.result === '胜' && b.ambush)
  const wonAny = battles.find(b => b.result === '胜')
  // 优先级：首场伏击胜利 > 失城 > 首场败战 > 首个胜战 > 首个决策。
  // 不能简单按日序取最早——那样几乎总会落到「第一日定策」，对玩家没有信息量。
  if (wonBattle) return { tick: wonBattle.tick, text: `${wonBattle.place}伏击得手，战局在此转向` }
  if (lostCity) return { tick: lostCity.tick, text: `${lostCity.name}易手，战线由此被拉开` }
  if (lostBattle) return { tick: lostBattle.tick, text: `${lostBattle.place}失利，此后的主动权不再全在我方` }
  if (wonAny) return { tick: wonAny.tick, text: `${wonAny.place}一战得手，局面就此打开` }
  const decided = decisions[0]
  if (decided) return { tick: decided.tick, text: `${decided.tick === 1 ? '首日' : '第' + decided.tick + '日'}定策「${decided.title}」，这一局的走向在这里就埋下了` }
  void campaignId
  return { tick: 0, text: '这一局没有爆发决定性的战斗，胜负是在对峙与消耗里分开的' }
}

function buildHistoryCompare(decisions: DebriefDecision[], score: Score): { same: string[]; diff: string[] } {
  const same: string[] = []
  const diff: string[] = []
  const recommended = decisions.filter(d => d.recommended)
  const deviated = decisions.filter(d => !d.recommended)
  if (recommended.length) same.push(`${recommended.length} 个节点上走了史书里的那条路（${recommended.map(d => d.title).join('、')}）`)
  if (deviated.length) diff.push(`${deviated.length} 个节点上另辟蹊径（${deviated.map(d => d.title).join('、')}）`)
  const timeout = decisions.filter(d => d.timeout)
  if (timeout.length) diff.push(`${timeout.length} 个节点逾时未决，按默认方案执行`)
  if (score.deviation) same.push(score.deviation)
  const ended = score.endingTitle ? `结局「${score.endingTitle}」：${score.endingText}` : ''
  if (ended) diff.push(ended)
  if (same.length === 0) same.push('这一局没有走史实主线的节点')
  return { same, diff }
}

function buildHeadline(
  verdict: DebriefVerdict,
  endingTitle: string,
  endingText: string,
  battles: DebriefBattle[],
  cities: DebriefCity[],
  playerLabel: string,
): string {
  const won = battles.filter(b => b.result === '胜').length
  const lost = battles.filter(b => b.result === '败').length
  const drawn = battles.length - won - lost
  const fight = battles.length === 0
    ? '全程未与敌军接战'
    : `${playerLabel}共接战 ${battles.length} 阵（胜 ${won}、负 ${lost}${drawn > 0 ? `、平 ${drawn}` : ''}）`
  const city = cities.length === 0 ? '城邑无变动' : `城邑易手 ${cities.length} 次`
  const prefix = verdict === 'abandoned' ? '战至中途，此局作罢。' : ''
  // 胜局但野战全败、或败局但野战多胜，都要点破——否则「胜 0 负 3」后面接一句「大捷」会读着自相矛盾。
  // 本作的胜负手常在关键决策与火攻/自乱这类事件上，不在阵前。
  let caveat = ''
  if (battles.length > 0) {
    if (verdict === 'win' && won === 0) caveat = '野战虽不利，胜负手不在阵前。'
    else if (verdict === 'lose' && lost === 0) caveat = '阵前未败，败在别处。'
  }
  void endingTitle
  return `${prefix}${fight}，${city}。${caveat}${endingText}`
}

/** 纯文本版战报：给「复制文本」用，不落文件、不触平台 UGC 规则 */
export function debriefToText(debrief: Debrief, meta: { campaignTitle: string; grade: string; total: number }): string {
  const out: string[] = []
  out.push(`【${meta.campaignTitle}】${debrief.verdictLabel} · 评级 ${meta.grade} · ${Math.round(meta.total)} 分`)
  out.push('')
  out.push(debrief.headline)
  out.push('')
  out.push('—— 战报 ——')
  for (const line of debrief.chronicle) {
    out.push(`第${line.tick}日 ${line.text}`)
  }
  out.push('')
  out.push('—— 战役分析 ——')
  for (const m of debrief.metrics) out.push(`${m.label}：${m.value}`)
  out.push('')
  for (const r of debrief.reading) out.push(`${r.label}：${r.text}`)
  out.push('')
  if (debrief.turningPoint.text) out.push(`关键转折：第${debrief.turningPoint.tick}日，${debrief.turningPoint.text}`)
  if (debrief.historyCompare.same.length) {
    out.push('')
    out.push('贴近史实之处：')
    for (const s of debrief.historyCompare.same) out.push('  · ' + s)
  }
  if (debrief.historyCompare.diff.length) {
    out.push('')
    out.push('与史实不同之处：')
    for (const s of debrief.historyCompare.diff) out.push('  · ' + s)
  }
  if (debrief.hintIfLose) {
    out.push('')
    out.push('如果当时：' + debrief.hintIfLose)
  }
  return out.join('\n')
}
