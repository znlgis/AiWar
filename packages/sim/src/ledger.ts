// 战役账本：只增不删的记录，供结算页生成战报与战役分析。
//
// 设计约束（很关键）：
// 1. 只 push，不参与任何判定 → seed + 决策串的推演结果保持逐位一致，回归测试的
//    评级/分数不变。改这里不应该让任何一局的胜负发生变化。
// 2. 旧存档没有这些字段，读取时按空数组兜底（见 normalizeLedgers），不抛错。
// 3. 时间口径统一用「日序」= 游戏内第 N 日（tick 从 0 起，日序从 1 起），
//    与 state.log 里的「第N日」以及战报流里的「发出 第N日」一致。

export interface BattleRecord {
  /** 战斗编号，与 Battle.id / OpsBattle.id 同源，便于与战斗日志对照 */
  id: string
  /** 交战地点（城邑名或路段名） */
  place: string
  /** 战斗发生的城邑 id（野战遭遇时为空） */
  city?: string
  /** 开战日序 */
  tick: number
  /** 持续天数 */
  days: number
  /** 攻方累计折损（人数，仅用于分档展示） */
  attackerLost: number
  /** 守方累计折损 */
  defenderLost: number
  /** 攻方初始兵力 */
  attackerInitial: number
  /** 守方初始兵力 */
  defenderInitial: number
  /** 胜负：攻方胜 / 守方胜 / 未分 */
  winner: 'attacker' | 'defender' | 'draw'
  /** 是否伏击战 */
  ambush: boolean
  /** 是否玩家一方（用于战报里标记「我军」） */
  playerSide: 'attacker' | 'defender' | 'none'
}

export interface CityRecord {
  city: string
  name: string
  /** 易手日序 */
  tick: number
  from: string
  to: string
  cause: 'assault' | 'siege' | 'empty'
}

export interface ChoiceRecord {
  nodeId: string
  optionId: string
  /** 决定日序 */
  tick: number
  title: string
  label: string
  /** 是否为史实推荐项 */
  recommended: boolean
  /** 是否逾时按默认方案执行 */
  timeout: boolean
}

export interface OrderRecord {
  tick: number
  task: string
  armyIds: string[]
  target?: string
  result: 'ok' | 'void'
  /** 军令失效原因（无路可走、无舟楫等） */
  reason?: string
}

export interface Ledgers {
  battleLog: BattleRecord[]
  cityLog: CityRecord[]
  choiceLog: ChoiceRecord[]
  orderLog: OrderRecord[]
}

export function emptyLedgers(): Ledgers {
  return { battleLog: [], cityLog: [], choiceLog: [], orderLog: [] }
}

/** 旧存档兼容：四个账本缺失时补空数组，存在但类型不对时同样兜底 */
export function normalizeLedgers(raw: Partial<Ledgers> | undefined | null): Ledgers {
  const pick = <T,>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : [])
  return {
    battleLog: pick(raw?.battleLog),
    cityLog: pick(raw?.cityLog),
    choiceLog: pick(raw?.choiceLog),
    orderLog: pick(raw?.orderLog),
  }
}

/** 兵力的定性分档：战报里不写精确人数，与结算页口径一致 */
export function lossBand(n: number): string {
  const v = Math.max(0, Math.round(n))
  if (v >= 100000) return '十余万'
  if (v >= 50000) return '五至十万'
  if (v >= 20000) return '二至五万'
  if (v >= 10000) return '万余'
  if (v >= 3000) return '数千'
  if (v >= 1000) return '千余'
  if (v > 0) return '数百'
  return '无几'
}

// ---------- 账本写入入口 ----------
// 这些函数只做 push，返回 void。任何判定逻辑都不许读账本，以免记录本身
// 影响推演结果。旧存档缺字段时按需临时补数组，不抛错。

interface LedgerHost {
  battleLog?: BattleRecord[]
  cityLog?: CityRecord[]
  choiceLog?: ChoiceRecord[]
  orderLog?: OrderRecord[]
}

export function recordBattle(host: LedgerHost, record: BattleRecord): void {
  ;(host.battleLog ?? (host.battleLog = [])).push(record)
}

export function recordCity(host: LedgerHost, record: CityRecord): void {
  ;(host.cityLog ?? (host.cityLog = [])).push(record)
}

export function recordChoice(host: LedgerHost, record: ChoiceRecord): void {
  ;(host.choiceLog ?? (host.choiceLog = [])).push(record)
}

export function recordOrder(host: LedgerHost, record: OrderRecord): void {
  ;(host.orderLog ?? (host.orderLog = [])).push(record)
}

/** 折损占出发兵力之比 → 定性描述 */
export function lossSeverity(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '未折损'
  if (ratio < 0.05) return '小挫'
  if (ratio < 0.15) return '折损'
  if (ratio < 0.3) return '损兵'
  if (ratio < 0.5) return '大损'
  return '溃散'
}
