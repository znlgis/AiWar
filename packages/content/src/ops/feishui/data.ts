import type { OpsCampaign, OpsCityDef, OpsRoadDef, OpsArmyDef, DecisionNodeDef, Difficulty, DifficultyId } from '@aiwar/sim'

// 城邑补齐到 26 个：新增的 8 座都在 383 年淮南战场的行军走廊上（陈留、新蔡、下蔡、汝阴、
// 淮阴、历阳、夏口、竟陵），既有 18 座的坐标、归属与守备保持原样，避免改动已经跑通的战线。
const cities: OpsCityDef[] = [
  { id: 'changan', name: '长安', x: 180, y: 180, owner: 'qin', kind: 'capital', terrain: 'plain', garrison: 20000, wall: 2.4, grain: 80 },
  { id: 'luoyang', name: '洛阳', x: 320, y: 240, owner: 'qin', kind: 'city', terrain: 'plain', garrison: 12000, wall: 2.0, grain: 50 },
  { id: 'chenliu', name: '陈留', x: 356, y: 292, owner: 'qin', kind: 'city', terrain: 'plain', garrison: 8000, wall: 1.4, grain: 22 },
  { id: 'xiangcheng', name: '项城', x: 400, y: 330, owner: 'qin', kind: 'city', terrain: 'plain', garrison: 30000, wall: 1.6, grain: 40 },
  { id: 'xincai', name: '新蔡', x: 452, y: 330, owner: 'qin', kind: 'city', terrain: 'plain', garrison: 6000, wall: 1.2, grain: 18 },
  { id: 'yingkou', name: '颍口', x: 404, y: 486, owner: 'qin', kind: 'port', terrain: 'river', garrison: 8000, wall: 1.2, grain: 20 },
  { id: 'xiacai', name: '下蔡', x: 372, y: 396, owner: 'qin', kind: 'city', terrain: 'river', garrison: 5000, wall: 1.2, grain: 14 },
  { id: 'ruyin', name: '汝阴', x: 300, y: 452, owner: 'qin', kind: 'city', terrain: 'river', garrison: 4000, wall: 1.1, grain: 12 },
  { id: 'shouyang', name: '寿阳', x: 520, y: 420, owner: 'jin', kind: 'city', terrain: 'city', garrison: 8000, wall: 1.8, grain: 26 },
  { id: 'xiashi', name: '硖石', x: 430, y: 372, owner: 'jin', kind: 'fort', terrain: 'mountain', garrison: 5000, wall: 1.6, grain: 12 },
  { id: 'bagongshan', name: '八公山', x: 524, y: 350, owner: 'jin', kind: 'fort', terrain: 'mountain', garrison: 800, wall: 1.0, grain: 4 },
  { id: 'dongjindu', name: '东津渡', x: 588, y: 452, owner: 'jin', kind: 'port', terrain: 'river', garrison: 1000, wall: 0.8, grain: 4 },
  { id: 'luojian', name: '洛涧', x: 664, y: 468, owner: 'qin', kind: 'port', terrain: 'river', garrison: 20000, wall: 1.0, grain: 20 },
  { id: 'qinggang', name: '青冈', x: 458, y: 478, owner: 'jin', kind: 'city', terrain: 'plain', garrison: 500, wall: 0.8, grain: 6 },
  { id: 'hefei', name: '合肥', x: 560, y: 550, owner: 'jin', kind: 'city', terrain: 'river', garrison: 6000, wall: 1.8, grain: 30 },
  { id: 'jiankang', name: '建康', x: 700, y: 590, owner: 'jin', kind: 'capital', terrain: 'river', garrison: 15000, wall: 2.2, grain: 60 },
  { id: 'guangling', name: '广陵', x: 680, y: 540, owner: 'jin', kind: 'city', terrain: 'river', garrison: 9000, wall: 1.6, grain: 24 },
  { id: 'huaiyin', name: '淮阴', x: 716, y: 486, owner: 'jin', kind: 'port', terrain: 'river', garrison: 2500, wall: 1.2, grain: 10 },
  { id: 'jingkou', name: '京口', x: 660, y: 610, owner: 'jin', kind: 'city', terrain: 'river', garrison: 5000, wall: 1.6, grain: 18 },
  { id: 'liyang', name: '历阳', x: 752, y: 598, owner: 'jin', kind: 'port', terrain: 'river', garrison: 3000, wall: 1.2, grain: 12 },
  { id: 'xiakou', name: '夏口', x: 472, y: 626, owner: 'jin', kind: 'port', terrain: 'river', garrison: 4000, wall: 1.4, grain: 16 },
  { id: 'jingling', name: '竟陵', x: 352, y: 648, owner: 'jin', kind: 'city', terrain: 'river', garrison: 3000, wall: 1.2, grain: 12 },
  { id: 'pengcheng', name: '彭城', x: 560, y: 300, owner: 'qin', kind: 'city', terrain: 'plain', garrison: 15000, wall: 1.6, grain: 24 },
  { id: 'xiangyang', name: '襄阳', x: 330, y: 500, owner: 'qin', kind: 'city', terrain: 'mountain', garrison: 12000, wall: 2.4, grain: 30 },
  { id: 'jiangling', name: '江陵', x: 380, y: 590, owner: 'jin', kind: 'city', terrain: 'river', garrison: 30000, wall: 2.0, grain: 40 },
  { id: 'yuncheng', name: '郧城', x: 440, y: 528, owner: 'qin', kind: 'city', terrain: 'plain', garrison: 10000, wall: 1.2, grain: 16 },
]

