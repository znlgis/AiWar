// 通用战役引擎类型：支持任意战役（陆战/水战/20世纪战役）复用同一套推演内核。
import type {
  Confidence, DecisionNodeDef, Difficulty, DifficultyId, FactionId, Report, ScorePart, SourceId, Trace,
} from './types.js'

export type OpsTerrain = 'plain' | 'mountain' | 'river' | 'city' | 'water'
export type OpsTroopType = 'infantry' | 'armor' | 'cavalry' | 'fleet' | 'mixed'
export type OpsTask =
  | 'march' | 'hold' | 'feint' | 'assault' | 'ambush' | 'pursue'
  | 'retreat' | 'rest' | 'forage' | 'scout' | 'cross' | 'defect' | 'strike'

export interface OpsCityDef {
  id: string
  name: string
  x: number
  y: number
  owner: FactionId
  /** road：只有通道意义、不设守军的节点（如华容道这类行军路线） */
  kind: 'capital' | 'city' | 'fort' | 'port' | 'road'
  terrain?: OpsTerrain
  garrison: number
  wall: number
  grain: number
}

export interface OpsRoadDef {
  id: string
  from: string
  to: string
  days: number
  kind: 'road' | 'water' | 'river' | 'mountain' | 'rail'
  name?: string
}

export interface OpsArmyDef {
  id: string
  name: string
  faction: FactionId
  commander: string
  troops: number
  type: OpsTroopType
  morale: number
  fatigue: number
  training: number
  foodDays: number
  city: string
  naval?: boolean
  stealth?: number
}

export interface OpsCityState extends OpsCityDef {
  morale: number
  known: boolean
  besieged: boolean
  initialGarrison: number
}

export interface OpsArmyState {
  id: string
  name: string
  faction: FactionId
  commander: string
  troops: number
  initialTroops: number
  type: OpsTroopType
  morale: number
  fatigue: number
  training: number
  foodDays: number
  pos: { kind: 'city'; city: string } | { kind: 'road'; road: string; from: string; to: string; progress: number }
  order: { task: OpsTask; target?: string; sinceTick: number; arrived: boolean; waitTicks: number } | null
  route: string[]
  supply: 'ok' | 'threatened' | 'cut'
  inBattle: string | null
  removed: boolean
  stealth: number
  naval: boolean
  /** 最近一次行进推进的 tick：一天只推进一次，避免主循环调用两次 moveArmies 把路程压缩一半 */
  lastMoveTick?: number
}

export interface OpsOrder {
  id: string
  task: OpsTask
  armyIds: string[]
  target?: string
  issuedTick: number
  arriveTick: number
}

export interface OpsBattle {
  id: string
  place: string
  city?: string
  attackerIds: string[]
  defenderIds: string[]
  days: number
  ambush: boolean
  attackerInitial: number
  defenderInitial: number
  log: string[]
}

export interface OpsBalance {
  battleIntensity: number
  ambushMultiplier: number
  routTroopRatio: number
  routMorale: number
  supplyFactor: number
  maxFoodDays: number
  resupplyDays: number
  siegeGarrisonLoss: number
  siegeGrainLoss: number
  desertionPerDay: number
  /** 单日攻击方损失上限（占兵力比），用于大兵团攻坚 */
  attackerLossCap?: number
  /** 单日守方损失上限 */
  defenderLossCap?: number
}

export interface OpsCampaignMeta {
  id: string
  title: string
  subtitle: string
  era: string
  premise: string
  dateLabel: string
  startLabel: string
  playerRole: string
  background: string
  objective: string
  infoTip: string
  dossier: { title: string; text: string }[]
  disclaimer: string
}

export interface OpsCampaign {
  meta: OpsCampaignMeta
  playerFaction: FactionId
  enemyFactions: FactionId[]
  factions: Record<string, { name: string; color: string; short: string }>
  mapWidth: number
  mapHeight: number
  cities: OpsCityDef[]
  roads: OpsRoadDef[]
  armies: OpsArmyDef[]
  decisions: DecisionNodeDef[]
  difficulty: Record<DifficultyId, Difficulty>
  balance: OpsBalance
  weather: { id: string; label: string }[]
  rulesId: string
}

export interface OpsState {
  campaignId: string
  tick: number
  seed: number
  difficulty: DifficultyId
  playerFaction: FactionId
  cities: Record<string, OpsCityState>
  roads: OpsRoadDef[]
  armies: Record<string, OpsArmyState>
  armyOrder: string[]
  reports: Report[]
  traces: Trace[]
  battles: OpsBattle[]
  pendingNode: string | null
  resolvedNodes: string[]
  orders: OpsOrder[]
  tokens: number
  lastTokenTick: number
  flags: Record<string, number>
  vars: Record<string, number>
  /** 战斗中暂存的玩家行军命令（战后恢复） */
  orderMemory?: Record<string, { task: OpsTask; target?: string; sinceTick: number; arrived: boolean; waitTicks: number }>
  weather: string
  weatherNext: number
  casualties: Record<string, number>
  citiesTaken: string[]
  over: boolean
  endingId: string | null
  log: string[]
  reportSeq: number
  battleSeq: number
  narrativeSalt: number
}

export interface OpsHud {
  pressureText: string
  objectiveText: string
  stageText: string
}

export interface OpsScore {
  grade: 'S' | 'A' | 'B' | 'C' | 'D'
  total: number
  parts: ScorePart[]
  endingId: string
  endingTitle: string
  endingText: string
  deviation: string
  highlights: { label: string; value: string }[]
  lines: string[]
}

export interface OpsRules {
  id: string
  opening(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative): void
  triggerNode(state: OpsState, campaign: OpsCampaign): string | null
  applyDecision(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative, nodeId: string, optionId: string): void
  aiTick(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative): void
  checkEnd(state: OpsState, campaign: OpsCampaign): void
  score(state: OpsState, campaign: OpsCampaign): OpsScore
  onTick?(state: OpsState, campaign: OpsCampaign, narrative: OpsNarrative): void
  onBattleResolved?(state: OpsState, campaign: OpsCampaign, battle: OpsBattle, winner: 'attacker' | 'defender' | 'draw', narrative: OpsNarrative): void
  onCityCaptured?(state: OpsState, campaign: OpsCampaign, city: OpsCityState, by: FactionId, narrative: OpsNarrative): void
  powerMod?(state: OpsState, campaign: OpsCampaign, armyId: string, side: 'attacker' | 'defender'): number
  hud?(state: OpsState, campaign: OpsCampaign): OpsHud
}

export interface OpsNarrative {
  line(kind: string, params: Record<string, string>, salt: number): string
}