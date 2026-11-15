import type {
  ArmyDef, Balance, Campaign, CampaignMeta, CityDef, DecisionNodeDef, Difficulty, DifficultyId, MapTerrain, RoadDef, ScoreWeights,
} from '@aiwar/sim'

const meta: CampaignMeta = {
  id: 'guiling-353bc',
  title: '围魏救赵',
  subtitle: '桂陵之战 · 前 354—前 353 年',
  dateLabel: '周显王十五—十六年 · 魏围邯郸',
  startLabel: '第一日',
  background:
    '魏国伐赵，围其都邯郸。赵使求救于齐。齐廷之上，田忌主张直趋邯郸，孙膑进"批亢捣虚"之策：不救赵，反而疾走魏都大梁，攻其所必救。魏军若回师，齐军便有机会在半途截击。',
  objective: '迫使魏军回师、重创其机动兵力；邯郸能否保全，取决于你能否抢在城破之前解围。',
  infoTip: '你只能看到前线战报与最新势力范围，看不到兵力、粮草的具体数字。战报有来源、有延迟、可能出错。',
  history: [
    { title: '《史记·孙子吴起列传》', text: '魏伐赵，赵急，请救于齐。田忌欲引兵之赵，孙子曰："君不若引兵疾走大梁，据其街路，冲其方虚，彼必释赵而自救。"田忌从之。魏果去邯郸，与齐战于桂陵，大破梁军。' },
    { title: '《孙膑兵法·擒庞涓》', text: '孙子曰："请南攻平陵……"于是段齐城、高唐为两，直将蚁傅平陵……孙子弗息，而击之桂陵，而禽庞涓。' },
    { title: '《战国策·齐策一》（段干纶，一作段干朋）', text: '段干纶曰："夫救邯郸，军于其郊，是赵不拔而魏全也。故不如南攻襄陵以弊魏，邯郸拔而承魏之弊，是齐之利也。"' },
    { title: '邯郸之陷与复归', text: '《史记·赵世家》记赵成侯二十二年"魏惠王拔我邯郸"；赵复得邯郸在魏归邯郸于赵（前 351）。桂陵之战削弱的是魏军主力，而非保住邯郸城。' },
  ],
  disclaimer: '本作以《史记》《孙膑兵法》《战国策》为背景进行写意改编：地图、兵力、时间线均经游戏化处理，不代表严格史实；桂陵地望与"擒庞涓"之说亦有异说。',
}

const cities: CityDef[] = [
  { id: 'linzi', name: '临淄', x: 900, y: 250, kind: 'capital', owner: 'qi', wall: 3.0, garrison: 6000, grain: 90 },
  { id: 'gaotang', name: '高唐', x: 780, y: 205, kind: 'city', owner: 'qi', wall: 2.0, garrison: 2000, grain: 50 },
  { id: 'pinglu', name: '平陆', x: 700, y: 300, kind: 'fort', owner: 'qi', wall: 2.2, garrison: 2500, grain: 50 },
  { id: 'juan', name: '鄄', x: 640, y: 330, kind: 'port', owner: 'qi', wall: 2.0, garrison: 2000, grain: 50 },
  { id: 'puyang', name: '濮阳', x: 560, y: 320, kind: 'capital', owner: 'wei_state', wall: 2.4, garrison: 6000, grain: 60 },
  { id: 'guiling', name: '桂陵', x: 540, y: 400, kind: 'fort', owner: 'wei', wall: 1.8, garrison: 1500, grain: 30 },
  { id: 'daliang', name: '大梁', x: 520, y: 480, kind: 'capital', owner: 'wei', wall: 3.0, garrison: 12000, grain: 120 },
  { id: 'pingling', name: '平陵', x: 655, y: 400, kind: 'city', owner: 'wei', wall: 2.2, garrison: 6000, grain: 45 },
  { id: 'xiangling', name: '襄陵', x: 610, y: 505, kind: 'city', owner: 'wei', wall: 2.0, garrison: 4000, grain: 40 },
  { id: 'dingtao', name: '定陶', x: 700, y: 480, kind: 'city', owner: 'song', wall: 1.8, garrison: 3000, grain: 35 },
  { id: 'suiyang', name: '睢阳', x: 710, y: 575, kind: 'capital', owner: 'song', wall: 2.4, garrison: 12000, grain: 70 },
  { id: 'handan', name: '邯郸', x: 330, y: 190, kind: 'capital', owner: 'zhao', wall: 2.6, garrison: 22000, grain: 56 },
  { id: 'xing', name: '邢', x: 400, y: 120, kind: 'city', owner: 'zhao', wall: 1.8, garrison: 3000, grain: 30 },
  { id: 'chen', name: '陈', x: 450, y: 650, kind: 'capital', owner: 'chu', wall: 2.6, garrison: 25000, grain: 100 },
  { id: 'anyi', name: '安邑', x: 220, y: 380, kind: 'city', owner: 'wei', wall: 2.4, garrison: 5000, grain: 50 },
  { id: 'shaoliang', name: '少梁', x: 100, y: 330, kind: 'fort', owner: 'wei', wall: 2.0, garrison: 3000, grain: 30 },
]

