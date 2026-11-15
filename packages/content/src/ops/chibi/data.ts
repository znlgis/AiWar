import type { OpsCampaign, OpsCityDef, OpsRoadDef, OpsArmyDef, DecisionNodeDef, Difficulty, DifficultyId } from '@aiwar/sim'

// 地图节点按档案第 3 节与荆襄—江夏—淮南的实际水系铺开：
// 北线襄阳—荆门—江陵一线是曹军后镇，中线汉水（汉津）是南北联络，南线赤壁—乌林是决战
// 正面，荆南四郡（巴丘、长沙、武陵、桂阳）是战后归属之争的筹码，东线合肥—寿春—广陵是
// 曹军牵制方向。坐标是写意示意，只保证城内间距不小于 30、全部落在 800×700 之内。
const cities: OpsCityDef[] = [
  { id: 'jiangling', name: '江陵', x: 300, y: 520, owner: 'cao', kind: 'city', terrain: 'river', garrison: 12000, wall: 2.0, grain: 40 },
  { id: 'dangyang', name: '当阳', x: 360, y: 470, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 6000, wall: 1.2, grain: 16 },
  { id: 'xiakou', name: '夏口', x: 470, y: 440, owner: 'shu', kind: 'port', terrain: 'river', garrison: 3000, wall: 1.6, grain: 30 },
  { id: 'fankou', name: '樊口', x: 500, y: 470, owner: 'sun', kind: 'port', terrain: 'river', garrison: 4000, wall: 1.2, grain: 14 },
  { id: 'chibi', name: '赤壁', x: 570, y: 435, owner: 'sun', kind: 'port', terrain: 'river', garrison: 3000, wall: 1.2, grain: 12 },
  { id: 'wulin', name: '乌林', x: 520, y: 390, owner: 'cao', kind: 'port', terrain: 'river', garrison: 20000, wall: 1.2, grain: 30 },
  // 华容道是沼泽中的撤退路线，不是可守据点：按道路节点（kind='road'）建模、不设守军。
  // OpsCityDef.kind 已收录 'road'，这里不改动 @aiwar/sim 的类型定义。
  { id: 'huarong', name: '华容道', x: 520, y: 360, owner: 'cao', kind: 'road', terrain: 'mountain', garrison: 0, wall: 1.0, grain: 6 },
  { id: 'xiangyang', name: '襄阳', x: 280, y: 330, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 15000, wall: 2.0, grain: 40 },
  { id: 'chaisang', name: '柴桑', x: 620, y: 500, owner: 'sun', kind: 'city', terrain: 'river', garrison: 8000, wall: 1.6, grain: 24 },
  { id: 'jianye', name: '秣陵', x: 720, y: 540, owner: 'sun', kind: 'capital', terrain: 'river', garrison: 12000, wall: 2.0, grain: 40 },
  { id: 'hefei', name: '合肥', x: 620, y: 300, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 10000, wall: 1.6, grain: 26 },
  { id: 'yiling', name: '夷陵', x: 400, y: 560, owner: 'cao', kind: 'city', terrain: 'river', garrison: 6000, wall: 1.2, grain: 16 },
  // —— 新增 12 城 ——
  { id: 'changban', name: '长坂', x: 365, y: 505, owner: 'cao', kind: 'fort', terrain: 'plain', garrison: 3000, wall: 1.0, grain: 8 },
  { id: 'jingmen', name: '荆门', x: 245, y: 455, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 5000, wall: 1.4, grain: 18 },
  { id: 'hanjin', name: '汉津', x: 430, y: 395, owner: 'cao', kind: 'port', terrain: 'river', garrison: 4000, wall: 1.1, grain: 12 },
  { id: 'baling', name: '巴丘', x: 300, y: 600, owner: 'cao', kind: 'city', terrain: 'river', garrison: 5000, wall: 1.2, grain: 18 },
  { id: 'changsha', name: '长沙', x: 360, y: 655, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 8000, wall: 1.4, grain: 26 },
  { id: 'wuling', name: '武陵', x: 265, y: 635, owner: 'cao', kind: 'city', terrain: 'mountain', garrison: 4000, wall: 1.2, grain: 14 },
  { id: 'guiyang', name: '桂阳', x: 465, y: 660, owner: 'cao', kind: 'city', terrain: 'mountain', garrison: 3500, wall: 1.1, grain: 10 },
  { id: 'yuzhang', name: '豫章', x: 575, y: 590, owner: 'sun', kind: 'city', terrain: 'plain', garrison: 6000, wall: 1.3, grain: 20 },
  { id: 'pengze', name: '彭泽', x: 655, y: 470, owner: 'sun', kind: 'port', terrain: 'river', garrison: 3000, wall: 1.0, grain: 10 },
  { id: 'shouchun', name: '寿春', x: 660, y: 255, owner: 'cao', kind: 'city', terrain: 'plain', garrison: 8000, wall: 1.6, grain: 22 },
  { id: 'guangling', name: '广陵', x: 735, y: 420, owner: 'cao', kind: 'port', terrain: 'river', garrison: 4000, wall: 1.2, grain: 14 },
  { id: 'wujun', name: '吴郡', x: 760, y: 610, owner: 'sun', kind: 'city', terrain: 'river', garrison: 5000, wall: 1.2, grain: 18 },
]

