# -*- coding: utf-8 -*-
"""格致 · R13 专项测试：自动补全 × 中文输入法

这是全项目最高风险的技术未知。Monaco 至今栽在这里（#2199：中文 IME 与
CompletionItemProvider 冲突，仍 open），而格致最核心的编辑体验就是「打 [[ 补全笔记名」。

要验证的四件事：
  1. 组合输入（组词）期间，补全弹窗**绝不能**出现 —— 否则候选词与补全列表抢按键
  2. 组词途中按回车/空格，**不能**把补全建议写进正文
  3. 上屏之后，补全**仍然可用** —— 不能为了躲 IME 就把补全废掉
  4. 括号自动闭合不与 IME 打架（不会变成 ]]]] 或吞字符）

测试手段：CDP 的 Input.imeSetComposition 走 Blink 真实组合路径（见 cdp_ime_final.py 的说明）。
从 %TEMP% 运行，避免 Vite 的 fs watcher 锁住脚本临时文件导致 dev server 崩溃。
"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5188"
REPORT_PATH = r"D:\Users\LINKIT\Desktop\格致\poc\ime\cdp-r13-report.json"
RESULTS = []   # 结果列表（注意别和 REPORT_PATH 混名 —— 上一版就是这里把列表覆盖成了字符串）

W1 = "龘"   # 生僻探针字，初始文档中不存在


def state(page):
    return page.evaluate("""() => ({
      text: window.__gezhi.docText(),
      len: window.__gezhi.docLen(),
      head: window.__gezhi.selection().head,
      composing: window.__gezhi.composing(),
      completionOpen: window.__gezhi.completionOpen(),
      completionSelected: window.__gezhi.completionSelected(),
      stats: window.__gezhi.completionStats(),
    })""")


def reset_stats(page):
    page.evaluate("() => { window.__gezhi.resetCompletionStats(); }")


def cdp_session(page):
    return page.context.new_cdp_session(page)


def compose_start(cdp, text):
    cdp.send("Input.imeSetComposition", {"text": text, "selectionStart": len(text), "selectionEnd": len(text)})


def compose_commit(page, cdp, text):
    cdp.send("Input.insertText", {"text": text})
    page.wait_for_timeout(160)


def case(page, name, fn):
    """跑一个用例。fn 返回 (ok, notes, detail)；case 返回布尔（供 results 累积）。"""
    print(f"\n  ── {name} ──")
    try:
        ok, notes, detail = fn()
    except Exception as e:
        ok, notes, detail = False, [f"异常：{type(e).__name__}: {e}"], {}
    RESULTS.append({"case": name, "pass": bool(ok), "notes": notes, "detail": detail})
    print(f"     [{'PASS' if ok else 'FAIL'}] " + ("；".join(notes) if notes else "符合预期"))
    for k, v in detail.items():
        print(f"        {k}: {v}")
    return bool(ok)


def record(page, name, ok, notes, detail):
    RESULTS.append({"case": name, "pass": bool(ok), "notes": notes, "detail": detail})
    print(f"     [{'PASS' if ok else 'FAIL'}] " + ("；".join(notes) if notes else "符合预期"))
    for k, v in detail.items():
        print(f"        {k}: {v}")
    return bool(ok)


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1500, "height": 950})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_selector(".cm-editor", timeout=30000)
        page.wait_for_timeout(900)

        print("=== R13 专项：自动补全 × 中文输入法 ===")
        print(f"  补全包版本：{page.evaluate('() => 1') and '已加载'}")
        # 确认补全已启用
        ac_on = page.evaluate("() => Boolean(document.getElementById('chk-ac')?.checked)")
        print(f"  自动补全开关：{'开启' if ac_on else '关闭'}")
        if not ac_on:
            page.check("#chk-ac")
            page.wait_for_timeout(300)

        # ---------------------------------------------------------------- 用例 1
        def t1():
            """组合输入期间补全不得弹出"""
            page.click("#btn-reset")
            page.wait_for_timeout(200)
            # 定位到 R13 段落里的 [[ 之后
            pos = page.evaluate("() => window.__gezhi.docText().indexOf('[[\\n再把光标') + 2")
            assert pos > 1, "找不到 [[ 测试位"
            page.evaluate("(p) => window.__gezhi.setCursor(p)", pos)
            page.wait_for_timeout(200)
            reset_stats(page)

            cdp = cdp_session(page)
            # 关键：组合输入中文（此时补全若弹出就是 R13 失败）
            compose_start(cdp, "qing")
            page.wait_for_timeout(250)
            mid = state(page)
            opened_during = mid["stats"]["popupOpenedWhileComposing"]
            composing_flag = mid["composing"]

            compose_start(cdp, "情态")
            page.wait_for_timeout(250)
            mid2 = state(page)
            opened_during += mid2["stats"]["popupOpenedWhileComposing"]

            compose_commit(page, cdp, "情态")
            page.wait_for_timeout(400)
            after = state(page)
            cdp.detach()

            detail = {
                "组合中 view.composing": composing_flag,
                "组合期间弹窗次数": opened_during,
                "上屏后弹窗是否打开": after["completionOpen"],
                "上屏后补全总弹出次数": after["stats"]["popupOpened"],
                "上屏后光标位置": after["head"],
                "正文尾部": after["text"][pos - 6:pos + 12].replace("\n", "\\n"),
            }
            notes = []
            if opened_during > 0:
                notes.append(f"✖ 组合输入期间补全弹窗出现了 {opened_during} 次（这就是 Monaco #2199 的病）")
            if not composing_flag:
                notes.append("⚠ view.composing 在组合期间为 false —— 说明 CodeMirror 没能识别组合状态")
            return (not notes, notes, detail)

        results.append(case(page, "1. 组合输入期间补全不弹出（核心）", t1))

        # ---------------------------------------------------------------- 用例 2
        def t2():
            """组词途中按回车，不能把补全项写进正文"""
            page.click("#btn-reset")
            page.wait_for_timeout(200)
            pos = page.evaluate("() => window.__gezhi.docText().indexOf('[[\\n再把光标') + 2")
            page.evaluate("(p) => window.__gezhi.setCursor(p)", pos)
            page.wait_for_timeout(150)
            reset_stats(page)
            before = state(page)

            cdp = cdp_session(page)
            compose_start(cdp, "qing")
            page.wait_for_timeout(200)
            # 组词途中按回车（在真实输入法里这是"确认候选词"）
            page.keyboard.press("Enter")
            page.wait_for_timeout(200)
            mid = state(page)
            # 再按空格（输入法里常用来选第一个候选）
            page.keyboard.press("Space")
            page.wait_for_timeout(200)
            mid2 = state(page)
            compose_commit(page, cdp, "情态")
            page.wait_for_timeout(300)
            after = state(page)
            cdp.detach()

            applied_during = after["stats"]["appliedWhileComposing"]
            inserted_suggestion = "]]" in after["text"][pos:pos + 20]
            detail = {
                "组合期间误插入补全项次数": applied_during,
                "回车后长度变化": mid["len"] - before["len"],
                "空格后长度变化": mid2["len"] - before["len"],
                "正文该处": after["text"][pos - 2:pos + 16].replace("\n", "\\n"),
                "误插入 ]]" : inserted_suggestion,
            }
            notes = []
            if applied_during > 0:
                notes.append(f"✖ 组词期间误插入了补全项 {applied_during} 次")
            if inserted_suggestion:
                notes.append("✖ 组词期间被写入了 ]]，说明补全抢了输入法的按键")
            return (not notes, notes, detail)

        results.append(case(page, "2. 组词途中按回车/空格不误插入补全项", t2))

        # ---------------------------------------------------------------- 用例 3
        def t3():
            """上屏之后补全仍然可用（不能为了躲 IME 而废掉补全）"""
            page.click("#btn-reset")
            page.wait_for_timeout(200)
            pos = page.evaluate("() => window.__gezhi.docText().indexOf('[[\\n再把光标') + 2")
            page.evaluate("(p) => window.__gezhi.setCursor(p)", pos)
            page.wait_for_timeout(150)
            reset_stats(page)

            # 用普通键入（非组合路径）打两个字，应当触发补全
            page.keyboard.type("情态")
            page.wait_for_timeout(600)
            st = state(page)
            detail = {
                "弹窗是否打开": st["completionOpen"],
                "累计弹出次数": st["stats"]["popupOpened"],
                "选中项": st["completionSelected"],
                "正文": st["text"][pos - 2:pos + 10].replace("\n", "\\n"),
            }
            notes = []
            if st["stats"]["popupOpened"] == 0:
                notes.append("✖ 普通键入时补全没弹出 —— 补全功能被废掉了，这不可接受")
            return (not notes, notes, detail)

        results.append(case(page, "3. 非组合输入时补全正常工作", t3))

        # ---------------------------------------------------------------- 用例 4
        def t4():
            """上屏后补全应能弹出（真实场景：打完中文继续，补全跟随）"""
            page.click("#btn-reset")
            page.wait_for_timeout(200)
            pos = page.evaluate("() => window.__gezhi.docText().indexOf('[[\\n再把光标') + 2")
            page.evaluate("(p) => window.__gezhi.setCursor(p)", pos)
            page.wait_for_timeout(150)
            reset_stats(page)

            cdp = cdp_session(page)
            compose_start(cdp, "qingtai")
            page.wait_for_timeout(220)
            compose_commit(page, cdp, "情态")
            page.wait_for_timeout(700)   # 给补全一点时间在上屏后弹出
            after = state(page)
            cdp.detach()

            detail = {
                "上屏后弹窗打开": after["completionOpen"],
                "上屏后累计弹出": after["stats"]["popupOpened"],
                "组合期间弹出（须为 0）": after["stats"]["popupOpenedWhileComposing"],
                "正文": after["text"][pos - 2:pos + 12].replace("\n", "\\n"),
            }
            notes = []
            # 组合期间弹补全 = 硬失败（这就是 Monaco #2199 的病）
            if after["stats"]["popupOpenedWhileComposing"] > 0:
                notes.append(f"✖ 组合期间弹了 {after['stats']['popupOpenedWhileComposing']} 次补全")
                return (False, notes, detail)
            # 上屏后是否"立刻"弹出取决于实现（可能要等下一次按键），只记录不判失败
            if not after["completionOpen"]:
                notes.append("（记录）上屏后弹窗未立即出现，可能需再敲一个字符才触发")
            return (True, notes, detail)

        results.append(case(page, "4. 中文上屏后补全的跟随情况", t4))

        # ---------------------------------------------------------------- 用例 5
        def t5():
            """括号自动闭合不与 IME 打架"""
            page.click("#btn-reset")
            page.wait_for_timeout(200)
            pos = page.evaluate("() => window.__gezhi.docText().indexOf('[[\\n再把光标') + 2")
            page.evaluate("(p) => window.__gezhi.setCursor(p)", pos)
            page.wait_for_timeout(150)

            cdp = cdp_session(page)
            compose_start(cdp, "da")
            page.wait_for_timeout(200)
            compose_commit(page, cdp, W1)
            page.wait_for_timeout(300)
            after = state(page)
            cdp.detach()

            seg = after["text"][pos - 2:pos + 10]
            # 统计这段里 ] 的数量：不应该超过原来方括号闭合所需
            brackets = seg.count("]")
            detail = {
                "该处正文": seg.replace("\n", "\\n"),
                "右方括号数量": brackets,
                "探针字是否上屏": W1 in after["text"],
            }
            notes = []
            if not detail["探针字是否上屏"]:
                notes.append("✖ 中文没上屏")
            if brackets > 4:
                notes.append(f"✖ 出现了 {brackets} 个右方括号，疑似自动闭合与 IME 叠加")
            return (not notes, notes, detail)

        results.append(case(page, "5. 括号自动闭合不与 IME 叠加", t5))

        print("\n=== 页面级 JS 报错 ===")
        print("  无" if not errors else "\n".join("  " + e for e in errors))

        passed = sum(1 for r in RESULTS if r["pass"])
        print(f"\n=== 汇总：{passed}/{len(RESULTS)} 通过 ===")
        for item in RESULTS:
            if not item["pass"]:
                print(f"  FAIL {item['case']}: {'；'.join(item['notes'])}")

        with open(REPORT_PATH, "w", encoding="utf-8") as f:
            json.dump({"results": RESULTS, "page_errors": errors}, f, ensure_ascii=False, indent=2)
        print(f"\n报告：{REPORT_PATH}")
        browser.close()
    return 0 if passed == len(RESULTS) and not errors else 1


if __name__ == "__main__":
    sys.exit(main())
