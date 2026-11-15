import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// BambooBuddy 的 Toy 发布自检
//
// 四个项目（CHAGS / BambooBuddy / mathmindforge / shfr）共用同一份规则，
// 只有下面 CONFIG 这一段不同；改规则时四个仓库要一起改，并把 RULES_VERSION 对齐。
//
// 依据：《Toy 开发者 FAQ》2026-10-23「四、内容规范与合规」+ 发布页包体限制，
// 以及 2026-11 两次真实退件（内容审核 / 包体安全检查）暴露出来的判定点。
//
// 用法：pnpm toy:check（构建之后跑；本脚本不替你构建，免得读到上一轮的旧产物）
// ============================================================================
const RULES_VERSION = '2026-11-12';
const CONFIG = {
  name: 'AI 战争模拟器 · 五战',
  dist: 'apps/site/dist',
  zip: 'release/aiwar-guiling.zip',
  sourceRoots: ['apps/site/src', 'packages/sim/src', 'packages/content/src'],
  allowHosts: ['www.w3.org'],
  urlTextAllow: ['vuejs.org'],
  sensitiveWords: ['血', '尸', '屠杀', '斩首', '自杀', '色情', '赌博', '毒品', '枪支', '恐怖袭击', '剿总', '民国'],
  securityPatterns: [
    { name: 'eval', pattern: 'eval(' },
    { name: 'new Function', pattern: 'new Function' },
    { name: 'document.write', pattern: 'document.write' },
    { name: 'XHR', pattern: 'XMLHttpRequest' },
    { name: 'WebSocket', pattern: 'WebSocket' },
    { name: 'atob', pattern: 'atob(' },
    { name: 'webdriver', pattern: 'webdriver' },
  ],
  requireMeta: true,
  knownVendorHits: [],
};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, CONFIG.dist);

/** 平台硬上限 */
const LIMITS = { entryBytes: 1024 * 1024, packageBytes: 50 * 1024 * 1024 };

/** 平台会发布的白名单后缀（FAQ 七·1）；不在表里的会被静默过滤 */
const ALLOWED_EXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.json', '.txt', '.xml', '.webmanifest', '.md', '.csv', '.tsv', '.wasm', '.data', '.bin', '.glsl', '.vert', '.frag', '.atlas', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.bmp', '.avif', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.mp4', '.webm']);
const CODE_EXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json']);

let errors = 0;
let warnings = 0;
const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => { console.error('  ✗ ' + m); errors += 1; };
const warn = (m) => { console.warn('  · ' + m); warnings += 1; };

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** CRC32（IEEE 802.3）：与 zip 中央目录里的校验值直接比对，无需解压 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const kb = (n) => (n / 1024).toFixed(1);
const mb = (n) => (n / 1024 / 1024).toFixed(2);

console.log('Toy 发布自检（规则 ' + RULES_VERSION + '）· ' + CONFIG.name);

if (!existsSync(DIST)) {
  console.error('✗ 找不到 ' + CONFIG.dist + ' —— 先构建（本检查不替你构建）');
  process.exit(1);
}

const files = walk(DIST);
const relOf = (p) => relative(DIST, p).replace(/\\/g, '/');

/** ---------- 1. 包根与体积 ---------- */
const entryPath = join(DIST, 'index.html');
if (!existsSync(entryPath)) fail('包根没有 index.html（入口必须在压缩包根目录，不能多套一层）');
else {
  const bytes = statSync(entryPath).size;
  if (bytes <= LIMITS.entryBytes) ok('入口 index.html ' + kb(bytes) + ' KB / 上限 1024 KB');
  else fail('入口 index.html ' + kb(bytes) + ' KB 超过平台 1024 KB 硬上限');
}
/** 打包产物本身（dist 里顺手放的分发 zip）不参与「要发布哪些文件」的判定 */
const ARTIFACT_SKIP = /\.zip$/i;
const shipped = files.filter((p) => !ARTIFACT_SKIP.test(relOf(p)));
// 体积也只按「真正会上传的文件」算：否则 dist 里放一个备份 zip 会虚增包体预算
const totalBytes = shipped.reduce((sum, p) => sum + statSync(p).size, 0);
if (totalBytes <= LIMITS.packageBytes) ok('整包 ' + mb(totalBytes) + ' MB（' + shipped.length + ' 个文件）/ 上限 50 MB');
else fail('整包 ' + mb(totalBytes) + ' MB 超过 50 MB（更大包体要单独申请）');