// 日数按两城直线距离折算（陆路约 38 里/日、顺流约 50 里/日、山道约 30 里/日），
// 与档案第 3 节给出的既知行期（江陵—当阳 2 日、赤壁—乌林 1 日等）对齐。
const roads: OpsRoadDef[] = [
  { id: 'c1', from: 'jiangling', to: 'dangyang', days: 2, kind: 'road' },
  { id: 'c2', from: 'dangyang', to: 'xiakou', days: 3, kind: 'river', name: '汉水' },
  { id: 'c3', from: 'xiakou', to: 'fankou', days: 1, kind: 'river', name: '长江' },
  { id: 'c4', from: 'fankou', to: 'chibi', days: 1, kind: 'river', name: '长江' },
  { id: 'c5', from: 'chibi', to: 'wulin', days: 1, kind: 'river', name: '长江' },
  { id: 'c6', from: 'wulin', to: 'huarong', days: 1, kind: 'mountain' },
  { id: 'c7', from: 'huarong', to: 'jiangling', days: 2, kind: 'road' },
  { id: 'c9', from: 'xiangyang', to: 'dangyang', days: 3, kind: 'road' },
  { id: 'c10', from: 'xiakou', to: 'chaisang', days: 3, kind: 'river' },
  { id: 'c11', from: 'chaisang', to: 'jianye', days: 3, kind: 'river' },
  { id: 'c12', from: 'jianye', to: 'hefei', days: 4, kind: 'road' },
  { id: 'c13', from: 'hefei', to: 'xiakou', days: 5, kind: 'road' },
  { id: 'c14', from: 'fankou', to: 'xiakou', days: 1, kind: 'river' },
  { id: 'c15', from: 'yiling', to: 'jiangling', days: 2, kind: 'river' },
  { id: 'c16', from: 'yiling', to: 'wulin', days: 3, kind: 'river' },
  // —— 新增 34 路 ——
  { id: 'c17', from: 'changban', to: 'jiangling', days: 2, kind: 'road' },
  { id: 'c18', from: 'changban', to: 'dangyang', days: 1, kind: 'road' },
  { id: 'c19', from: 'changban', to: 'baling', days: 3, kind: 'road' },
  { id: 'c20', from: 'changban', to: 'xiakou', days: 3, kind: 'road' },
  { id: 'c21', from: 'jingmen', to: 'jiangling', days: 2, kind: 'road' },
  { id: 'c22', from: 'jingmen', to: 'xiangyang', days: 3, kind: 'road' },
  { id: 'c23', from: 'hanjin', to: 'xiakou', days: 2, kind: 'river', name: '汉水' },
  { id: 'c24', from: 'hanjin', to: 'dangyang', days: 3, kind: 'road' },
  { id: 'c25', from: 'hanjin', to: 'wulin', days: 2, kind: 'river', name: '汉水' },
  { id: 'c26', from: 'hanjin', to: 'xiangyang', days: 4, kind: 'river', name: '汉水' },
  { id: 'c27', from: 'baling', to: 'jiangling', days: 2, kind: 'river', name: '长江' },
  { id: 'c28', from: 'baling', to: 'yiling', days: 3, kind: 'river', name: '长江' },
  { id: 'c29', from: 'baling', to: 'changsha', days: 2, kind: 'road' },
  { id: 'c30', from: 'baling', to: 'wuling', days: 2, kind: 'mountain' },
  { id: 'c31', from: 'changsha', to: 'yiling', days: 3, kind: 'road' },
  { id: 'c32', from: 'changsha', to: 'guiyang', days: 3, kind: 'road' },
  { id: 'c33', from: 'changsha', to: 'wuling', days: 3, kind: 'road' },
  { id: 'c34', from: 'guiyang', to: 'yuzhang', days: 3, kind: 'mountain' },
  { id: 'c35', from: 'guiyang', to: 'yiling', days: 3, kind: 'road' },
  { id: 'c36', from: 'yuzhang', to: 'chaisang', days: 3, kind: 'road' },
  { id: 'c37', from: 'yuzhang', to: 'pengze', days: 4, kind: 'river' },
  { id: 'c38', from: 'yuzhang', to: 'jianye', days: 4, kind: 'river' },
  { id: 'c39', from: 'pengze', to: 'chaisang', days: 1, kind: 'river', name: '长江' },
  { id: 'c40', from: 'pengze', to: 'chibi', days: 2, kind: 'river', name: '长江' },
  { id: 'c41', from: 'pengze', to: 'guangling', days: 2, kind: 'river', name: '长江' },
  { id: 'c42', from: 'shouchun', to: 'hefei', days: 2, kind: 'road' },
  { id: 'c43', from: 'shouchun', to: 'guangling', days: 4, kind: 'road' },
  { id: 'c44', from: 'guangling', to: 'jianye', days: 3, kind: 'river', name: '长江' },
  { id: 'c45', from: 'guangling', to: 'hefei', days: 4, kind: 'road' },
  { id: 'c46', from: 'wujun', to: 'jianye', days: 2, kind: 'river' },
  { id: 'c47', from: 'wujun', to: 'yuzhang', days: 5, kind: 'road' },
  { id: 'c48', from: 'wulin', to: 'xiakou', days: 2, kind: 'river', name: '长江' },
  { id: 'c49', from: 'jingmen', to: 'baling', days: 4, kind: 'road' },
  { id: 'c50', from: 'hanjin', to: 'chibi', days: 4, kind: 'river', name: '汉水' },
]

