// 推演内核的公共类型契约。content 与 UI 只依赖这一层。
import type { BattleRecord, CityRecord, ChoiceRecord, OrderRecord } from './ledger.js'

// 战役自定义阵营：围魏救赵用 qi/wei/...，新战役可用 red/kmt/... 等任意字符串
export type FactionId = string
export type DifficultyId = 'hist' | 'normal' | 'hard' | 'hell'
export type CityKind = 'capital' | 'city' | 'fort' | 'port'
export type RoadKind = 'road' | 'pass' | 'river'

export type Task =
  | 'march' | 'hold' | 'feint' | 'assault' | 'ambush'
  | 'pursue' | 'retreat' | 'rest' | 'forage' | 'scout' | 'envoy'

export type Modifier = 'forced' | 'stealth' | 'feignWeak' | 'night' | 'dropBaggage'

export type SourceId = 'scout' | 'border' | 'deserter' | 'merchant' | 'envoy' | 'court' | 'counsel' | 'note'
export type Confidence = 'high' | 'mid' | 'low'
export type SupplyState = 'ok' | 'threatened' | 'cut'
export type Weather = 'clear' | 'rain' | 'snow' | 'fog'

export interface Troops {
  chariot: number
  infantry: number
  cavalry: number
  crossbow: number
}

export interface CityDef {
  id: string
  name: string
  x: number
  y: number
  kind: CityKind
  owner: FactionId
  wall: number
  garrison: number
  grain: number
}

export interface RoadDef {
  id: string
  from: string
  to: string
  days: number
  kind?: RoadKind
  name?: string
}

export interface ArmyDef {
  id: string
  name: string
  faction: FactionId
  commander: string
  troops: Troops
  morale: number
  fatigue: number
  training: number
  foodDays: number
  city: string
}

export interface CityState extends CityDef {
  morale: number
  unrest: number
  known: boolean
  contested: boolean
  initialGarrison: number
  initialWall: number
  besieged: boolean
}

export interface ArmyPosition {
  kind: 'city' | 'road'
  city?: string
  road?: string
  from?: string
  to?: string
  progress: number
}

export interface AppliedOrder {
  task: Task
  target?: string
  modifier: Modifier[]
  sinceTick: number
  arrived: boolean
  waitTicks: number
}

export interface ArmyState {
  id: string
  name: string
  faction: FactionId
  commander: string
  troops: Troops
  initialTroops: number
  morale: number
  fatigue: number
  training: number
  foodDays: number
  pos: ArmyPosition
  order: AppliedOrder | null
  route: string[]
  stealth: number
  supply: SupplyState
  inBattle: string | null
  removed: boolean
}

export interface Order {
  id: string
  task: Task
  armyIds: string[]
  target?: string
  modifier: Modifier[]
  issuedTick: number
  arriveTick: number
}

export interface Report {
  id: string
  tick: number
  arriveTick: number
  source: SourceId
  place: string
  confidence: Confidence
  text: string
  important: boolean
}

export interface Trace {
  armyId: string
  faction: FactionId
  place: string
  city?: string
  road?: string
  seenTick: number
  band: string
  confidence: Confidence
}

/**
 * 地图上的地形要素（山系、河流、湖泊、海岸、关隘）。
 * 纯渲染数据，不参与推演：加它不会改变任何一局的胜负，只是让地图不再只有点和线。
 */
export interface MapTerrain {
  kind: 'ridge' | 'river' | 'lake' | 'coast' | 'pass'
  name?: string
  /** 折线点列（画布坐标）。lake/coast 为闭合面，其余为线 */
  points: [number, number][]
  /** 线宽档位，缺省按 kind 决定 */
  weight?: 1 | 2 | 3
}

export interface Battle {
  id: string
  place: string
  city?: string
  attackerIds: string[]
  defenderIds: string[]
  days: number
  ambush: boolean
  attackerInitial: number
  defenderInitial: number
  /** 逐日累计折损，供战报结算用；缺失时按 0 处理 */
  attackerLost?: number
  defenderLost?: number
  /** 开战日序；老存档无此字段时由记录处兜底 */
  firstTick?: number
  log: string[]
}

export interface Difficulty {
  id: DifficultyId
  name: string
  label: string
  intelDelay: number
  strengthError: number
  falseReportPerTenDays: number
  scoutEfficiency: number
  enemyIntelQuality: number
  feintBreakChance: number
  decisionSeconds: number
  supplyFactor: number
  scoreFactor: number
  defaultQuality: number
}

export interface DecisionOptionDef {
  id: string
  label: string
  desc: string
  hint?: string
  recommended?: boolean
}

