import type { OpsNarrative } from '@aiwar/sim'

type Corpus = Record<string, string[]>

// 通用战报语料必须跨时代可用：引擎直接发出的 key（接战、溃败、围城、断粮、情报）
// 不允许出现枪炮、电台、番号、建制这类现代军语——208 年长江与 383 年淝水都会用到它。
const BASE: Corpus = {
  'battle.start': [
    '{place}方向接战，鼓角相闻。',
    '我军与敌于{place}遭遇，正在展开。',
    '{place}附近发生战斗，规模尚不清楚。',
  ],
  'battle.ambush_start': [
    '敌先头进入{place}，我军伏兵骤起。',
    '{place}两侧突有伏兵，敌军行列被打乱。',
  ],
  'battle.rout': [
    '{place}战斗结束，{winner}得手，{loser}后撤。',
    '{loser}退出{place}，{winner}占据战场。',
  ],
  'battle.ambush_win': [
    '{place}伏击得手，敌军先头溃散。',
    '{place}一战，敌军措手不及，向后溃退。',
  ],
  'battle.annihilated': [
    '{place}一战，被围之敌溃散，不复成军。',
    '{place}方向敌军已被围歼，战场上已无成建制的抵抗。',
  ],
  'battle.draw': [
    '{place}战斗相持，双方均未得手。',
  ],
  'siege.start': [
    '我军逼近{city}，敌军据城而守。',
  ],
  'siege.fall': [
    '{city}易手，{side}控制该地。',
  ],
  'supply.low': [
    '{army}粮食将尽，需就近筹粮。',
  ],
  'supply.empty': [
    '{army}已断粮，部众开始散去。',
  ],
  'supply.threat': [
    '{place}一带补给线受威胁。',
  ],
  'intel.sighting': [
    '{place}方向发现敌军约{band}，旗号未明。',
    '侦察报告：{place}有敌军{band}，行动方向待查。',
    '{place}出现敌军{band}，来源可靠度中等。',
  ],
  'intel.march': [
    '敌军自{place}开动，去向不明。',
    '{place}方向敌军有移动迹象，约{band}。',
  ],
  'politics.ring': [
    '敌军数路向{place}方向收拢，合围之势渐成。',
    '侦察发现周边敌军调动频繁，似在收口。',
  ],
  'politics.feint': [
    '我军一部向东佯动，敌军各处回报都说我军主力东进。',
    '佯动奏效：敌军开始向{place}方向调动。',
  ],
  'politics.ferry': [
    '渡口已控制，船只与船工正在集中。',
    '渡河开始：船只往返，全军分批而过。',
  ],
  'politics.chase': [
    '追兵距我后卫不足一日路程。',
    '敌军前锋逼近，后卫需阻击。',
  ],
  'river.cross': [
    '我军已渡河，敌追击稍缓。',
    '渡河完成，部队在对岸集结。',
  ],
  'opening.situation': [
    '军情传来，各军按既定方向开进，敌情尚未查明。',
  ],
  'decision': ['军前会议结束，命令下达。'],
  'decision.opt1': ['决定已下：全军按第一方案行动。'],
  'decision.opt2': ['决定已下：按第二方案行动。'],
  'decision.opt3': ['决定已下：按第三方案行动。'],
  'decision.opt4': ['决定已下：按第四方案行动。'],
  'node.open': ['军情急报：{title}，请即决断。'],
  'order.blocked': [
    '{army}无法前进：{reason}。军令已废，请另下命令。',
  ],
}

function fill(t: string, p: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => p[k] ?? '')
}

export function makeOpsNarrator(extra: Corpus = {}): OpsNarrative {
  const corpus: Corpus = {}
  // 战役专属语料排在通用语料之前：抽取按 salt % length 取，若通用语料在前，
  // 只要它的句子池没被抽完，专属语料永远轮不到——白写。
  for (const key of new Set([...Object.keys(BASE), ...Object.keys(extra)])) {
    corpus[key] = [...(extra[key] ?? []), ...(BASE[key] ?? [])]
  }
  return {
    line(kind: string, params: Record<string, string>, salt: number): string {
      const pool = corpus[kind]
      if (!pool || pool.length === 0) return ''
      return fill(pool[Math.abs(salt) % pool.length] ?? pool[0]!, params)
    },
  }
}

// 近代战役的追加语料：同一批 key 追加现代写法，古代战役不会拿到这些词。
// 用法：makeOpsNarrator({ ...MODERN_CORPUS, ...战役专属语料 })
export const MODERN_CORPUS: Corpus = {
  'battle.start': [
    '{place}方向接战，枪炮声可闻。',
    '{place}附近发生战斗，规模尚不清楚。',
  ],
  'battle.rout': [
    '{place}战斗结束，{winner}得手，{loser}后撤。',
  ],
  'battle.annihilated': [
    '{place}一战，被围之敌建制瓦解，不再成军。',
  ],
  'supply.low': [
    '{army}粮食弹药将尽，需就近筹措。',
  ],
  'supply.empty': [
    '{army}已断粮，部队开始掉队。',
  ],
  'intel.sighting': [
    '{place}方向发现敌军约{band}，番号不详。',
    '侦察报告：{place}有敌军{band}，行动方向待查。',
  ],
  'politics.feint': [
    '我军一部向东佯动，敌军电台与侦察报告均称我军主力东进。',
  ],
}

export type { Corpus }