/**
 * 战场地形：山系、河流、湖泊、关隘。纯渲染数据，不参与推演。
 * 坐标与城邑同一套画布坐标（1000×700），取自《史记》《战国策》里提到的山川与
 * 桂陵、濮水、济水、鸿沟这些真实存在的地理骨架；只求方位对得上，不做测绘精度。
 */
const terrain: MapTerrain[] = [
  { kind: 'ridge', name: '太行', points: [[150, 120], [210, 160], [260, 120], [320, 150], [370, 110]], weight: 1 },
  { kind: 'ridge', name: '太行东麓', points: [[260, 200], [300, 250], [330, 300], [350, 360]], weight: 1 },
  { kind: 'ridge', name: '泰山', points: [[730, 190], [780, 225], [830, 205], [870, 250]], weight: 2 },
  { kind: 'ridge', name: '睢涣之间', points: [[600, 470], [660, 500], [720, 520]], weight: 1 },
  // 河流按真实走向布置：济水自西向东入齐，濮水在其南，鸿沟南下通淮
  { kind: 'river', name: '济水', points: [[540, 300], [600, 315], [660, 322], [730, 330], [800, 340]], weight: 3 },
  { kind: 'river', name: '濮水', points: [[480, 350], [540, 360], [600, 380], [660, 400], [720, 420]], weight: 2 },
  { kind: 'river', name: '鸿沟', points: [[520, 470], [510, 540], [500, 600], [480, 650]], weight: 3 },
  { kind: 'river', name: '漳水', points: [[280, 150], [330, 175], [380, 200], [430, 230]], weight: 2 },
  { kind: 'river', name: '睢水', points: [[600, 520], [660, 545], [720, 570]], weight: 2 },
  { kind: 'pass', name: '桂陵道', points: [[540, 395], [520, 480]], weight: 1 },
  { kind: 'pass', name: '太行东麓道', points: [[400, 210], [440, 260], [470, 300]], weight: 1 },
]

const roads: RoadDef[] = [
  { id: 'r-linzi-gaotang', from: 'linzi', to: 'gaotang', days: 2 },
  { id: 'r-linzi-pinglu', from: 'linzi', to: 'pinglu', days: 3, kind: 'road', name: '临淄—平陆道' },
  { id: 'r-gaotang-pinglu', from: 'gaotang', to: 'pinglu', days: 2 },
  { id: 'r-pinglu-juan', from: 'pinglu', to: 'juan', days: 1 },
  { id: 'r-juan-puyang', from: 'juan', to: 'puyang', days: 1, kind: 'river', name: '济水渡' },
  { id: 'r-puyang-guiling', from: 'puyang', to: 'guiling', days: 2, kind: 'pass', name: '桂陵道' },
  { id: 'r-guiling-daliang', from: 'guiling', to: 'daliang', days: 2, kind: 'pass', name: '桂陵—大梁道' },
  { id: 'r-pinglu-pingling', from: 'pinglu', to: 'pingling', days: 3 },
  { id: 'r-pingling-daliang', from: 'pingling', to: 'daliang', days: 3 },
  { id: 'r-pingling-xiangling', from: 'pingling', to: 'xiangling', days: 2 },
  { id: 'r-xiangling-daliang', from: 'xiangling', to: 'daliang', days: 2 },
  { id: 'r-xiangling-suiyang', from: 'xiangling', to: 'suiyang', days: 3, kind: 'river', name: '睢水渡' },
  { id: 'r-pingling-dingtao', from: 'pingling', to: 'dingtao', days: 2 },
  { id: 'r-dingtao-daliang', from: 'dingtao', to: 'daliang', days: 2 },
  { id: 'r-dingtao-suiyang', from: 'dingtao', to: 'suiyang', days: 2 },
  { id: 'r-puyang-handan', from: 'puyang', to: 'handan', days: 3, kind: 'pass', name: '太行东麓' },
  { id: 'r-handan-daliang', from: 'handan', to: 'daliang', days: 6, kind: 'road', name: '邯郸—大梁直道' },
  { id: 'r-handan-xing', from: 'handan', to: 'xing', days: 2 },
  { id: 'r-daliang-chen', from: 'daliang', to: 'chen', days: 4, kind: 'river', name: '鸿沟南下' },
  { id: 'r-daliang-anyi', from: 'daliang', to: 'anyi', days: 6, kind: 'road', name: '魏西道' },
  { id: 'r-anyi-shaoliang', from: 'anyi', to: 'shaoliang', days: 3 },
  { id: 'r-anyi-handan', from: 'anyi', to: 'handan', days: 4 },
]