// 道路补到 48 条。既有 20 条的天数一个不动：aiTick 里秦军前锋的到位日、玩家部队的到位日
// 都按这些天数在跑，改了就会把已经定型的胜负节奏推翻。新增 28 条只在“新邑—新邑 / 新邑—旧邑”
// 之间接线，且天数按里程逐条试算过，保证既有 18 城之间任何一对的里程都不比原来短——
// 否则等于给玩家开了一条史书上没有的近路。
const roads: OpsRoadDef[] = [
  { id: 'f1', from: 'changan', to: 'luoyang', days: 9, kind: 'road', name: '崤函道' },
  { id: 'f2', from: 'luoyang', to: 'xiangcheng', days: 6, kind: 'road' },
  { id: 'f3', from: 'xiangcheng', to: 'yingkou', days: 3, kind: 'road' },
  { id: 'f4', from: 'yingkou', to: 'shouyang', days: 2, kind: 'river', name: '淮颍水网' },
  { id: 'f5', from: 'shouyang', to: 'xiashi', days: 1, kind: 'river' },
  { id: 'f6', from: 'shouyang', to: 'bagongshan', days: 1, kind: 'mountain' },
  { id: 'f7', from: 'shouyang', to: 'dongjindu', days: 1, kind: 'river', name: '淝水' },
  { id: 'f8', from: 'shouyang', to: 'luojian', days: 2, kind: 'road' },
  { id: 'f9', from: 'luojian', to: 'dongjindu', days: 2, kind: 'road' },
  { id: 'f10', from: 'shouyang', to: 'qinggang', days: 1, kind: 'road' },
  { id: 'f11', from: 'shouyang', to: 'hefei', days: 4, kind: 'road' },
  { id: 'f12', from: 'hefei', to: 'jiankang', days: 5, kind: 'road' },
  { id: 'f13', from: 'jiankang', to: 'guangling', days: 2, kind: 'river' },
  { id: 'f14', from: 'guangling', to: 'jingkou', days: 1, kind: 'river' },
  { id: 'f15', from: 'guangling', to: 'shouyang', days: 6, kind: 'road' },
  { id: 'f16', from: 'pengcheng', to: 'shouyang', days: 6, kind: 'road' },
  { id: 'f17', from: 'xiangyang', to: 'jiangling', days: 5, kind: 'road' },
  { id: 'f18', from: 'jiangling', to: 'yuncheng', days: 4, kind: 'road' },
  { id: 'f19', from: 'yuncheng', to: 'hefei', days: 6, kind: 'road' },
  { id: 'f20', from: 'luoyang', to: 'pengcheng', days: 8, kind: 'road' },

  // 汝颍—淮北一线（秦军南下与粮运的干线）
  { id: 'f21', from: 'luoyang', to: 'chenliu', days: 3, kind: 'road' },
  { id: 'f22', from: 'chenliu', to: 'pengcheng', days: 6, kind: 'road' },
  { id: 'f23', from: 'xiangcheng', to: 'xincai', days: 2, kind: 'road' },
  { id: 'f24', from: 'xincai', to: 'xiacai', days: 3, kind: 'road' },
  { id: 'f25', from: 'xiacai', to: 'xiashi', days: 2, kind: 'river', name: '淮上舟渡' },
  { id: 'f26', from: 'xiacai', to: 'ruyin', days: 2, kind: 'road' },
  { id: 'f27', from: 'ruyin', to: 'yingkou', days: 3, kind: 'river', name: '汝颍水网' },
  { id: 'f28', from: 'yingkou', to: 'xiacai', days: 2, kind: 'river' },
  { id: 'f29', from: 'xiangcheng', to: 'chenliu', days: 5, kind: 'road' },
  { id: 'f30', from: 'xiangcheng', to: 'xiacai', days: 2, kind: 'road' },
  { id: 'f31', from: 'xincai', to: 'xiashi', days: 2, kind: 'road', name: '淮北间道' },
  { id: 'f32', from: 'xincai', to: 'bagongshan', days: 2, kind: 'mountain' },
  { id: 'f33', from: 'chenliu', to: 'xincai', days: 5, kind: 'road' },
  { id: 'f34', from: 'chenliu', to: 'xiacai', days: 5, kind: 'road' },
  { id: 'f35', from: 'xiashi', to: 'chenliu', days: 7, kind: 'road', name: '淮北迂道' },

  // 淮东—江东（北府兵与建康之间的水陆通道）
  { id: 'f36', from: 'guangling', to: 'huaiyin', days: 2, kind: 'river' },
  { id: 'f37', from: 'huaiyin', to: 'jingkou', days: 3, kind: 'river' },
  { id: 'f38', from: 'huaiyin', to: 'liyang', days: 3, kind: 'river' },
  { id: 'f39', from: 'liyang', to: 'jiankang', days: 1, kind: 'river', name: '横江渡' },
  { id: 'f40', from: 'liyang', to: 'guangling', days: 3, kind: 'road' },
  { id: 'f41', from: 'jingkou', to: 'liyang', days: 2, kind: 'river' },
  { id: 'f42', from: 'huaiyin', to: 'luojian', days: 6, kind: 'river', name: '淮东迂道' },
  { id: 'f43', from: 'huaiyin', to: 'jiankang', days: 4, kind: 'river' },

  // 荆襄—汉东（桓冲一线，与淮南主战场互为牵制）
  { id: 'f44', from: 'jiangling', to: 'xiakou', days: 3, kind: 'river', name: '汉水入江' },
  { id: 'f45', from: 'xiakou', to: 'jingling', days: 4, kind: 'river' },
  { id: 'f46', from: 'xiakou', to: 'yuncheng', days: 3, kind: 'road' },
  { id: 'f47', from: 'jingling', to: 'jiangling', days: 2, kind: 'road' },
  { id: 'f48', from: 'ruyin', to: 'xiangyang', days: 6, kind: 'road', name: '汉东泽道' },
]

