import type {
  Campaign as LegacyCampaign, Difficulty, DifficultyId, Narrative, OpsCampaign, OpsNarrative, OpsRules,
} from '@aiwar/sim'
import { registerRules, TASK_LABELS } from '@aiwar/sim'
import { guilingCampaign, narrator } from './index.js'
import { siduCampaign } from './ops/siduchishui/data.js'
import siduRules from './ops/siduchishui/rules.js'
import { makeOpsNarrator, MODERN_CORPUS } from './ops/narrator.js'
import { SIDU_CORPUS } from './ops/siduchishui/corpus.js'
import { HUAIHAI_CORPUS } from './ops/huaihai/corpus.js'
import { FEISHUI_CORPUS } from './ops/feishui/corpus.js'
import { CHIBI_CORPUS } from './ops/chibi/corpus.js'
import { huaihaiCampaign } from './ops/huaihai/data.js'
import huaihaiRules from './ops/huaihai/rules.js'
import { feishuiCampaign } from './ops/feishui/data.js'
import feishuiRules from './ops/feishui/rules.js'
import { chibiCampaign } from './ops/chibi/data.js'
import chibiRules from './ops/chibi/rules.js'

export interface TaskOption { id: string; label: string }

export interface PackMeta {
  title: string
  subtitle: string
  era: string
  blurb: string
  dateLabel: string
  startLabel: string
  playerRole: string
  background: string
  objective: string
  infoTip: string
  history: { title: string; text: string }[]
  disclaimer: string
}

export interface PackBase {
  id: string
  engine: 'legacy' | 'ops'
  meta: PackMeta
  difficulty: Record<DifficultyId, Difficulty>
  tasks: TaskOption[]
  unitsLabel: string
  enemyLabel: string
}

export interface LegacyPack extends PackBase {
  engine: 'legacy'
  campaign: LegacyCampaign
  narrative: Narrative
}

export interface OpsPack extends PackBase {
  engine: 'ops'
  campaign: OpsCampaign
  narrative: OpsNarrative
  rules: OpsRules
}

export type Pack = LegacyPack | OpsPack

const GUILING_TASKS: TaskOption[] = Object.entries(TASK_LABELS).map(([id, label]) => ({ id, label }))

export const guilingPack: LegacyPack = {
  id: guilingCampaign.meta.id,
  engine: 'legacy',
  meta: {
    title: guilingCampaign.meta.title,
    subtitle: guilingCampaign.meta.subtitle,
    era: '战国',
    blurb: '魏军围赵都邯郸，齐国该直趋邯郸，还是疾走大梁攻其必救？',
    dateLabel: guilingCampaign.meta.dateLabel,
    startLabel: guilingCampaign.meta.startLabel,
    playerRole: '齐国最高决策层（齐王 / 田忌、孙膑的军前决策）',
    background: guilingCampaign.meta.background,
    objective: guilingCampaign.meta.objective,
    infoTip: guilingCampaign.meta.infoTip,
    history: guilingCampaign.meta.history,
    disclaimer: guilingCampaign.meta.disclaimer,
  },
  difficulty: guilingCampaign.difficulty,
  tasks: GUILING_TASKS,
  unitsLabel: '齐军',
  enemyLabel: '魏军',
  campaign: guilingCampaign,
  narrative: narrator,
}

export const siduchishuiPack: OpsPack = {
  id: siduCampaign.meta.id,
  engine: 'ops',
  meta: {
    title: siduCampaign.meta.title,
    subtitle: siduCampaign.meta.subtitle,
    era: siduCampaign.meta.era,
    blurb: siduCampaign.meta.premise,
    dateLabel: siduCampaign.meta.dateLabel,
    startLabel: siduCampaign.meta.startLabel,
    playerRole: siduCampaign.meta.playerRole,
    background: siduCampaign.meta.background,
    objective: siduCampaign.meta.objective,
    infoTip: siduCampaign.meta.infoTip,
    history: siduCampaign.meta.dossier,
    disclaimer: siduCampaign.meta.disclaimer,
  },
  difficulty: siduCampaign.difficulty,
  tasks: [
    { id: 'march', label: '行军' }, { id: 'feint', label: '佯动' }, { id: 'assault', label: '强攻' },
    { id: 'ambush', label: '设伏' }, { id: 'retreat', label: '撤退' }, { id: 'rest', label: '休整' },
    { id: 'forage', label: '筹粮' }, { id: 'scout', label: '侦察' }, { id: 'cross', label: '渡河' },
    { id: 'hold', label: '驻守' },
  ],
  unitsLabel: '红军',
  enemyLabel: '国民党军',
  campaign: siduCampaign,
  // 专属语料接在通用语料之后：同一 key 的句子池相加，战役特有的句子优先被抽到
  narrative: makeOpsNarrator(SIDU_CORPUS),
  rules: siduRules,
}