const armies: ArmyDef[] = [
  {
    id: 'qi-zhongjun', name: '中军', faction: 'qi', commander: '田忌 · 孙膑',
    troops: { chariot: 8000, infantry: 30000, cavalry: 2000, crossbow: 2000 },
    morale: 68, fatigue: 10, training: 1.0, foodDays: 30, city: 'linzi',
  },
  {
    id: 'qi-gaotang', name: '高唐军', faction: 'qi', commander: '高唐大夫',
    troops: { chariot: 2000, infantry: 11500, cavalry: 500, crossbow: 1000 },
    morale: 62, fatigue: 8, training: 0.95, foodDays: 22, city: 'gaotang',
  },
  {
    id: 'qi-qicheng', name: '齐城军', faction: 'qi', commander: '齐城大夫',
    troops: { chariot: 2000, infantry: 11500, cavalry: 500, crossbow: 1000 },
    morale: 62, fatigue: 8, training: 0.95, foodDays: 22, city: 'pinglu',
  },
  {
    id: 'qi-qingche', name: '轻车', faction: 'qi', commander: '轻车将',
    troops: { chariot: 2500, infantry: 1500, cavalry: 800, crossbow: 200 },
    morale: 72, fatigue: 5, training: 1.05, foodDays: 26, city: 'juan',
  },
  {
    id: 'wei-pangjuan', name: '庞涓本部', faction: 'wei', commander: '庞涓',
    troops: { chariot: 12000, infantry: 56000, cavalry: 6000, crossbow: 6000 },
    morale: 78, fatigue: 12, training: 1.15, foodDays: 40, city: 'handan',
  },
]

