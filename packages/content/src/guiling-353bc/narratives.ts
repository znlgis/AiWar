import type { Narrative } from '@aiwar/sim'

export type Corpus = Record<string, string[]>

import { CORPUS_EXTRA } from './corpus-extra.js'

const CORPUS_EXTRA_IMPORT = CORPUS_EXTRA

function mergeCorpus(base: Corpus, extra: Corpus): Corpus {
  const out: Corpus = {}
  for (const key of new Set([...Object.keys(base), ...Object.keys(extra)])) {
    out[key] = [...(base[key] ?? []), ...(extra[key] ?? [])]
  }
  return out
}

const CORPUS_BASE: Corpus = {
  'opening.siege': [
    '邯郸被围月余，城中粮道几绝，赵使已赴临淄求救。魏军营垒重重，未有解围之象。',
  ],
  'opening.envoy': [
    '赵使泣于齐庭：邯郸旦暮且下，请齐王速发救兵。',
  ],
  'opening.gather': [
    '齐军已在西境集结。田忌、孙膑奉命，诸军待发。',
  ],
  'battle.start': [
    '{place}方向尘头大起，两军已接战。斥候言敌军阵列严整，似有备而来。',
    '我军与魏军于{place}遭遇，鼓声相闻，接战在即。',
    '{place}道上，双方前队相撞，厮杀已起。',
  ],
  'battle.ambush_start': [
    '魏军行至{place}，队形散乱。我军伏兵齐出，鼓噪而进。',
    '{place}两侧伏兵突起，魏军猝不及防，前队顿时大乱。',
    '魏军入我彀中。{place}伏兵尽发，直冲其行军纵队。',
  ],
  'battle.rout': [
    '{place}之战，{loser}大溃，旌旗委地，向后方奔散。{winner}乘势掩杀。',
    '{winner}破{loser}于{place}，敌军弃甲曳兵而走。',
    '{loser}阵脚已乱，不能成列，{winner}逐之数里。',
  ],
  'battle.ambush_win': [
    '魏军猝遇伏击，{place}道上旌旗委地——此语为后方传来，未必尽实，然魏军溃势已明。',
    '{place}伏击得手，魏军首尾不能相顾，大败而逃。',
  ],
  'battle.draw': [
    '{place}接战竟日，胜负未分，两军各自收兵。',
    '{place}两军相持，互有折损，入夜各退。',
  ],
  'siege.start': [
    '我军进抵{city}城下，立营围攻。城头守备甚严。',
    '{city}城门紧闭，城上多张旗帜。我军已合围。',
  ],
  'siege.lift': [
    '围{city}之军已撤，城围遂解。',
    '{city}城下敌军营垒已空，似已解围而去。',
  ],
  'siege.fall': [
    '{city}城破，{side}入城。城中火光冲天，粮尽援绝。',
    '{city}守军力竭，城门失守，{side}已据其城。',
  ],
  'supply.low': [
    '{army}粮草将尽，军中已有怨言。',
    '{army}随军之粮不足五日，转运迟迟不至。',
  ],
  'supply.empty': [
    '{army}粮尽，士卒有逃散者。',
    '{army}已断炊，军心浮动，请速决。',
  ],
  'intel.sighting': [
    '{place}方向发现魏军大队，约{band}，行列绵延，去向未明。',
    '斥候回报：{place}一带有魏军{band}，旗号庞涓，似在移动。',
    '{place}见魏军{band}过境，辎重甚多，行军不急。',
  ],
  'siege.progress': [
    '{city}来使求援：{level}，城中粮草日蹙。',
    '{city}方面：{level}，守军仍在支撑。',
  ],
  'intel.rumor': [
    '商旅自大梁来，言魏王征发民夫，城門戒严——其言未必可信。',
    '道听途说：魏军有东调之议，然不知其详。',
    '传闻庞涓已回师，又闻其仍在邯郸。二说相左，未可轻信。',
  ],
  'politics.order_return': [
    '大梁急使至邯郸，魏王有令：国都告急，速回师。',
    '魏廷震动，使者连发，催促庞涓回军。',
  ],
  'politics.delay': [
    '庞涓接令而按兵不动，仍督军攻邯郸。',
    '魏军回师之令已下，然其营中无拔营之迹。',
  ],
  'politics.return': [
    '魏军自邯郸拔营东返，行伍绵延，辎重甚多。',
    '庞涓引军东还，军中传言大梁有变。',
  ],
  'politics.return_fast': [
    '魏军倍日并行，轻装疾进，似急欲救大梁。',
    '魏军抛弃辎重，昼夜兼程东返，士卒疲态已显。',
  ],
  'politics.wei_home': [
    '庞涓已入大梁，魏军主力回防国都。',
    '魏军归大梁，城门复启，市井稍安。',
  ],
  'politics.wei_broken': [
    '魏军主力溃散，大梁城中人心惶惶。',
    '庞涓部已不成军，魏廷急议守城之策。',
  ],
  'politics.chu': [
    '楚军北上，攻魏南境，睢水一带烽火起。',
    '楚将景舍引兵救赵，魏国南线告急。',
  ],
  'politics.qin': [
    '秦军攻魏河西，少梁一带战事起。',
    '秦师东出，魏国西境吃紧，安邑戒严。',
  ],
  'node.open': [
    '临淄急使至军前：{title}——请将军速决。',
    '军中议事：{title}，诸将皆待上命。',
  ],
  'decision': [
    '御前定策，使者已发。',
  ],
  'decision.opt1': [
    '临淄令下：依前议而行。三军整备，只待号令。',
  ],
  'decision.opt2': [
    '临淄令下：按既定方略行事。诸将依令而行。',
  ],
  'decision.opt3': [
    '临淄令下：另定方略，诸军即刻准备。',
  ],
  'decision.opt4': [
    '临淄令下：军中便宜行事。',
  ],
}

const CORPUS: Corpus = mergeCorpus(CORPUS_BASE, CORPUS_EXTRA_IMPORT)

function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? '')
}

export const narrator: Narrative = {
  line(kind: string, params: Record<string, string>, salt: number): string {
    const pool = CORPUS[kind]
    if (!pool || pool.length === 0) {
      if (params.title) return params.title + '已定。'
      return ''
    }
    const template = pool[Math.abs(salt) % pool.length] ?? pool[0]!
    return fill(template, params)
  },
  ending(id: string): { title: string; text: string } {
    const endings: Record<string, { title: string; text: string }> = {
      grand: { title: '桂陵大捷', text: '魏军回师途中遭伏，主力大溃。邯郸之围遂解，齐国威震诸侯。' },
      bitter: { title: '惨胜', text: '邯郸已陷，你以魏军主力为代价扳回一局。赵国元气大伤。' },
      relief: { title: '解围', text: '魏军回师，邯郸得全。伏击未成，但攻其必救之目的已达。' },
      daliang: { title: '大梁城下', text: '齐军攻破大梁，魏国震动。结局出乎史册，却合乎兵理。' },
      rout: { title: '齐军大溃', text: '主力溃散，辎重尽失。围魏救赵成了纸上谈兵。' },
      abandon: { title: '坐视邯郸', text: '齐国按兵不动。邯郸陷落，魏国坐大。' },
      peace: { title: '议和', text: '兵锋未交，使节先行。齐国保全实力，也错过重创魏国的机会。' },
      long: { title: '相持', text: '两军相持，胜负未决，战役在漫长的消耗中淡出史册。' },
      stalemate: { title: '未竟', text: '邯郸陷落，魏军未受重创。' },
    }
    return endings[id] ?? endings.stalemate!
  },
}

export const corpus = CORPUS