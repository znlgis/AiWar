import type { OpsCampaign, OpsCityDef, OpsRoadDef, OpsArmyDef, DecisionNodeDef, Difficulty, DifficultyId } from '@aiwar/sim'

const cities: OpsCityDef[] = [
  { id: 'jiangling', name: '江陵', x: 300, y: 520, owner: 'cao', kind: 'city', terrain: 'river', garrison: 12000, wall: 2.0, grain: 40 },
  { id: 'dangyang', name: '当阳', x: 360, y: 470, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 6000, wall: 1.2, grain: 16 },
  { id: 'xiakou', name: '夏口', x: 470, y: 440, owner: 'cao', kind: 'port', terrain: 'river', garrison: 10000, wall: 1.6, grain: 30 },
  { id: 'fankou', name: '樊口', x: 500, y: 470, owner: 'sun', kind: 'port', terrain: 'river', garrison: 4000, wall: 1.2, grain: 14 },
  { id: 'chibi', name: '赤壁', x: 560, y: 430, owner: 'sun', kind: 'port', terrain: 'river', garrison: 3000, wall: 1.2, grain: 12 },
  { id: 'wulin', name: '乌林', x: 600, y: 400, owner: 'cao', kind: 'port', terrain: 'river', garrison: 20000, wall: 1.2, grain: 30 },
  { id: 'huarong', name: '华容道', x: 520, y: 360, owner: 'cao', kind: 'fort', terrain: 'mountain', garrison: 2000, wall: 1.0, grain: 6 },
  { id: 'nanjun', name: '南郡', x: 330, y: 560, owner: 'cao', kind: 'city', terrain: 'river', garrison: 14000, wall: 1.8, grain: 30 },
  { id: 'xiangyang', name: '襄阳', x: 280, y: 330, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 15000, wall: 2.0, grain: 40 },
  { id: 'chaisang', name: '柴桑', x: 620, y: 500, owner: 'sun', kind: 'city', terrain: 'river', garrison: 8000, wall: 1.6, grain: 24 },
  { id: 'jianye', name: '建业', x: 720, y: 540, owner: 'sun', kind: 'capital', terrain: 'river', garrison: 12000, wall: 2.0, grain: 40 },
  { id: 'hefei', name: '合肥', x: 620, y: 300, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 10000, wall: 1.6, grain: 26 },
  { id: 'yiling', name: '夷陵', x: 400, y: 560, owner: 'cao', kind: 'city', terrain: 'river', garrison: 6000, wall: 1.2, grain: 16 },
]

const roads: OpsRoadDef[] = [
  { id: 'c1', from: 'jiangling', to: 'dangyang', days: 2, kind: 'road' },
  { id: 'c2', from: 'dangyang', to: 'xiakou', days: 3, kind: 'river', name: '汉水' },
  { id: 'c3', from: 'xiakou', to: 'fankou', days: 1, kind: 'river', name: '长江' },
  { id: 'c4', from: 'fankou', to: 'chibi', days: 1, kind: 'river', name: '长江' },
  { id: 'c5', from: 'chibi', to: 'wulin', days: 1, kind: 'river', name: '长江' },
  { id: 'c6', from: 'wulin', to: 'huarong', days: 1, kind: 'mountain' },
  { id: 'c7', from: 'huarong', to: 'nanjun', days: 2, kind: 'road' },
  { id: 'c8', from: 'nanjun', to: 'jiangling', days: 1, kind: 'river' },
  { id: 'c9', from: 'xiangyang', to: 'dangyang', days: 3, kind: 'road' },
  { id: 'c10', from: 'xiakou', to: 'chaisang', days: 3, kind: 'river' },
  { id: 'c11', from: 'chaisang', to: 'jianye', days: 3, kind: 'river' },
  { id: 'c12', from: 'jianye', to: 'hefei', days: 4, kind: 'road' },
  { id: 'c13', from: 'hefei', to: 'xiakou', days: 5, kind: 'road' },
  { id: 'c14', from: 'fankou', to: 'xiakou', days: 1, kind: 'river' },
  { id: 'c15', from: 'yiling', to: 'jiangling', days: 2, kind: 'river' },
  { id: 'c16', from: 'yiling', to: 'wulin', days: 3, kind: 'river' },
]

