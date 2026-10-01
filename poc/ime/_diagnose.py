# -*- coding: utf-8 -*-
"""快速诊断：页面为什么没渲染出编辑器。抓控制台与网络错误。"""
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5188"
logs, errors, failed = [], [], []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.on("console", lambda m: logs.append((m.type, m.text)))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("requestfailed", lambda r: failed.append(f"{r.url} -> {r.failure}"))
    page.goto(URL, wait_until="load", timeout=45000)
    page.wait_for_timeout(2500)

    print("=== 页面级 JS 错误 ===")
    print("  无" if not errors else "")
    for e in errors:
        print("  " + e[:600])

    print("\n=== 控制台输出 ===")
    for t, m in logs[:25]:
        print(f"  [{t}] {m[:300]}")

    print("\n=== 失败请求 ===")
    print("  无" if not failed else "")
    for f in failed[:10]:
        print("  " + f[:300])

    print("\n=== DOM 状况 ===")
    info = page.evaluate("""() => ({
      editor: Boolean(document.querySelector('.cm-editor')),
      bodyChildren: [...document.body.children].map(e => e.tagName + (e.id ? '#'+e.id : '')),
      checksCount: document.querySelectorAll('#checks .chk').length,
      gezhiGlobal: typeof window.__gezhi,
      hasAcCheckbox: Boolean(document.getElementById('chk-ac')),
    })""")
    for k, v in info.items():
        print(f"  {k}: {v}")
    browser.close()