export const huaihaiPack: OpsPack = {
  id: huaihaiCampaign.meta.id, engine: 'ops',
  meta: {
    title: huaihaiCampaign.meta.title, subtitle: huaihaiCampaign.meta.subtitle, era: huaihaiCampaign.meta.era,
    blurb: huaihaiCampaign.meta.premise, dateLabel: huaihaiCampaign.meta.dateLabel, startLabel: huaihaiCampaign.meta.startLabel,
    playerRole: huaihaiCampaign.meta.playerRole, background: huaihaiCampaign.meta.background,
    objective: huaihaiCampaign.meta.objective, infoTip: huaihaiCampaign.meta.infoTip,
    history: huaihaiCampaign.meta.dossier, disclaimer: huaihaiCampaign.meta.disclaimer,
  },
  difficulty: huaihaiCampaign.difficulty,
  tasks: [
    { id: 'march', label: '行军' }, { id: 'feint', label: '佯动' }, { id: 'assault', label: '强攻' },
    { id: 'ambush', label: '设伏' }, { id: 'pursue', label: '追击' }, { id: 'retreat', label: '撤退' },
    { id: 'rest', label: '休整' }, { id: 'forage', label: '筹粮' }, { id: 'scout', label: '侦察' },
    { id: 'hold', label: '驻守' }, { id: 'strike', label: '突击' },
  ],
  unitsLabel: '解放军', enemyLabel: '国民党军',
  // 淮海是近代战役：通用语料里的「斥候 / 边亭 / 朝议」会出戏，这里叠加现代写法
  campaign: huaihaiCampaign, narrative: makeOpsNarrator({ ...MODERN_CORPUS, ...HUAIHAI_CORPUS }), rules: huaihaiRules,
}

export const feishuiPack: OpsPack = {
  id: feishuiCampaign.meta.id, engine: 'ops',
  meta: {
    title: feishuiCampaign.meta.title, subtitle: feishuiCampaign.meta.subtitle, era: feishuiCampaign.meta.era,
    blurb: feishuiCampaign.meta.premise, dateLabel: feishuiCampaign.meta.dateLabel, startLabel: feishuiCampaign.meta.startLabel,
    playerRole: feishuiCampaign.meta.playerRole, background: feishuiCampaign.meta.background,
    objective: feishuiCampaign.meta.objective, infoTip: feishuiCampaign.meta.infoTip,
    history: feishuiCampaign.meta.dossier, disclaimer: feishuiCampaign.meta.disclaimer,
  },
  difficulty: feishuiCampaign.difficulty,
  tasks: [
    { id: 'march', label: '行军' }, { id: 'feint', label: '佯动' }, { id: 'assault', label: '强攻' },
    { id: 'ambush', label: '设伏' }, { id: 'pursue', label: '追击' }, { id: 'retreat', label: '撤退' },
    { id: 'rest', label: '休整' }, { id: 'forage', label: '筹粮' }, { id: 'scout', label: '侦察' },
    { id: 'hold', label: '驻守' },
  ],
  unitsLabel: '晋军', enemyLabel: '秦军',
  campaign: feishuiCampaign, narrative: makeOpsNarrator(FEISHUI_CORPUS), rules: feishuiRules,
}

export const chibiPack: OpsPack = {
  id: chibiCampaign.meta.id, engine: 'ops',
  meta: {
    title: chibiCampaign.meta.title, subtitle: chibiCampaign.meta.subtitle, era: chibiCampaign.meta.era,
    blurb: chibiCampaign.meta.premise, dateLabel: chibiCampaign.meta.dateLabel, startLabel: chibiCampaign.meta.startLabel,
    playerRole: chibiCampaign.meta.playerRole, background: chibiCampaign.meta.background,
    objective: chibiCampaign.meta.objective, infoTip: chibiCampaign.meta.infoTip,
    history: chibiCampaign.meta.dossier, disclaimer: chibiCampaign.meta.disclaimer,
  },
  difficulty: chibiCampaign.difficulty,
  tasks: [
    { id: 'march', label: '行军' }, { id: 'feint', label: '佯动' }, { id: 'assault', label: '强攻' },
    { id: 'ambush', label: '设伏' }, { id: 'pursue', label: '追击' }, { id: 'retreat', label: '撤退' },
    { id: 'rest', label: '休整' }, { id: 'forage', label: '筹粮' }, { id: 'scout', label: '侦察' },
    { id: 'cross', label: '渡江' }, { id: 'hold', label: '驻守' },
  ],
  unitsLabel: '联军', enemyLabel: '曹军',
  campaign: chibiCampaign, narrative: makeOpsNarrator(CHIBI_CORPUS), rules: chibiRules,
}

export const PACKS: Pack[] = [guilingPack, siduchishuiPack, huaihaiPack, feishuiPack, chibiPack]

// 规则注册表此前只有测试在用：生产路径上 getRules() 必抛「未注册的战役规则」。
// 这里按 pack 注册一遍（Map.set 幂等），让 rulesId → 规则 的契约真正可用。
for (const pack of PACKS) if (pack.engine === 'ops') registerRules(pack.rules)

export function getPack(id: string): Pack {
  return PACKS.find(p => p.id === id) ?? guilingPack
}