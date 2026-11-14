import type { OpsNarrative } from '@aiwar/sim'

type Corpus = Record<string, string[]>

const BASE: Corpus = {
  'battle.start': [
    '{place}方向接战，枪声与炮声可闻。',
    '我军与敌于{place}遭遇，正在展开。',
    '{place}附近发生战斗，规模尚不清楚。',
  ],
  'battle.ambush_start': [
    '敌先头进入{place}，我军伏兵突然开火。',
    '{place}两侧响起枪声，敌军行军纵队被打乱。',
  ],
  'battle.rout': [
    '{place}战斗结束，{winner}得手，{loser}后撤。',
    '{loser}退出{place}，{winner}占据战场。',
  ],
  'battle.ambush_win': [
    '{place}伏击得手，敌军先头被击溃。',
    '{place}一战，敌军措手不及，向后溃退。',
  ],
  'battle.draw': [
    '{place}战斗相持，双方均未得手。',
  ],
  'siege.start': [
    '我军逼近{city}，敌据城而守。',
  ],
  'siege.fall': [
    '{city}易手，{side}控制该地。',
  ],
  'supply.low': [
    '{army}粮食将尽，需就近筹粮。',
  ],
  'supply.empty': [
    '{army}已断粮，部队开始掉队。',
  ],
  'supply.threat': [
    '{place}一带补给线受威胁。',
  ],
  'intel.sighting': [
    '{place}方向发现敌军约{band}，番号不详。',
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
    '我军一部向东佯动，敌电台与侦察报告均称我军主力东进。',
    '佯动奏效：敌军开始向{place}方向调动。',
  ],
  'politics.ferry': [
    '渡口已控制，船只与船工正在集中。',
    '渡江开始：船只往返，全军分批过江。',
  ],
  'politics.chase': [
    '追兵距我后卫不足一日路程。',
    '敌军前锋逼近，后卫需阻击。',
  ],
  'river.cross': [
    '我军渡过赤水河，敌追击稍缓。',
    '渡河完成，部队在河西岸集结。',
  ],
  'opening.situation': [
    '遵义会议后，全军约三万人，四面皆有敌军。北渡长江是既定方向，但川军已在沿江布防。',
    '情报：川军之一部向土城方向靠拢，中央军一部在鲁班场一带，滇军一部在镇雄、毕节方向。',
  ],
  'decision': ['军前会议结束，命令下达。'],
  'decision.opt1': ['决定已下：全军按第一方案行动。'],
  'decision.opt2': ['决定已下：按第二方案行动。'],
  'decision.opt3': ['决定已下：按第三方案行动。'],
  'decision.opt4': ['决定已下：按第四方案行动。'],
  'node.open': ['军情急报：{title}，请即决断。'],
}

function fill(t: string, p: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => p[k] ?? '')
}

export function makeOpsNarrator(extra: Corpus = {}): OpsNarrative {
  const corpus: Corpus = {}
  for (const key of new Set([...Object.keys(BASE), ...Object.keys(extra)])) {
    corpus[key] = [...(BASE[key] ?? []), ...(extra[key] ?? [])]
  }
  return {
    line(kind: string, params: Record<string, string>, salt: number): string {
      const pool = corpus[kind]
      if (!pool || pool.length === 0) return ''
      return fill(pool[Math.abs(salt) % pool.length] ?? pool[0]!, params)
    },
  }
}

export type { Corpus }
