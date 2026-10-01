# -*- coding: utf-8 -*-
"""用 Playwright 做 PoC 的自检：页面能否加载、编辑器是否挂载、有无控制台报错。

注意：这里**不能**验证中文输入法——IME 是操作系统层行为，脚本伪造不出真实的
composition 事件序列。本脚本只保证「页面本身是好的」，把 IME 留给真人手测。
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5188"
errors, logs = [], []

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1600, "height": 950})
    page.on("console", lambda m: logs.append((m.type, m.text)))
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="load", timeout=60000)
    page.wait_for_selector(".cm-editor", timeout=30000)
    page.wait_for_timeout(1200)

    info = page.evaluate("""() => {
      const ed = document.querySelector('.cm-editor');
      const content = document.querySelector('.cm-content');
      const checks = [...document.querySelectorAll('#checks .chk')].map(d => {
        const b = d.querySelector('b');
        return b ? b.textContent.trim() : '';
      });
      return {
        editorPresent: !!ed,
        contentEditable: content ? content.getAttribute('contenteditable') : null,
        docChars: content ? content.innerText.length : 0,
        checks,
        envline: (document.getElementById('envline') || {}).textContent || '',
        logLines: document.querySelectorAll('#log div').length,
        wikilinkSpans: document.querySelectorAll('.cm-wikilink').length,
        mathSpans: document.querySelectorAll('.cm-math').length,
        tagSpans: document.querySelectorAll('.cm-tag').length,
        monacoPresent: !!document.querySelector('.monaco-editor'),
      };
    }""")

    print("=== 页面自检 ===")
    for k, v in info.items():
        print(f"  {k}: {v}")

    print("\n=== 控制台错误 ===")
    print("  无" if not errors else "\n".join("  " + e for e in errors))

    bad = [t for t in logs if t[0] == "error"]
    print("\n=== 控制台 error 级日志 ===")
    print("  无" if not bad else "\n".join(f"  {t[1][:200]}" for t in bad))

    print("\n=== 判定 ===")
    ok = info["editorPresent"] and info["contentEditable"] == "true" and not errors and not bad
    # 注意：Windows 控制台默认 GBK，输出里不能直接放 ✅/❌ 这类字符
    print("  [PASS] 页面可用，可以交给真人测 IME" if ok else "  [FAIL] 页面有问题，先修")
    browser.close()

sys.exit(0 if ok else 2)
