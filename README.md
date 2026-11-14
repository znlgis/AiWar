# AiWar

B 站 Toy 互动作品：历史战争推演 + 关键节点决策。首发五战：《围魏救赵》《赤壁之战》《淝水之战》《四渡赤水》《淮海战役》。

玩家扮演齐国最高决策层，只能看到前线战报与最新势力范围；战场由确定性推演内核与敌方 AI（庞涓 + 魏廷）决定，结局不必与史实一致。单局约 20–30 分钟。

## 玩法

- 五场战役，共用「推演内核 + 关键节点决策 + 有限情报」框架；每场战役有独立地图、部队、决策节点、敌方 AI 与评分结局
- 7–8 个条件触发的关键节点（出兵方略、平陵示弱、邯郸危局、大梁震动、回师伏击、战后处置……），每个节点 2–4 个取舍；
- 节点之间每旬 1 枚军令牌：行军、佯攻、强攻、设伏、征粮、遣使、侦察；
- 战报有来源（斥候 / 边亭 / 降卒 / 商旅 / 使节 / 魏廷）、送达延迟与可信度；势力图只显示已知信息，可拖动平移、滚轮/双指缩放、双击复位；
- WebAudio 合成音效（战鼓、号角、简牍、胜负），无音频文件，顶栏可一键静音；
- 4 档难度只改变情报质量、决策窗口与魏军判断力，不给敌方战斗数值加成；
- 结算给 S/A/B/C/D 评级、真实战果、关键决策时间轴与史实对照。

## 开发

```bash
pnpm install
pnpm dev          # 本地开发
pnpm test         # 内核与平衡测试
pnpm build        # 构建 apps/site/dist
pnpm toy:zip      # 打包 release/aiwar-guiling.zip（包根 index.html）
pnpm toy:check    # Toy 发布自检（check-toy.mjs）
pnpm check        # typecheck + test + build + zip + check
```

本地按 Toy 子路径预览（验证相对路径不白屏）：

```bash
pnpm build && pnpm preview:toy   # http://127.0.0.1:4173/toy/aiwar-guiling/index.html
```

## 目录

```
apps/site/          # Toy 站点（Vue 3 + Vite + TS，运行时只依赖 Vue）
packages/sim/       # 纯 TS 推演内核（确定性随机、战斗、围城、情报、AI、评分）
packages/content/   # 战役数据与战报语料
scripts/            # 发布自检、zip、子路径预览、截图/试玩（开发用）、物料生成
docs/               # 方案、设计、技术、合规、开发计划
release/            # 发布物料：aiwar-guiling.zip、poster.png、icon.png
```

## 发布

`release/aiwar-guiling.zip` 直接上传即可（ZIP 根目录为 index.html，整包约 60 KB）。封面 `release/poster.png`（1200×900，4:3），图标 `release/icon.png`（512×512）按发布页要求填写。

## 文档

- [方案总览](docs/00-方案总览.md)
- [游戏设计细案](docs/01-游戏设计.md)
- [技术架构](docs/02-技术架构.md)
- [合规与发布](docs/03-合规与发布.md)
- [开发计划与扩展](docs/04-开发计划与扩展.md)