// 部队补到 15 支：新增的三支晋军都驻在后方的京口、建康、江陵，新增的两支秦军驻长安、襄阳，
// 都远离首日战场。这样既补足了编制（刘牢之、谢琰、张蚝、凉州兵、蜀汉水师），
// 又不会在开局第一天就把洛涧、寿阳的兵力对比改掉。
const armies: OpsArmyDef[] = [
  { id: 'jin-bei', name: '北府兵', faction: 'jin', commander: '前锋都督', troops: 45000, type: 'infantry', morale: 80, fatigue: 10, training: 1.2, foodDays: 20, city: 'guangling', stealth: 0.4 },
  { id: 'jin-main', name: '晋军主力', faction: 'jin', commander: '征讨大都督', troops: 30000, type: 'mixed', morale: 75, fatigue: 8, training: 1.1, foodDays: 20, city: 'jiankang', stealth: 0.3 },
  { id: 'jin-shui', name: '水军', faction: 'jin', commander: '水军都督', troops: 5000, type: 'fleet', morale: 76, fatigue: 6, training: 1.05, foodDays: 18, city: 'guangling', stealth: 0.4 },
  { id: 'jin-west', name: '荆州军', faction: 'jin', commander: '荆州刺史', troops: 40000, type: 'infantry', morale: 72, fatigue: 8, training: 1.0, foodDays: 18, city: 'jiangling', stealth: 0.25 },
  { id: 'jin-lao', name: '刘牢之部', faction: 'jin', commander: '广陵相', troops: 5000, type: 'cavalry', morale: 82, fatigue: 6, training: 1.28, foodDays: 18, city: 'jingkou', stealth: 0.45 },
  { id: 'jin-yan', name: '谢琰部', faction: 'jin', commander: '辅国将军', troops: 6000, type: 'mixed', morale: 78, fatigue: 8, training: 1.15, foodDays: 18, city: 'jiankang', stealth: 0.35 },
  { id: 'jin-hu', name: '胡彬水军', faction: 'jin', commander: '龙骧将军', troops: 5000, type: 'fleet', morale: 74, fatigue: 8, training: 1.05, foodDays: 16, city: 'huaiyin', stealth: 0.4 },
  { id: 'qin-front', name: '秦军前锋', faction: 'qin', commander: '前锋都督', troops: 250000, type: 'mixed', morale: 76, fatigue: 8, training: 1.0, foodDays: 24, city: 'yingkou', stealth: 0.1 },
  { id: 'qin-main', name: '秦军本营', faction: 'qin', commander: '大秦天王', troops: 420000, type: 'mixed', morale: 74, fatigue: 6, training: 0.95, foodDays: 26, city: 'xiangcheng', stealth: 0.1 },
  { id: 'qin-liang', name: '洛涧守军', faction: 'qin', commander: '梁成部', troops: 50000, type: 'infantry', morale: 70, fatigue: 6, training: 0.95, foodDays: 18, city: 'luojian', stealth: 0.15 },
  { id: 'qin-east', name: '东路秦军', faction: 'qin', commander: '幽冀兵', troops: 30000, type: 'infantry', morale: 68, fatigue: 8, training: 0.9, foodDays: 18, city: 'pengcheng', stealth: 0.1 },
  { id: 'qin-west', name: '西线秦军', faction: 'qin', commander: '西线都督', troops: 30000, type: 'mixed', morale: 70, fatigue: 8, training: 0.95, foodDays: 18, city: 'xiangyang', stealth: 0.1 },
  { id: 'qin-3', name: '慕容垂别部', faction: 'qin', commander: '别部都督', troops: 30000, type: 'infantry', morale: 72, fatigue: 6, training: 1.0, foodDays: 18, city: 'yuncheng', stealth: 0.1 },
  { id: 'qin-zhang', name: '张蚝部', faction: 'qin', commander: '虎牙将军', troops: 20000, type: 'mixed', morale: 74, fatigue: 6, training: 1.05, foodDays: 20, city: 'yingkou', stealth: 0.15 },
  { id: 'qin-liangzhou', name: '凉州兵', faction: 'qin', commander: '凉州刺史', troops: 12000, type: 'infantry', morale: 66, fatigue: 14, training: 0.9, foodDays: 16, city: 'changan', stealth: 0.05 },
]