/** ---------- 2. 后缀白名单 / 多余文件 ---------- */
const badExt = shipped.map((p) => ({ p: relOf(p), ext: extname(p).toLowerCase() })).filter((x) => !ALLOWED_EXT.has(x.ext));
if (badExt.length === 0) ok('所有文件后缀都在平台白名单内');
else for (const x of badExt.slice(0, 8)) fail('白名单外的后缀：' + x.p);
const junk = files.map(relOf).filter((n) => /(\.map$)|(^|\/)(\.DS_Store|\.Thumbs\.db)$/.test(n));
if (junk.length === 0) ok('没有 sourcemap / 系统垃圾文件');
else for (const n of junk.slice(0, 8)) fail('不该发布的文件：' + n);

/** ---------- 3. 相对路径：Toy 跑在 /toy/<slug>/ 子路径下 ---------- */
const textFiles = files.filter((p) => CODE_EXT.has(extname(p).toLowerCase()));
const texts = new Map(textFiles.map((p) => [relOf(p), readFileSync(p, 'utf8')]));
const absHits = [];
for (const [name, text] of texts) {
  if (!/\.(?:html|htm|css|js|mjs)$/.test(name)) continue;
  // html/css 里的站根绝对引用
  if (/\.(?:html|htm|css)$/.test(name)) {
    for (const m of text.matchAll(/(?:src|href)\s*=\s*["']\/(?!\/)[^"']*/g)) absHits.push(name + ' -> ' + m[0]);
    for (const m of text.matchAll(/url\(\s*["']?\/(?!\/)[^"')]+/g)) absHits.push(name + ' -> ' + m[0]);
  }
  // JS 分块里的站根绝对路径同样会白屏：只扫 html/css 会漏掉 base 回归与手动 import
  for (const m of text.matchAll(/(?:^|[^\w$.])(?:from\s*|import\s*\(|import\s*)["']\/(?!\/)[^"']+/g)) absHits.push(name + ' -> ' + m[0].trim());
  for (const m of text.matchAll(/new URL\(\s*["']\/(?!\/)[^"']+/g)) absHits.push(name + ' -> ' + m[0]);
}
if (absHits.length === 0) ok('资源引用全是相对路径');
else for (const hit of absHits.slice(0, 6)) fail('站根绝对路径会白屏：' + hit);

/** ---------- 4. 站外链接 ---------- */
// 子串匹配会被 https://evil.example/?www.w3.org 绕过，按 URL 解析出的 host 比对
const hostAllowed = (url) => {
  let host;
  try { host = new URL(url).host; } catch { return false; }
  return CONFIG.allowHosts.some((allowed) => host === allowed || host.endsWith('.' + allowed));
};
const externalLoads = [];
for (const [name, text] of texts) {
  if (!/\.(?:html|htm|css)$/.test(name)) continue;
  for (const m of text.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/g)) {
    if (!hostAllowed(m[1])) externalLoads.push(name + ' -> ' + m[1]);
  }
}
if (externalLoads.length === 0) ok('没有站外资源加载');
else for (const hit of externalLoads.slice(0, 6)) fail('页面在加载站外资源：' + hit);

/** ---------- 5. 代码安全（包体安全退件的直接原因）---------- */
const securityHits = [];
for (const [name, text] of texts) {
  if (!/\.(?:js|mjs|html)$/.test(name)) continue;
  for (const rule of CONFIG.securityPatterns) {
    if (text.includes(rule.pattern)) securityHits.push(name + ' 命中 ' + rule.name);
  }
}
const vendorBaseline = CONFIG.knownVendorHits.filter((entry) => securityHits.some((hit) => hit.includes(entry.file) && hit.endsWith(entry.rule)));
const realHits = securityHits.filter((hit) => !vendorBaseline.some((entry) => hit.includes(entry.file) && hit.endsWith(entry.rule)));
if (realHits.length === 0) ok('代码安全：自有代码 0 命中（第三方基线 ' + vendorBaseline.length + ' 条见下）');
else for (const hit of realHits.slice(0, 8)) fail(hit + '（包体安全检查会按「代码安全风险」退件）');
for (const entry of vendorBaseline) warn('第三方基线豁免：' + entry.file + ' 的 ' + entry.rule + ' —— ' + entry.why);

/** ---------- 6. 内容审核用词 ---------- */
if (CONFIG.sensitiveWords.length === 0) ok('未配置敏感词表');
else {
  const wordHits = [];
  for (const [name, text] of texts) {
    for (const word of CONFIG.sensitiveWords) if (text.includes(word)) wordHits.push(name + ' 含「' + word + '」');
  }
  if (wordHits.length === 0) ok('内容审核：' + CONFIG.sensitiveWords.length + ' 个敏感词都没出现');
  else for (const hit of wordHits.slice(0, 8)) fail(hit + '（内容审核会按字面词退件）');
}

/** ---------- 7. 站外 URL 文本（不可点击，只提示）---------- */
const urlText = [];
for (const [name, text] of texts) {
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\\]+/g)) {
    if (hostAllowed(m[0])) continue;
    if (CONFIG.urlTextAllow.some((allow) => m[0].includes(allow))) continue;
    urlText.push(name + ' -> ' + m[0].slice(0, 90));
  }
}
if (urlText.length === 0) ok('产物里没有站外 URL 文本');
else for (const hit of urlText.slice(0, 6)) warn('站外 URL 文本（确认不会真的跳转）：' + hit);

/** ---------- 8. index.html 元信息与引用落地 ---------- */
const html = texts.get('index.html') ?? '';
if (CONFIG.requireMeta) {
  if (/<title>[^<]*\S[^<]*<\/title>/i.test(html)) ok('index.html 有非空 <title>');
  else fail('index.html 缺 <title> —— 平台列表页会显示成空白');
  if (/name=["']viewport["']/i.test(html)) ok('index.html 有 viewport meta');
  else fail('index.html 缺 viewport meta —— 手机上会按桌面宽度渲染');
}
const present = new Set(files.map(relOf));
const missingRefs = [];
for (const m of html.matchAll(/(?:src|href)\s*=\s*["'](\.\/[^"'?#]+)(?:[?#][^"']*)?["']/g)) {
  const target = m[1].replace(/^\.\//, '');
  if (!present.has(target)) missingRefs.push(target);
}
if (missingRefs.length === 0) ok('index.html 引用的资源都在包里');
else for (const ref of missingRefs.slice(0, 8)) fail('index.html 引用了不存在的文件：' + ref);

/** ---------- 9. 源码里的 UGC 原语（内容安全红线）---------- */
const UGC_RULES = [
  [/<textarea\b/i, '<textarea>（自由文本输入）'],
  [/contenteditable\s*=\s*["']?true/i, 'contenteditable（可编辑区域）'],
  [/<input[^>]*\btype\s*=\s*["']?file\b/i, '<input type=file>（用户上传）'],
  [/\bgetUserMedia\b/, 'getUserMedia（摄像头 / 麦克风）'],
  [/\bMediaRecorder\b/, 'MediaRecorder（录音 / 录像）'],
];
const SOURCE_EXT = /\.(?:vue|ts|tsx|js|jsx|html)$/;
const sourceFiles = [];
for (const root of CONFIG.sourceRoots) {
  const abs = join(ROOT, root);
  // 目录改名后静默 continue 会让这几条红线扫描 0 个文件却照样绿 —— 必须报错
  if (!existsSync(abs)) { fail('源码根不存在，UGC / 站外链接检查形同虚设：' + root); continue; }
  for (const path of walk(abs)) {
    if (!SOURCE_EXT.test(path)) continue;
    if (/\.(?:test|spec)\./.test(path)) continue;
    sourceFiles.push(path);
  }
}
if (sourceFiles.length === 0) fail('没有扫到任何源码文件（sourceRoots 配置或目录结构有误）');
const ugcHits = [];
for (const path of sourceFiles) {
  const text = readFileSync(path, 'utf8');
  for (const [re, label] of UGC_RULES) if (re.test(text)) ugcHits.push(relative(ROOT, path).replace(/\\/g, '/') + ' -> ' + label);
}
if (ugcHits.length === 0) ok('源码里没有 UGC 能力（扫了 ' + sourceFiles.length + ' 个文件）');
else for (const hit of ugcHits.slice(0, 8)) fail('源码里有 Toy 明令禁止的 UGC 能力：' + hit);

/** ---------- 10. 源码里的站外链接 ---------- */
const srcExternal = [];
for (const path of sourceFiles) {
  if (!/\.(?:vue|ts|tsx|js|jsx|html)$/.test(path)) continue;
  const text = readFileSync(path, 'utf8');
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\\]+/g)) {
    if (hostAllowed(m[0])) continue;
    if (CONFIG.urlTextAllow.some((allow) => m[0].includes(allow))) continue;
    srcExternal.push(relative(ROOT, path).replace(/\\/g, '/') + ' -> ' + m[0].slice(0, 80));
  }
}
if (srcExternal.length === 0) ok('源码里没有站外链接');
else for (const hit of srcExternal.slice(0, 6)) warn('源码里的站外 URL（确认不会真的跳转）：' + hit);

/** ---------- 11. zip 包根（项目产出 zip 时）---------- */
if (CONFIG.zip === null) ok('本项目不产出 zip，跳过包根检查');
else {
  const zipPath = join(ROOT, CONFIG.zip);
  // 缺包必须是错误：只告警的话，干净检出上单跑 toy:check 会「通过」，
  // 而实际上根本没有可上传的产物 —— 这正是最容易被误判为可发布的状态。
  if (!existsSync(zipPath)) fail('没找到 ' + CONFIG.zip + '（先 pnpm toy:zip）');
  else {
    const buf = readFileSync(zipPath);
    const entries = readZipEntries(buf);
    const names = entries.map((e) => e.name);
    if (buf.length > LIMITS.packageBytes) fail('zip ' + mb(buf.length) + ' MB 超过 50 MB');
    else ok('zip ' + mb(buf.length) + ' MB / 上限 50 MB');
    if (names.includes('index.html')) ok('zip 包根就是 index.html');
    else fail('zip 包根没有 index.html（不要多套一层目录）');
    const unsafe = names.filter((n) => n.startsWith('/') || n.split('/').includes('..'));
    if (unsafe.length === 0) ok('zip 内没有绝对路径 / 越界路径');
    else for (const n of unsafe.slice(0, 6)) fail('zip 里有越界路径：' + n);
    const badZipExt = names.filter((n) => !n.endsWith('/') && !ALLOWED_EXT.has(extname(n).toLowerCase()));
    if (badZipExt.length === 0) ok('zip 内后缀都在白名单内');
    else for (const n of badZipExt.slice(0, 6)) fail('zip 里有白名单外的文件：' + n);

    /** ---------- 11b. zip 必须与当前 dist 逐字节一致 ---------- */
    // 只比文件名的话，上一次构建留下的旧 zip 会和刚构建的 dist 一样通过自检，
    // 于是上传的是旧版本而「自检通过」。用中央目录里的 CRC32 与当前产物比对。
    const stale = [];
    for (const entry of entries) {
      if (entry.name.endsWith('/')) continue;
      const local = join(DIST, entry.name);
      if (!existsSync(local)) { stale.push(entry.name + '（dist 里已没有）'); continue; }
      const actual = crc32(readFileSync(local));
      if (actual !== entry.crc || statSync(local).size !== entry.size) stale.push(entry.name + '（内容已变）');
    }
    if (stale.length === 0) ok('zip 与当前 dist 内容一致（' + entries.length + ' 项 CRC 校验）');
    else {
      for (const s of stale.slice(0, 6)) fail('zip 是旧的，请重新 pnpm toy:zip：' + s);
      if (stale.length > 6) fail('……另有 ' + (stale.length - 6) + ' 项与 dist 不一致');
    }
    const inZip = new Set(entries.filter((e) => !e.name.endsWith('/')).map((e) => e.name));
    const missingInZip = shipped.map(relOf).filter((n) => !inZip.has(n));
    if (missingInZip.length === 0) ok('dist 里要发布的文件都进了 zip');
    else for (const n of missingInZip.slice(0, 6)) fail('zip 漏掉了产物文件：' + n);
  }
}


function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), crc, compSize, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

if (errors > 0) {
  console.error('');
  console.error('Toy 自检失败：' + errors + ' 个问题' + (warnings > 0 ? '，' + warnings + ' 条提示' : ''));
  process.exit(1);
}
console.log('');
console.log('Toy 自检通过' + (warnings > 0 ? '（' + warnings + ' 条提示，建议过一眼）' : '') + ' —— 分类 / 封面 / 图标 / 可见状态仍需在发布页人工确认');