// 兵力按档案第 2 节取约数：曹方实兵二十余万（北方兵十五六万 + 荆州降军七八万），
// 联军约五万（周瑜三万、刘备部约二万）。新增部队不改变这个总盘子，只是把「部」拆细：
// 黄盖火船队与程普部属周瑜麾下，刘琦江夏兵与张飞部属刘备麾下，蔡瑁水师是荆州降军本队。
const armies: OpsArmyDef[] = [
  { id: 'sun-main', name: '周瑜部', faction: 'sun', commander: '周瑜', troops: 30000, type: 'mixed', morale: 80, fatigue: 8, training: 1.1, foodDays: 20, city: 'chaisang', stealth: 0.3, naval: true },
  { id: 'shu-main', name: '刘备军', faction: 'shu', commander: '刘备', troops: 15000, type: 'infantry', morale: 72, fatigue: 14, training: 1.0, foodDays: 16, city: 'fankou', stealth: 0.3 },
  { id: 'shu-navy', name: '荆州水军', faction: 'shu', commander: '关羽', troops: 5000, type: 'fleet', morale: 74, fatigue: 8, training: 1.05, foodDays: 18, city: 'fankou', stealth: 0.35, naval: true },
  { id: 'cao-main', name: '曹军主力', faction: 'cao', commander: '丞相府', troops: 120000, type: 'mixed', morale: 68, fatigue: 20, training: 1.0, foodDays: 18, city: 'wulin', stealth: 0.1 },
  { id: 'cao-navy', name: '荆州降军水师', faction: 'cao', commander: '荆州水军', troops: 60000, type: 'fleet', morale: 55, fatigue: 18, training: 0.85, foodDays: 16, city: 'wulin', stealth: 0.1, naval: true },
  { id: 'cao-rear', name: '曹军后队', faction: 'cao', commander: '后军都督', troops: 50000, type: 'infantry', morale: 66, fatigue: 16, training: 0.95, foodDays: 18, city: 'xiangyang', stealth: 0.1 },
  { id: 'cao-east', name: '合肥守军', faction: 'cao', commander: '合肥守将', troops: 25000, type: 'infantry', morale: 66, fatigue: 8, training: 0.95, foodDays: 20, city: 'hefei', stealth: 0.1 },
  { id: 'cao-jiangling', name: '江陵守军', faction: 'cao', commander: '江陵守将', troops: 20000, type: 'infantry', morale: 64, fatigue: 10, training: 0.9, foodDays: 18, city: 'jiangling', stealth: 0.1 },
  // —— 新增 7 部 ——
  { id: 'sun-fire', name: '黄盖火船队', faction: 'sun', commander: '黄盖', troops: 4000, type: 'fleet', morale: 86, fatigue: 6, training: 1.15, foodDays: 12, city: 'fankou', stealth: 0.5, naval: true },
  { id: 'sun-cheng', name: '程普部', faction: 'sun', commander: '程普', troops: 10000, type: 'mixed', morale: 78, fatigue: 6, training: 1.05, foodDays: 18, city: 'chaisang', stealth: 0.3, naval: true },
  { id: 'shu-zhang', name: '张飞部', faction: 'shu', commander: '张飞', troops: 7000, type: 'infantry', morale: 76, fatigue: 12, training: 1.0, foodDays: 14, city: 'fankou', stealth: 0.3 },
  { id: 'shu-qi', name: '江夏兵', faction: 'shu', commander: '刘琦', troops: 8000, type: 'infantry', morale: 64, fatigue: 10, training: 0.9, foodDays: 16, city: 'xiakou', stealth: 0.25 },
  { id: 'cao-cai', name: '蔡瑁水师', faction: 'cao', commander: '蔡瑁', troops: 16000, type: 'fleet', morale: 48, fatigue: 16, training: 0.82, foodDays: 14, city: 'wulin', stealth: 0.1, naval: true },
  { id: 'cao-cao', name: '曹仁部', faction: 'cao', commander: '曹仁', troops: 14000, type: 'infantry', morale: 72, fatigue: 12, training: 1.0, foodDays: 20, city: 'jiangling', stealth: 0.1 },
  { id: 'cao-zhang', name: '张辽前锋', faction: 'cao', commander: '张辽', troops: 9000, type: 'cavalry', morale: 78, fatigue: 14, training: 1.05, foodDays: 14, city: 'dangyang', stealth: 0.15 },
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
      { id: 'opt4', label: '迁治鄂县，持久抵抗', desc: '放弃江东腹地，拉长战线。', hint: '消耗战。' },
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
    id: 'd6', title: '追击与取南郡', prompt: '曹军大溃。是追击曹军主力，还是抢先取江陵（南郡）？',
    options: [
      { id: 'opt1', label: '追击曹军主力', desc: '扩大战果，追歼曹军后队。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '抢取江陵（南郡）', desc: '夺取荆州要地。', hint: '战略收益。' },
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
  // —— 新增 3 个节点：降卒、连环船、疫起 ——
  {
    id: 'd8', title: '荆州降卒如何处置',
    prompt: '曹军收刘琮之众，荆州水军在其军中，人心未附。所得降卒与舟工，当如何处？',
    options: [
      { id: 'opt1', label: '受其舟师，择舟工为向导', desc: '留其善水者操舟，余众遣归。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '尽释其众，以收荆人之心', desc: '不夺其业，示以宽大。', hint: '得人心，不得其用。' },
      { id: 'opt3', label: '收其舟，分其众隶诸营', desc: '去其部伍，免为后患。', hint: '稳当，然荆人失望。' },
      { id: 'opt4', label: '拒而不纳，尽焚其舟', desc: '不留敌资，亦绝招降之路。', hint: '失荆人之望。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd9', title: '连环船：击其何处',
    prompt: '曹军战船首尾相连，人马居于其上。此阵可击者三：火、缆、粮。',
    options: [
      { id: 'opt1', label: '备火船，专攻其连环', desc: '一舟起火则众舟俱焚。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '先断其缆，使舟自散', desc: '解其连环，再以水军击之。', hint: '稳妥，战果有限。' },
      { id: 'opt3', label: '袭其江北粮道', desc: '不攻其舟，先绝其食。', hint: '需时间。' },
      { id: 'opt4', label: '遣细作入其营，焚其积聚', desc: '烧其营中薪草与舟具。', hint: '风险大。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd10', title: '曹军疫甚：再图一战还是收兵',
    prompt: '曹军营中疾疫日甚，士卒病者过半。可惜此再举火攻，或收兵保全？',
    options: [
      { id: 'opt1', label: '再待风候，二次举火', desc: '疫病正盛，再赌一次风向。', hint: '错过窗口后的第二次机会。', recommended: true },
      { id: 'opt2', label: '坚守不出，待其自退', desc: '疫病自会替我军作战。', hint: '僵持结局。' },
      { id: 'opt3', label: '移军夏口，避疫养锐', desc: '退一步，保全水军。', hint: '放弃江面。' },
      { id: 'opt4', label: '分兵袭其粮道，持久困之', desc: '不求决战，断其转输。', hint: '消耗战。' },
    ],
    defaultOption: 'opt1',
  },
]

const difficulty: Record<DifficultyId, Difficulty> = {
  hist: { id: 'hist', name: '史实', scoreFactor: 1, label: '情报较准，曹军轻敌', intelDelay: 1, strengthError: 0.2, falseReportPerTenDays: 0, scoutEfficiency: 1.3, enemyIntelQuality: 0.8, feintBreakChance: 0.05, decisionSeconds: 120, supplyFactor: 0.9, defaultQuality: 0.9 },
  normal: { id: 'normal', name: '普通', scoreFactor: 1, label: '情报有噪声，曹军会试探', intelDelay: 2, strengthError: 0.35, falseReportPerTenDays: 0.5, scoutEfficiency: 1.0, enemyIntelQuality: 1.0, feintBreakChance: 0.2, decisionSeconds: 100, supplyFactor: 1.0, defaultQuality: 0.65 },
  hard: { id: 'hard', name: '困难', scoreFactor: 1.08, label: '假报增多，曹军有防备', intelDelay: 3, strengthError: 0.5, falseReportPerTenDays: 1.2, scoutEfficiency: 0.8, enemyIntelQuality: 1.2, feintBreakChance: 0.4, decisionSeconds: 80, supplyFactor: 1.1, defaultQuality: 0.35 },
  hell: { id: 'hell', name: '地狱', scoreFactor: 1.15, label: '情报含混，风向难测', intelDelay: 4, strengthError: 0.65, falseReportPerTenDays: 2, scoutEfficiency: 0.65, enemyIntelQuality: 1.4, feintBreakChance: 0.6, decisionSeconds: 60, supplyFactor: 1.25, defaultQuality: 0.1 },
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
      { title: '夏口归属', text: '夏口时在江夏太守刘琦手中，刘备败退后与刘琦合兵于此，曹军并未控制夏口。' },
      { title: '兵力对比', text: '曹操号称八十万，实有北方兵约十五六万、荆州降军约七八万。孙刘联军约五万：周瑜部三万，刘备部约两万。' },
      { title: '赤壁初战', text: '联军西进，与曹军相遇于赤壁。曹军小战不利，退驻乌林，战船相连，军中疾疫流行。' },
      { title: '诈降火攻', text: '黄盖诈降，以火船突袭曹军连环船阵。东南风起，火势蔓延，曹军水师大溃。' },
      { title: '华容撤退', text: '曹操烧余船退走，经华容道泥泞难行，损失惨重，退回江陵。' },
      { title: '荆南四郡', text: '战后刘备徇荆南，长沙、武陵、桂阳、零陵相继归附；周瑜攻南郡，荆州归属成为孙刘之间的新问题。' },
      { title: '数字与分歧', text: '曹操兵力、赤壁地望、火攻月份均有不同说法。游戏内做写意处理。' },
    ],
    disclaimer: '本作以《三国志》及裴注等公开史料为背景进行写意改编：地图、兵力、时间线均经游戏化处理；指挥层以职务为主，关键人物保留姓名以便对照史书；数字与日期存在考据分歧，不代表严格战史。',
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