const armies: OpsArmyDef[] = [
  { id: 'sun-main', name: '周瑜部', faction: 'sun', commander: '周瑜', troops: 30000, type: 'mixed', morale: 80, fatigue: 8, training: 1.1, foodDays: 20, city: 'chaisang', stealth: 0.3, naval: true },
  { id: 'sun-navy', name: '江东水军', faction: 'sun', commander: '水军都督', troops: 20000, type: 'fleet', morale: 82, fatigue: 6, training: 1.15, foodDays: 20, city: 'chaisang', stealth: 0.35, naval: true },
  { id: 'shu-main', name: '刘备军', faction: 'shu', commander: '刘备', troops: 20000, type: 'infantry', morale: 72, fatigue: 14, training: 1.0, foodDays: 16, city: 'fankou', stealth: 0.3 },
  { id: 'shu-navy', name: '荆州水军', faction: 'shu', commander: '关羽', troops: 8000, type: 'fleet', morale: 74, fatigue: 8, training: 1.05, foodDays: 18, city: 'fankou', stealth: 0.35, naval: true },
  { id: 'cao-main', name: '曹军主力', faction: 'cao', commander: '丞相府', troops: 120000, type: 'mixed', morale: 68, fatigue: 20, training: 1.0, foodDays: 18, city: 'wulin', stealth: 0.1 },
  { id: 'cao-navy', name: '荆州降军水师', faction: 'cao', commander: '荆州水军', troops: 60000, type: 'fleet', morale: 55, fatigue: 18, training: 0.85, foodDays: 16, city: 'wulin', stealth: 0.1, naval: true },
  { id: 'cao-rear', name: '曹军后队', faction: 'cao', commander: '后军都督', troops: 50000, type: 'infantry', morale: 66, fatigue: 16, training: 0.95, foodDays: 18, city: 'xiangyang', stealth: 0.1 },
  { id: 'cao-east', name: '合肥守军', faction: 'cao', commander: '合肥守将', troops: 25000, type: 'infantry', morale: 66, fatigue: 8, training: 0.95, foodDays: 20, city: 'hefei', stealth: 0.1 },
  { id: 'cao-jiangling', name: '江陵守军', faction: 'cao', commander: '江陵守将', troops: 20000, type: 'infantry', morale: 64, fatigue: 10, training: 0.9, foodDays: 18, city: 'jiangling', stealth: 0.1 },
]

