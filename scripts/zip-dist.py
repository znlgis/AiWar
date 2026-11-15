#!/usr/bin/env python3
"""把 apps/site/dist 打成发布用的 zip（包根即 index.html），供手动上传 Toy。"""
from __future__ import annotations
import sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "apps" / "site" / "dist"
OUT = ROOT / "release" / "aiwar-guiling.zip"

SKIP_NAMES = {".DS_Store", "Thumbs.db"}
SKIP_SUFFIX = (".map",)

def main() -> int:
    if not (DIST / "index.html").exists():
        print("找不到 apps/site/dist/index.html，先运行 pnpm build", file=sys.stderr)
        return 1
    files = [p for p in DIST.rglob("*") if p.is_file()]
    files = [p for p in files if p.name not in SKIP_NAMES and not p.name.endswith(SKIP_SUFFIX)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for p in sorted(files):
            # 固定时间戳与权限位：zipfile.write 会写入文件 mtime，同样源码两次打包
            # 会得到不同字节，发布包无法复现、也无法用 diff 判断是否同一版。
            info = zipfile.ZipInfo(p.relative_to(DIST).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, p.read_bytes())
            total += p.stat().st_size
    names = [p.relative_to(DIST).as_posix() for p in files]
    print(f"zip: {OUT.relative_to(ROOT)}  ({OUT.stat().st_size/1024:.1f} KB compressed, {total/1024:.1f} KB raw)")
    print(f"files: {len(files)}  root: index.html={'index.html' in names}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