// 决策补到 11 个。d1—d8 的 id、选项 id 一律不动（回归测试按 opt1 走史实线，
// 改 id 会让整条史实路线失效）；新增 d9—d11 覆盖档案里被砍掉的三处：硖石救不救、
// 涉渡时机、庙堂善后。
const decisions: DecisionNodeDef[] = [
  {
    id: 'd1', title: '先手：要不要主动出击', prompt: '秦军前锋已抵颍口，后续大军仍在路上。是主动出击，还是坚守淮河一线？',
    options: [
      { id: 'opt1', label: '主动出击，趁敌军未集', desc: '抢先手，但晋军兵力有限。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '坚守淮河，等敌军疲', desc: '以逸待劳，但丧失主动权。', hint: '保守。' },
      { id: 'opt3', label: '退守长江', desc: '保存兵力，但江淮尽失。', hint: '极保守。' },
      { id: 'opt4', label: '派水军袭扰秦军粮道', desc: '以水军优势断粮。', hint: '需要水军。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd2', title: '寿阳告急：先派谁', prompt: '秦军前锋逼近寿阳。谁去增援？',
    options: [
      { id: 'opt1', label: '派北府兵主力增援寿阳', desc: '精锐尽出，但后方空虚。', hint: '关键。', recommended: true },
      { id: 'opt2', label: '派水军沿淮河增援', desc: '速度慢，但可与寿阳互为犄角。', hint: '稳。' },
      { id: 'opt3', label: '不动，坚守广陵', desc: '保存实力，但寿阳可能失守。', hint: '风险高。' },
      { id: 'opt4', label: '派荆州军东来', desc: '兵力强，但路途远。', hint: '来不及。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd3', title: '洛涧：主力跟进还是精锐突袭', prompt: '秦军梁成部在洛涧设栅。是否派精锐突袭，主力跟进？',
    options: [
      { id: 'opt1', label: '派精锐五千直前渡水，突袭洛涧', desc: '以少击众，若成可破秦军淮河封锁。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '主力强攻洛涧', desc: '兵力集中，但伤亡大。', hint: '稳妥。' },
      { id: 'opt3', label: '绕开洛涧，直趋寿阳', desc: '避实就虚，但侧翼暴露。', hint: '风险。' },
      { id: 'opt4', label: '按兵不动，等秦军来攻', desc: '以逸待劳。', hint: '保守。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd4', title: '朱序的情报：信还是不信', prompt: '被俘的晋将朱序遣使来告：秦军尚未集，宜速击其前锋。可信吗？',
    options: [
      { id: 'opt1', label: '信，立即进击', desc: '若情报属实，可夺其气。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '疑，先做侦察', desc: '稳妥，但可能错过时机。', hint: '谨慎。' },
      { id: 'opt3', label: '不信，按原计划', desc: '不冒风险。', hint: '保守。' },
      { id: 'opt4', label: '将计就计，试探秦军', desc: '以佯动验证。', hint: '复杂。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd5', title: '淝水：请秦军后撤，还是强渡', prompt: '两军隔淝水对峙。谢玄请秦军稍退，以便晋军渡河决战。秦军会退吗？',
    options: [
      { id: 'opt1', label: '请秦军后撤，趁乱渡河', desc: '赌秦军后撤失控。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '强渡淝水', desc: '正面强攻，伤亡大。', hint: '冒险。' },
      { id: 'opt3', label: '继续对峙，等秦军自乱', desc: '以时间换空间。', hint: '保守。' },
      { id: 'opt4', label: '分兵绕后', desc: '出奇兵，但兵力分散。', hint: '复杂。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd6', title: '追击：追到青冈还是见好就收', prompt: '秦军全线崩溃。是追到青冈扩大战果，还是收兵？',
    options: [
      { id: 'opt1', label: '追到青冈', desc: '扩大战果，但部队疲惫。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '见好就收', desc: '保存兵力，但战果有限。', hint: '稳妥。' },
      { id: 'opt3', label: '分兵追击', desc: '扩大覆盖面，但易被反击。', hint: '风险。' },
      { id: 'opt4', label: '停止追击，收复寿阳', desc: '巩固战果。', hint: '稳。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd7', title: '荆州方向：桓冲的援军', prompt: '荆州方向请求增援。是否分兵西援？',
    options: [
      { id: 'opt1', label: '拒绝，集中兵力于淮南', desc: '主战场优先。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '分兵三千西援', desc: '照顾荆州，但削弱主战场。', hint: '分散。' },
      { id: 'opt3', label: '命荆州军独立行动', desc: '不加干预。', hint: '稳妥。' },
      { id: 'opt4', label: '全军西调', desc: '放弃淮南。', hint: '不可取。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd8', title: '战后：北伐还是固守', prompt: '秦军败退。是乘胜北伐，还是固守江淮？',
    options: [
      { id: 'opt1', label: '北伐，收复淮北', desc: '扩大战果，但冒险。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '固守江淮', desc: '保存实力。', hint: '稳妥。' },
      { id: 'opt3', label: '经营荆州', desc: '西线优先。', hint: '战略选择。' },
      { id: 'opt4', label: '遣使议和', desc: '以战胜之威换取和平。', hint: '外交。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd9', title: '涉渡：秦军退到一半，还是等它退完', prompt: '秦军已麾兵使却，什伍未乱而已动。何时涉渡淝水？',
    options: [
      { id: 'opt1', label: '趁其初动即渡', desc: '秦军退势未定，八千人足可冲其阵。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '待其退毕再渡', desc: '自己阵脚可整，但给了秦军回身的工夫。', hint: '稳妥。' },
      { id: 'opt3', label: '分兵绕上游浅滩', desc: '避正面，但兵力分散、涉渡更慢。', hint: '复杂。' },
      { id: 'opt4', label: '不渡，据东岸持重', desc: '不赌后撤，但粮少兵寡，对峙不利。', hint: '保守。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd10', title: '硖石：胡彬被围，救还是不救', prompt: '胡彬水军粮尽，信使又为秦军所截。硖石孤悬，主力当如何？',
    options: [
      { id: 'opt1', label: '不救，全力趋洛涧', desc: '舍一隅而争淮上通道。', hint: '历史选择。', recommended: true },
      { id: 'opt2', label: '分水军救硖石', desc: '救出孤军，但主力因此分力。', hint: '稳。' },
      { id: 'opt3', label: '佯攻下蔡以解围', desc: '攻其必救，代价是暴露意图。', hint: '巧。' },
      { id: 'opt4', label: '弃硖石，水军东归', desc: '保全水军，弃一城以实主力。', hint: '弃子。' },
    ],
    defaultOption: 'opt1',
  },
  {
    id: 'd11', title: '善后：庙堂猜忌与北伐止步', prompt: '捷书既上，朝中已有“征役既久，宜置戍而还”之议。谢氏当何以自处？',
    options: [
      { id: 'opt1', label: '让功于朝，请留中军', desc: '压低猜忌，但北伐之力随之减。', hint: '历史结局。', recommended: true },
      { id: 'opt2', label: '固请北伐，乘胜取淮北', desc: '扩大战果，猜忌也随之而起。', hint: '进取。' },
      { id: 'opt3', label: '交出兵权，求镇京口', desc: '避祸自保，但北府兵从此为朝廷所制。', hint: '退。' },
      { id: 'opt4', label: '密结桓氏以自固', desc: '借荆州之势抗衡台省，风险极大。', hint: '险。' },
    ],
    defaultOption: 'opt1',
  },
]

const difficulty: Record<DifficultyId, Difficulty> = {
  hist: { id: 'hist', name: '史实', scoreFactor: 1, label: '情报较准，秦军协同较慢', intelDelay: 1, strengthError: 0.2, falseReportPerTenDays: 0, scoutEfficiency: 1.3, enemyIntelQuality: 0.8, feintBreakChance: 0.05, decisionSeconds: 120, supplyFactor: 0.9, defaultQuality: 0.9 },
  normal: { id: 'normal', name: '普通', scoreFactor: 1, label: '情报有噪声，秦军会试探', intelDelay: 2, strengthError: 0.35, falseReportPerTenDays: 0.5, scoutEfficiency: 1.0, enemyIntelQuality: 1.0, feintBreakChance: 0.2, decisionSeconds: 100, supplyFactor: 1.0, defaultQuality: 0.65 },
  hard: { id: 'hard', name: '困难', scoreFactor: 1.08, label: '假报增多，秦军会稳阵', intelDelay: 3, strengthError: 0.5, falseReportPerTenDays: 1.2, scoutEfficiency: 0.8, enemyIntelQuality: 1.2, feintBreakChance: 0.4, decisionSeconds: 80, supplyFactor: 1.1, defaultQuality: 0.35 },
  hell: { id: 'hell', name: '地狱', scoreFactor: 1.15, label: '情报含混，秦军不轻易退', intelDelay: 4, strengthError: 0.65, falseReportPerTenDays: 2, scoutEfficiency: 0.65, enemyIntelQuality: 1.4, feintBreakChance: 0.6, decisionSeconds: 60, supplyFactor: 1.25, defaultQuality: 0.1 },
}

export const feishuiCampaign: OpsCampaign = {
  meta: {
    id: 'feishui-383',
    title: '淝水之战',
    subtitle: '东晋太元八年 · 383',
    era: '东晋十六国',
    premise: '八万北府兵对号称百万的前秦大军，胜负在淝水一退之间。',
    dateLabel: '太元八年 · 秦军南下',
    startLabel: '第一日',
    playerRole: '东晋朝廷与征讨大都督府（职务视角，不具名）',
    background:
      '前秦统一北方后举国南征，号称百万，实到一线约二三十万。东晋以八万北府兵为主力，依托淮河、淝水与寿阳坚城，采取"外示镇静、内里抢时间"的方略。决战的转折点不在兵力，而在秦军后撤时的组织崩溃与内部离心。',
    objective: '守住寿阳—合肥—建康一线，击退秦军；或在野战中击破其前锋，瓦解其南征。',
    infoTip: '秦军号称百万、实兵有限；情报有误差，降将之言真假难辨。兵力不是唯一的胜负手，组织与士气才是。',
    dossier: [
      { title: '战略态势', text: '前秦统一北方，苻坚决意南征。东晋以淮河—汉水—长江为缓冲，谢安主政，谢玄镇广陵练北府兵，桓冲守荆州。' },
      { title: '兵力对比', text: '前秦号称百万，实发戎卒六十余万、骑二十七万；到一线约二三十万。东晋淮南方向八万，其中北府兵为核心；西线荆州军约十万，未参加淝水主战场。凉州、蜀地、幽冀诸军未及参战者不计入盘面。' },
      { title: '洛涧之战', text: '刘牢之率五千北府兵直前渡水，击破秦军梁成部，斩梁成，秦军损失约一万五千，淮河封锁被打破。' },
      { title: '淝水决战', text: '两军隔淝水对峙。晋军请秦军后撤以便渡河，苻坚、苻融自恃兵多，欲半渡而击，麾兵使退；秦军一退不可复止。' },
      { title: '崩溃与追击', text: '朱序在阵后高呼"秦兵败矣"，晋军八千涉渡，苻融马倒被杀，秦军全线崩溃，晋军追至青冈。' },
      { title: '数字与分歧', text: '洛涧秦军有五万、二万等不同说法；决战日期《通鉴》系于十一月，另有农历十月二十日（公历约 11 月 30 日）一说；八公山里数亦有分歧。游戏内做写意处理。' },
    ],
    disclaimer: '本作以《晋书》《资治通鉴》等公开史料为背景进行写意改编：地图、兵力、时间线均经游戏化处理；指挥层以职务代称，史料中确需指认的降将、来使保留姓名；数字与日期存在考据分歧，不代表严格战史。',
  },
  playerFaction: 'jin',
  enemyFactions: ['qin'],
  factions: {
    jin: { name: '东晋', color: '#3a7a5a', short: '晋' },
    qin: { name: '前秦', color: '#8a3b3b', short: '秦' },
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
    ambushMultiplier: 1.6,
    routTroopRatio: 0.55,
    routMorale: 25,
    supplyFactor: 1,
    maxFoodDays: 22,
    resupplyDays: 3,
    siegeGarrisonLoss: 0.022,
    siegeGrainLoss: 1,
    desertionPerDay: 0.008,
  },
  weather: [
    { id: 'clear', label: '晴' },
    { id: 'rain', label: '雨' },
    { id: 'fog', label: '雾' },
  ],
  rulesId: 'feishui-383',
}