export interface DecisionNodeDef {
  id: string
  title: string
  prompt: string
  options: DecisionOptionDef[]
  defaultOption: string
}

export interface CampaignMeta {
  id: string
  title: string
  subtitle: string
  dateLabel: string
  startLabel: string
  background: string
  objective: string
  infoTip: string
  history: { title: string; text: string }[]
  disclaimer: string
}

export interface ScoreWeights {
  objective: number
  weiLoss: number
  qiPreserve: number
  zhaoSurvive: number
  cities: number
  diplomacy: number
  logistics: number
  historyEcho: number
}

export interface Roles {
  weiFieldArmy: string
  zhaoCapital: string
  weiCapital: string
  zhaoNorth: string
  qiStaging: string
  ambushSites: string[]
}

export interface Balance {
  battleIntensity: number
  ambushMultiplier: number
  wallDefense: number
  foodConsumption: number
  resupplyDays: number
  maxFoodDays: number
  routTroopRatio: number
  routMorale: number
  desertionPerDay: number
  siegeGarrisonLoss: number
  siegeGrainLoss: number
  weiPressurePerThreat: number
  weiPressureDecay: number
  returnOrderThreshold: number
  zhaoFallRatio: number
}

export interface Campaign {
  meta: CampaignMeta
  /** 战场地形：山系、河流、湖泊、关隘。纯渲染用，不参与推演 */
  terrain?: MapTerrain[]
  playerFaction: FactionId
  maxTicks: number
  factions: Record<FactionId, { name: string; color: string; short: string }>
  cities: CityDef[]
  roads: RoadDef[]
  armies: ArmyDef[]
  decisions: DecisionNodeDef[]
  difficulty: Record<DifficultyId, Difficulty>
  balance: Balance
  roles: Roles
  weights: ScoreWeights
}

export interface ScorePart {
  key: string
  label: string
  value: number
  max: number
  note: string
}

export interface Score {
  grade: 'S' | 'A' | 'B' | 'C' | 'D'
  /** 结算页展示的双方称呼，缺省用齐/魏 */
  sides?: { player: string; enemy: string }
  total: number
  parts: ScorePart[]
  endingId: string
  endingTitle: string
  endingText: string
  deviation: string
  highlights?: { label: string; value: string }[]
  lines?: string[]
  facts?: {
    qiLost: number
    weiLost: number
    /** 与 qiLost/weiLost 同值的通用字段：非围魏救赵战役用它显示双方折损 */
    playerLost?: number
    enemyLost?: number
    zhaoSurvived: boolean
    citiesTaken: string[]
    days: number
    ambush: boolean
    lines: string[]
  }
}

export interface GameState {
  campaignId: string
  tick: number
  seed: number
  difficulty: DifficultyId
  playerFaction: FactionId
  cities: Record<string, CityState>
  roads: RoadDef[]
  armies: Record<string, ArmyState>
  armyOrder: string[]
  reports: Report[]
  traces: Trace[]
  battles: Battle[]
  pendingNode: string | null
  resolvedNodes: string[]
  orders: Order[]
  tokens: number
  lastTokenTick: number
  flags: Record<string, number>
  politics: {
    weiPressure: number
    weiOrderedReturn: boolean
    pangjuanReturning: boolean
    pangjuanReturnSince: number
    pangjuanDelays: number
    chuCommitTick: number
    qinCommitTick: number
    songAttitude: number
    weiStateAttitude: number
    zhaoMorale: number
  }
  weather: Weather
  weatherNext: number
  casualties: { qi: number; wei: number; zhao: number }
  citiesTaken: string[]
  decisionWindowEnd: number | null
  over: boolean
  endingId: string | null
  score: Score | null
  log: string[]
  /** 以下四个账本只增不删，供结算页生成战报；旧存档缺省时按空数组处理 */
  battleLog: BattleRecord[]
  cityLog: CityRecord[]
  choiceLog: ChoiceRecord[]
  orderLog: OrderRecord[]
  reportSeq: number
  battleSeq: number
  narrativeSalt: number
}

export interface Narrative {
  line(kind: string, params: Record<string, string>, salt: number): string
  ending(id: string): { title: string; text: string }
}

export interface CreateOptions {
  campaign: Campaign
  difficulty: DifficultyId
  seed: number
}

export interface TickResult {
  reports: Report[]
  pendingNode: string | null
  over: boolean
  events: string[]
}

export const FACTIONS: FactionId[] = ['qi', 'wei', 'zhao', 'song', 'wei_state', 'chu', 'qin']