const decisions: DecisionNodeDef[] = [
  {
    id: 'n1', title: '邯郸之难', prompt: '赵使抵临淄，邯郸被围月余，粮道将断。魏军势大，齐廷争论不休。救，还是观望？',
    options: [
      { id: 'opt1', label: '发兵救赵', desc: '齐军西出，以解邯郸之围为名。赵国情势可缓，但齐魏正面相抗。', hint: '田忌主战，孙膑不反对——只是他有别的走法。', recommended: true },
      { id: 'opt2', label: '先观望，再作打算', desc: '暂不出兵，等魏赵两疲。赵可能撑不住，但齐军准备更充分。', hint: '观望越久，邯郸越危险。' },
      { id: 'opt3', label: '不救，坐观成败', desc: '保存实力。赵亡之后，魏国坐大，齐国未必有利。', hint: '这是另一条路，结局不会好看。' },
    ],
    defaultOption: 'opt2',
  },
  {
    id: 'n2', title: '出兵方略', prompt: '齐军已在边境集结。田忌请直趋邯郸，孙膑主张南攻平陵、示弱骄敌，再以主力趋大梁。',
    options: [
      { id: 'opt1', label: '直趋邯郸，与魏军决战', desc: '救赵最直接，也最容易撞上魏军主力。', hint: '情报未明，正面对决风险很大。' },
      { id: 'opt2', label: '南攻平陵、襄陵，攻魏本土', desc: '孙膑、段干纶两谋合一：先以偏师示弱于平陵，再攻襄陵、大梁，攻其必救。', hint: '稳中求变，但平陵顿兵则粮道吃紧。' },
      { id: 'opt3', label: '佯攻平陵，主力隐蔽趋大梁', desc: '孙膑之谋：以偏师示弱骄敌，主力昼伏夜行，直逼魏都。', hint: '最像史实的走法，也最依赖隐蔽与情报。', recommended: true },
      { id: 'opt4', label: '容我细想（自行下达军令）', desc: '不预设方略，由你在战场页自行调兵。', hint: '多给两枚军令牌。' },
    ],
    defaultOption: 'opt2',
  },
  {
    id: 'n3', title: '平陵示弱', prompt: '齐军抵近平陵。是硬攻这座"城小县大"的坚城，还是佯攻佯败、示弱骄敌？',
    options: [
      { id: 'opt1', label: '真攻平陵，拔之立威', desc: '强攻平陵，若能速下，可震魏国。', hint: '平陵守备不弱，顿兵坚城是兵家大忌。' },
      { id: 'opt2', label: '蚁傅佯攻，佯败示弱', desc: '派高唐、齐城两军猛攻后佯败，让魏军以为齐军怯弱。', hint: '史实走法。佯败会折损一些兵力。', recommended: true },
      { id: 'opt3', label: '绕开平陵，轻车西驰梁郊', desc: '不啃坚城，直接派轻车急趋大梁城外，激怒魏军。', hint: '快，但意图暴露得也早。' },
      { id: 'opt4', label: '分兵：一路佯攻，一路隐蔽待机', desc: '既示弱又保留主力，代价是军令更复杂。', hint: '多给两枚军令牌。' },
    ],
    defaultOption: 'opt2',
  },
  {
    id: 'n4', title: '邯郸危局', prompt: '邯郸粮道将断，城防残破。魏军仍在猛攻。你是继续威胁大梁，还是转兵救赵？',
    options: [
      { id: 'opt1', label: '继续威胁大梁', desc: '不救邯郸，把战火烧到魏都。赵若亡，齐仍可重创魏军。', hint: '孙膑会同意，赵使会绝望。' },
      { id: 'opt2', label: '转兵救邯郸', desc: '回师救赵，与魏军正面相抗。', hint: '邯郸得救，但齐军可能撞上魏军主力。' },
      { id: 'opt3', label: '加大佯动，制造齐军已疲的假象', desc: '多路示弱，诱使庞涓轻敌冒进。', hint: '成功则伏击事半功倍。' },
      { id: 'opt4', label: '遣使促楚、秦出兵', desc: '以外交牵制魏国，逼其分兵。', hint: '需要时间，未必立刻见效。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'n5', title: '大梁震动', prompt: '齐军已抵大梁近郊，魏廷震动。是强攻国都、耀兵城下，还是分兵设伏、断其归路？',
    options: [
      { id: 'opt1', label: '强攻大梁', desc: '破其国都，一战定局。', hint: '大梁城坚，久攻不下会遭回师夹击。' },
      { id: 'opt2', label: '耀兵梁郊，焚其积聚', desc: '不攻城，只示威。逼魏王强令庞涓回师。', hint: '史实思路：攻其所必救。', recommended: true },
      { id: 'opt3', label: '分兵断粮道，预置伏兵', desc: '轻车抢占桂陵要道，主力待机。', hint: '提前布置，伏击更从容。' },
      { id: 'opt4', label: '示弱后撤，诱敌深入', desc: '佯退，让庞涓以为齐军胆怯，诱其急行。', hint: '需要很稳的情报判断。' },
    ],
    defaultOption: 'opt2',
  },
  {
    id: 'n6', title: '回师与伏击', prompt: '魏军自邯郸回师，正向大梁急进。走桂陵道还是濮水渡？是伏击、迎击，还是继续攻梁？',
    options: [
      { id: 'opt1', label: '桂陵设伏', desc: '主力隐蔽进入桂陵道两侧，以逸待劳。', hint: '史实伏击点。若魏军走直道，伏击会落空。', recommended: true },
      { id: 'opt2', label: '濮水渡半渡而击', desc: '在濮阳、桂陵之间的渡口截击。', hint: '若魏军走北道，这里更稳。' },
      { id: 'opt3', label: '迎头痛击', desc: '不设伏，正面拦截魏军。', hint: '齐军正面未必占优，但可争取时间。' },
      { id: 'opt4', label: '继续攻大梁，逼其决战城下', desc: '不管回师之敌，先破大梁。', hint: '风险极高，收益也大。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'n7', title: '战后处置', prompt: '主力交战已分胜负。是追击扩大战果、收兵保存实力、乘胜取城，还是议和？',
    options: [
      { id: 'opt1', label: '追击', desc: '扩大战果，削弱魏军。', hint: '追击也会让己方疲劳加深。' },
      { id: 'opt2', label: '收兵，保存实力', desc: '见好就收，保全主力。', hint: '评分看"齐军保存"，但魏军损失有限。' },
      { id: 'opt3', label: '乘胜取魏城', desc: '攻取魏国东境城邑，扩张战果。', hint: '城邑控制加分，但可能拉长战事。' },
      { id: 'opt4', label: '议和', desc: '以战果换取和平，避免久战。', hint: '外交收尾，稳妥但不够痛快。' },
    ],
    defaultOption: 'opt2',
  },
]

const difficulties: Record<DifficultyId, Difficulty> = {
  hist: {
    id: 'hist', name: '史实', label: '更准的情报，更宽的决策窗口', intelDelay: 1, strengthError: 0.2,
    falseReportPerTenDays: 0, scoutEfficiency: 1.3, enemyIntelQuality: 0.8, feintBreakChance: 0.02,
    decisionSeconds: 120, supplyFactor: 0.9, scoreFactor: 0.92, defaultQuality: 0.9,
  },
  normal: {
    id: 'normal', name: '普通', label: '情报有噪声，魏军会用计', intelDelay: 2, strengthError: 0.35,
    falseReportPerTenDays: 0.5, scoutEfficiency: 1.0, enemyIntelQuality: 1.0, feintBreakChance: 0.12,
    decisionSeconds: 100, supplyFactor: 1.0, scoreFactor: 1.0, defaultQuality: 0.65,
  },
  hard: {
    id: 'hard', name: '困难', label: '假报增多，魏军会识破佯动', intelDelay: 3, strengthError: 0.5,
    falseReportPerTenDays: 1.2, scoutEfficiency: 0.8, enemyIntelQuality: 1.2, feintBreakChance: 0.32,
    decisionSeconds: 80, supplyFactor: 1.1, scoreFactor: 1.08, defaultQuality: 0.35,
  },
  hell: {
    id: 'hell', name: '地狱', label: '情报含混，魏军会反设伏', intelDelay: 4, strengthError: 0.65,
    falseReportPerTenDays: 2, scoutEfficiency: 0.65, enemyIntelQuality: 1.4, feintBreakChance: 0.5,
    decisionSeconds: 60, supplyFactor: 1.25, scoreFactor: 1.15, defaultQuality: 0.1,
  },
}

const balance: Balance = {
  battleIntensity: 0.09,
  ambushMultiplier: 2.3,
  wallDefense: 1,
  foodConsumption: 1,
  resupplyDays: 4,
  maxFoodDays: 42,
  routTroopRatio: 0.62,
  routMorale: 30,
  desertionPerDay: 0.01,
  siegeGarrisonLoss: 0.008,
  siegeGrainLoss: 0.9,
  weiPressurePerThreat: 1,
  weiPressureDecay: 0.45,
  returnOrderThreshold: 42,
  zhaoFallRatio: 0.22,
}

const weights: ScoreWeights = {
  objective: 30,
  weiLoss: 20,
  qiPreserve: 15,
  zhaoSurvive: 10,
  cities: 10,
  diplomacy: 5,
  logistics: 5,
  historyEcho: 5,
}

export const guilingCampaign: Campaign = {
  meta,
  playerFaction: 'qi',
  maxTicks: 110,
  factions: {
    qi: { name: '齐', color: '#2f6f8f', short: '齐' },
    wei: { name: '魏', color: '#8a3b3b', short: '魏' },
    zhao: { name: '赵', color: '#7a6a3a', short: '赵' },
    song: { name: '宋', color: '#6a5a8a', short: '宋' },
    wei_state: { name: '卫', color: '#8a6a4a', short: '卫' },
    chu: { name: '楚', color: '#3a7a5a', short: '楚' },
    qin: { name: '秦', color: '#555a66', short: '秦' },
  },
  cities,
  roads,
  terrain,
  armies,
  decisions,
  difficulty: difficulties,
  balance,
  roles: {
    weiFieldArmy: 'wei-pangjuan',
    zhaoCapital: 'handan',
    weiCapital: 'daliang',
    zhaoNorth: 'xing',
    qiStaging: 'pinglu',
    ambushSites: ['guiling', 'puyang'],
  },
  weights,
}
