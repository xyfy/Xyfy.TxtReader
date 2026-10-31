#!/usr/bin/env python3
# 无扩展环境下生成商店截图（与 scripts/shots.mjs 同流程、同选择器）。
#
# 背景：shots.mjs 需加载真实扩展（chrome://extensions 语义），沙箱/CI 普遍禁止。
# 本脚本改走仓库自带的「纯网页版」：npm run build:webapp 产物里 reader/reader.html
# 与扩展内是同一套 UI（同一份 reader.html/css/js），用无头 Chromium 以普通网页打开，
# 导入同一样张后按 5 步截图，产出与 shots.mjs 一致的 5 张 1280x800 PNG。
#
# 依赖：pip3 install playwright + 系统 chromium（/usr/bin/chromium）
# 用法：
#   npm run build:webapp
#   python3 -m http.server 8899 --directory dist/webapp   # 终端 1
#   python3 scripts/gen-shots-web.py                       # 终端 2

import os
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store-assets", "screenshots")
DEFAULT_BOOK = os.path.join(ROOT, "tests", "samples", "02-large-utf8.txt")
PORT = os.environ.get("SHOTS_PORT", "8899")
URL = f"http://127.0.0.1:{PORT}/reader/reader.html"
EXECUTABLE = os.environ.get("SHOTS_CHROMIUM", "/usr/bin/chromium")


def dismiss_onboarding(page):
    """首次运行会弹引导浮层，盖住正文导致截图失真；点 Skip 真正关闭。"""
    deadline = time.time() + 5
    while time.time() < deadline:
        visible = page.evaluate(
            "() => { const o = document.getElementById('onboarding-overlay');"
            " return !!o && !o.classList.contains('hidden'); }"
        )
        if visible:
            break
        time.sleep(0.2)
    if not page.evaluate(
        "() => { const o = document.getElementById('onboarding-overlay');"
        " return !!o && !o.classList.contains('hidden'); }"
    ):
        return
    try:
        page.click("#onboarding-skip", timeout=5000)
    except Exception:
        page.evaluate(
            "() => document.getElementById('onboarding-overlay')?.classList.add('hidden')"
        )
    time.sleep(0.4)


def main():
    # --book=/path/to/book.txt 可指定样张（截图书名显示文件名，建议起个像书名的名字）
    book = DEFAULT_BOOK
    for a in sys.argv[1:]:
        if a.startswith("--book="):
            book = a.split("=", 1)[1]
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(book):
        print(f"✗ 样张不存在：{book}（先跑 npm run gen:samples 或用 --book 指定）", file=sys.stderr)
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=EXECUTABLE,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # 1) 导入页（空态）
        page.goto(URL, timeout=20000)
        page.wait_for_selector("#reader-main", timeout=15000)
        time.sleep(0.8)
        dismiss_onboarding(page)
        time.sleep(0.4)
        page.screenshot(path=os.path.join(OUT, "01-import.png"))
        print("✓ 01-import")

        # 导入样张
        page.wait_for_selector("#file-input", state="attached", timeout=10000)
        page.set_input_files("#file-input", book)
        page.wait_for_function(
            "() => { const el = document.querySelector('#left-page');"
            " return el && !el.classList.contains('empty')"
            " && (el.textContent || '').trim().length > 0; }",
            timeout=25000,
        )
        time.sleep(2)  # 等分页/目录生成
        print("✓ 导入样张")

        # 2) 双页
        page.select_option("#reading-mode", "book")
        time.sleep(1)
        page.screenshot(path=os.path.join(OUT, "02-double-page.png"))
        print("✓ 02-double-page")

        # 3) 滚动
        page.select_option("#reading-mode", "scroll")
        time.sleep(1)
        page.screenshot(path=os.path.join(OUT, "03-scroll.png"))
        print("✓ 03-scroll")

        # 4) 目录：导入后侧栏默认已展开，若可见则别点 #toggle-panel（会收起，截图里反而没目录）
        toc_open = page.is_visible("#toc-list")
        if not toc_open:
            page.click("#toggle-panel")
        time.sleep(0.8)
        page.screenshot(path=os.path.join(OUT, "04-toc.png"))
        print("✓ 04-toc")
        if not toc_open:
            page.click("#toggle-panel")

        # 5) 设置
        page.click("#settings-toggle")
        time.sleep(0.8)
        page.screenshot(path=os.path.join(OUT, "05-settings.png"))
        print("✓ 05-settings")

        browser.close()
    print(f"\n截图目录：{OUT}")


if __name__ == "__main__":
    main()
