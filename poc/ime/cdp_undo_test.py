# -*- coding: utf-8 -*-
"""格致 PoC · 第 2 轮：撤销粒度 + 原生 textarea 对照组

为什么需要对照组：
  第 1 轮测出「一次撤销只撤掉一个汉字」。这可能有两种原因——
  (A) CodeMirror 的问题（每个汉字一个撤销步）；
  (B) CDP 的 imeSetComposition 路径本身如此（即原生编辑控件也一样）。
  分辨方法：在**同一个浏览器、同一个 CDP 会话**里，用原生 <textarea> 跑完全相同的操作。
  如果 textarea 也这样，那这是测试手段的局限，不是 CodeMirror 的缺陷。
"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5188"
REPORT_PATH = r"D:\Users\LINKIT\Desktop\格致\poc\ime\cdp-undo-report.json"


def compose(page, latin, hanzi, steps=None):
    """完整一次组合输入。steps 可指定中间态，用于测「多步组合」。"""
    cdp = page.context.new_cdp_session(page)
    seq = steps if steps is not None else [latin, hanzi]
    for s in seq:
        cdp.send("Input.imeSetComposition", {"text": s, "selectionStart": len(s), "selectionEnd": len(s)})
        page.wait_for_timeout(110)
    cdp.send("Input.insertText", {"text": seq[-1]})
    page.wait_for_timeout(200)
    cdp.detach()


def undo_until_gone(page, target, probe, max_presses=12):
    """反复 Ctrl+Z，记录每次撤销后目标串是否还在，返回需要的次数。"""
    presses = []
    for i in range(max_presses):
        page.keyboard.press("Control+z")
        page.wait_for_timeout(220)
        txt = probe(page)
        still = target in txt
        presses.append({"press": i + 1, "len": len(txt), "still_present": still, "tail": txt[-24:]})
        if not still:
            break
    return presses


def probe_cm(page):
    return page.evaluate("() => window.__gezhi.docText()")


def probe_ta(page):
    return page.evaluate("() => document.getElementById('native-ta').value")


def main():
    report = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_selector(".cm-editor", timeout=30000)
        page.wait_for_timeout(700)

        # 在页面里注入一个原生 textarea 作为对照组
        page.evaluate("""() => {
          const ta = document.createElement('textarea');
          ta.id = 'native-ta';
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:200px';
          document.body.appendChild(ta);
        }""")

        # ---------------- 实验 A：CodeMirror，一次组合输入一个词
        print("=== 实验 A：CodeMirror 6，一次组合输入「测试」后连续撤销 ===")
        page.click("#btn-reset")
        page.wait_for_timeout(150)
        page.evaluate("() => window.__gezhi.setCursor(window.__gezhi.docLen())")
        page.wait_for_timeout(120)
        before = probe_cm(page)
        compose(page, "ceshi", "测试")
        after = probe_cm(page)
        print(f"  上屏前 len={len(before)}，上屏后 len={len(after)}（Δ={len(after)-len(before)}，尾部 …{after[-12:]!r}）")
        pressesA = undo_until_gone(page, "测试", probe_cm)
        for pr in pressesA:
            print(f"    第 {pr['press']} 次 Ctrl+Z → len={pr['len']} 仍含「测试」={pr['still_present']}")
        cm_presses = len(pressesA)
        report["A_codemirror_single_word"] = {"presses_needed": cm_presses, "detail": pressesA}

        # ---------------- 实验 B：原生 textarea，完全相同的操作
        print("\n=== 实验 B（对照组）：原生 <textarea>，同样的组合输入后连续撤销 ===")
        page.evaluate("() => { const t = document.getElementById('native-ta'); t.value = ''; t.focus(); }")
        page.wait_for_timeout(150)
        compose(page, "ceshi", "测试")
        ta_after = probe_ta(page)
        print(f"  上屏后 value={ta_after!r}")
        pressesB = undo_until_gone(page, "测试", probe_ta)
        for pr in pressesB:
            print(f"    第 {pr['press']} 次 Ctrl+Z → len={pr['len']} 仍含「测试」={pr['still_present']}")
        ta_presses = len(pressesB)
        report["B_native_textarea"] = {"presses_needed": ta_presses, "detail": pressesB}

        # ---------------- 实验 C：CodeMirror，多步组合（更接近真实输入法）
        print("\n=== 实验 C：CodeMirror 6，多步组合输入（拼音→候选→上屏）===")
        page.click("#btn-reset")
        page.wait_for_timeout(150)
        page.evaluate("() => window.__gezhi.setCursor(window.__gezhi.docLen())")
        page.wait_for_timeout(120)
        beforeC = probe_cm(page)
        compose(page, "qing", "情态动词", steps=["qing", "qingtai", "qingtaidongci", "情态动词"])
        afterC = probe_cm(page)
        print(f"  上屏后 Δ={len(afterC)-len(beforeC)}，尾部 …{afterC[-16:]!r}")
        pressesC = undo_until_gone(page, "情态动词", probe_cm)
        for pr in pressesC:
            print(f"    第 {pr['press']} 次 Ctrl+Z → len={pr['len']} 仍含「情态动词」={pr['still_present']}")
        report["C_codemirror_multistep"] = {"presses_needed": len(pressesC), "detail": pressesC}

        # ---------------- 实验 D：CodeMirror，普通（非组合）键入的撤销粒度
        print("\n=== 实验 D：CodeMirror 6，普通键入「测试」二字（非组合路径）的撤销 ===")
        page.click("#btn-reset")
        page.wait_for_timeout(150)
        page.evaluate("() => window.__gezhi.setCursor(window.__gezhi.docLen())")
        page.keyboard.insert_text("测试")   # 直接插入文本，不经过组合
        page.wait_for_timeout(250)
        afterD = probe_cm(page)
        print(f"  插入后 Δ={len(afterD)-len(beforeC)}，尾部 …{afterD[-12:]!r}")
        pressesD = undo_until_gone(page, "测试", probe_cm)
        report["D_codemirror_plain_insert"] = {"presses_needed": len(pressesD), "detail": pressesD}
        for pr in pressesD:
            print(f"    第 {pr['press']} 次 Ctrl+Z → len={pr['len']} 仍含「测试」={pr['still_present']}")

        print("\n=== 对照结论 ===")
        print(f"  A CodeMirror 组合输入单词：需要 {cm_presses} 次撤销")
        print(f"  B 原生 textarea 同操作  ：需要 {ta_presses} 次撤销")
        print(f"  C CodeMirror 多步组合    ：需要 {report['C_codemirror_multistep']['presses_needed']} 次撤销")
        print(f"  D CodeMirror 普通插入    ：需要 {report['D_codemirror_plain_insert']['presses_needed']} 次撤销")
        if cm_presses == ta_presses:
            print("  → 两边一致：说明「一次只撤一个字」是 CDP 组合路径的共有行为，")
            print("    不是 CodeMirror 的缺陷。（真实输入法下的撤销粒度仍需真人验证一次。）")
            report["conclusion"] = "CDP 路径局限，非 CodeMirror 缺陷"
        else:
            print("  → 两边不一致：CodeMirror 与原生控件的撤销粒度不同，")
            print("    需要进一步确认是否影响真实输入法体验。")
            report["conclusion"] = "CodeMirror 与原生控件行为不一致，需进一步排查"

        print("\n=== 页面级 JS 报错 ===")
        print("  无" if not errors else "\n".join("  " + e for e in errors))
        report["page_errors"] = errors

        with open(REPORT_PATH, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(f"\n报告：{REPORT_PATH}")
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