const decisions: DecisionNodeDef[] = [
  {
    id: 'd1', title: '联吴还是独战', prompt: '曹操大军南下，刘备败走。是联合孙权共抗曹操，还是另寻退路？',
    options: [
      { id: 'opt1', label: '联吴抗曹', desc: '孙刘联盟，兵力虽少，可依托长江。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '投奔苍梧', desc: '继续南逃，保存实力。', hint: '放弃荆州。' },
      { id: 'opt3', label: '投降曹操', desc: '保全性命与部曲。', hint: '另一条路。' },
      { id: 'opt4', label: '退守江夏', desc: '依附刘琦，伺机再起。', hint: '保守。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd2', title: '战还是降（东吴内部）', prompt: '曹操来书，号称八十万水军。东吴群臣多有主降者。',
    options: [
      { id: 'opt1', label: '主战，联刘抗曹', desc: '以长江天险与水军之利对抗。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '主降，保全江东', desc: '避免战火，但失去独立。', hint: '投降结局。' },
      { id: 'opt3', label: '观望，先看刘备实力', desc: '拖延，等局势明朗。', hint: '可能错失战机。' },
      { id: 'opt4', label: '迁都武昌，持久抵抗', desc: '放弃江东腹地，拉长战线。', hint: '消耗战。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd3', title: '决战地点', prompt: '联军西进，与曹军隔江对峙。决战选在赤壁，还是退守夏口、柴桑？',
    options: [
      { id: 'opt1', label: '赤壁决战', desc: '在赤壁—乌林江面与曹军决战。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '退守夏口', desc: '拉长曹军补给线。', hint: '保守。' },
      { id: 'opt3', label: '退守柴桑', desc: '保存水军，诱敌深入。', hint: '风险。' },
      { id: 'opt4', label: '分兵袭扰曹军粮道', desc: '以游击战拖垮曹军。', hint: '需要时间。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd4', title: '诈降与火攻', prompt: '黄盖献计：诈降曹军，以火船突袭其连环船阵。可行吗？',
    options: [
      { id: 'opt1', label: '用黄盖诈降火攻', desc: '若成，可一战破曹军水师。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '正面水战', desc: '依靠水军优势硬拼。', hint: '伤亡大。' },
      { id: 'opt3', label: '夜袭曹营', desc: '小规模偷袭，风险较低。', hint: '战果有限。' },
      { id: 'opt4', label: '坚守不战，等曹军自退', desc: '以时间换空间。', hint: '曹军补给困难。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd5', title: '东南风：等还是打', prompt: '火攻需东南风。连日北风，是等风起，还是改变计划？',
    options: [
      { id: 'opt1', label: '等东南风，按原计划火攻', desc: '气象条件具备时出击。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '立即出击，不等风', desc: '风向不利，火攻可能反烧己方。', hint: '高风险。' },
      { id: 'opt3', label: '改为夜袭，不用火', desc: '放弃火攻，改用突袭。', hint: '战果有限。' },
      { id: 'opt4', label: '继续对峙，等曹军生变', desc: '以逸待劳。', hint: '不确定。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd6', title: '追击与取南郡', prompt: '曹军大溃。是追击曹军主力，还是抢先取南郡、江陵？',
    options: [
      { id: 'opt1', label: '追击曹军主力', desc: '扩大战果，扩大战果。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '抢取南郡、江陵', desc: '夺取荆州要地。', hint: '战略收益。' },
      { id: 'opt3', label: '分兵两路', desc: '追击与取城并重。', hint: '兵力分散。' },
      { id: 'opt4', label: '收兵回防', desc: '保存实力。', hint: '保守。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd7', title: '荆州归属', prompt: '战后荆州如何分配？是让刘备取荆南，还是东吴独占？',
    options: [
      { id: 'opt1', label: '让刘备取荆南，孙刘共治', desc: '维持联盟。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '东吴独占荆州', desc: '增强实力，但联盟裂痕。', hint: '风险。' },
      { id: 'opt3', label: '分荆州为三', desc: '互相牵制。', hint: '复杂。' },
      { id: 'opt4', label: '交还朝廷', desc: '名义归汉。', hint: '政治姿态。' },
    ],
    defaultOption: 'opt1',
  },
]

const difficulty: Record<DifficultyId, Difficulty> = {
  hist: { id: 'hist', name: '史实', label: '情报较准，曹军轻敌', intelDelay: 1, strengthError: 0.2, falseReportPerTenDays: 0, scoutEfficiency: 1.3, enemyIntelQuality: 0.8, feintBreakChance: 0.05, decisionSeconds: 120, supplyFactor: 0.9, scoreFactor: 0.92, defaultQuality: 0.9 },
  normal: { id: 'normal', name: '普通', label: '情报有噪声，曹军会试探', intelDelay: 2, strengthError: 0.35, falseReportPerTenDays: 0.5, scoutEfficiency: 1.0, enemyIntelQuality: 1.0, feintBreakChance: 0.2, decisionSeconds: 100, supplyFactor: 1.0, scoreFactor: 1.0, defaultQuality: 0.65 },
  hard: { id: 'hard', name: '困难', label: '假报增多，曹军有防备', intelDelay: 3, strengthError: 0.5, falseReportPerTenDays: 1.2, scoutEfficiency: 0.8, enemyIntelQuality: 1.2, feintBreakChance: 0.4, decisionSeconds: 80, supplyFactor: 1.1, scoreFactor: 1.08, defaultQuality: 0.35 },
  hell: { id: 'hell', name: '地狱', label: '情报含混，风向难测', intelDelay: 4, strengthError: 0.65, falseReportPerTenDays: 2, scoutEfficiency: 0.65, enemyIntelQuality: 1.4, feintBreakChance: 0.6, decisionSeconds: 60, supplyFactor: 1.25, scoreFactor: 1.15, defaultQuality: 0.1 },
}

export const chibiCampaign: OpsCampaign = {
  meta: {
    id: 'chibi-208',
    title: '赤壁之战',
    subtitle: '东汉建安十三年 · 208',
    era: '三国',
    premise: '五万联军对二十余万南征大军，在长江与乌林之间赌一场火攻。',
    dateLabel: '建安十三年冬 · 曹操南下',
    startLabel: '第一日',
    playerRole: '孙刘联军决策层（吴侯府与军师中郎将府，不具名）',
    background:
      '曹操南下荆州，刘琮降，刘备败走当阳。孙刘结盟，以周瑜、程普率三万水军，加刘备部约两万，合计约五万，依托长江对抗曹军。曹军北方士卒不习水战，军中疾疫，战船相连。黄盖献诈降火攻之策，赤壁一战，决定了南北格局。',
    objective: '守住江东，击退或重创曹军；若火攻成功，乘胜夺取荆州要地。',
    infoTip: '曹军号称八十万，实兵约二十余万；情报误差很大。风向与水战是胜负手。',
    dossier: [
      { title: '战前态势', text: '建安十三年，曹操南征荆州。刘表病卒，刘琮举州投降。刘备败于当阳，退往夏口，与孙权结盟。' },
      { title: '兵力对比', text: '曹操号称八十万，实有北方兵约十五六万、荆州降军约七八万。孙刘联军约五万：周瑜部三万，刘备部约两万。' },
      { title: '赤壁初战', text: '联军西进，与曹军相遇于赤壁。曹军小战不利，退驻乌林，战船相连，军中疾疫流行。' },
      { title: '诈降火攻', text: '黄盖诈降，以火船突袭曹军连环船阵。东南风起，火势蔓延，曹军水师大溃。' },
      { title: '华容撤退', text: '曹操烧余船退走，经华容道泥泞难行，损失惨重，退回江陵。' },
      { title: '数字与分歧', text: '曹操兵力、赤壁地望、火攻月份均有不同说法。游戏内做写意处理。' },
    ],
    disclaimer: '本作以《三国志》及裴注等公开史料为背景进行写意改编：地图、兵力、时间线均经游戏化处理；决策者以职务代称，不出现具体人物；数字与日期存在考据分歧，不代表严格战史。',
  },
  playerFaction: 'sun',
  enemyFactions: ['cao'],
  factions: {
    sun: { name: '孙吴', color: '#3a7a5a', short: '吴' },
    shu: { name: '刘备', color: '#6a5a8a', short: '刘' },
    cao: { name: '曹操', color: '#8a3b3b', short: '曹' },
  },
  mapWidth: 800,
  mapHeight: 700,
  cities,
  roads,
  armies,
  decisions,
  difficulty,
  balance: {
    battleIntensity: 1,
    ambushMultiplier: 1.8,
    routTroopRatio: 0.55,
    routMorale: 25,
    supplyFactor: 1,
    maxFoodDays: 22,
    resupplyDays: 3,
    siegeGarrisonLoss: 0.02,
    siegeGrainLoss: 1,
    desertionPerDay: 0.01,
  },
  weather: [
    { id: 'clear', label: '晴' },
    { id: 'wind', label: '风' },
    { id: 'rain', label: '雨' },
    { id: 'fog', label: '雾' },
  ],
  rulesId: 'chibi-208',
}
