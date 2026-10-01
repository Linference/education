# -*- coding: utf-8 -*-
"""格致 PoC · 第 3 轮：修正断言后的撤销粒度测试

上一轮的教训（写下来免得再犯）：
  断言用的是「文档里不再包含『测试』」，而初始模板中**本来就含有「测试」**，
  导致断言永远为真 → 误报 CodeMirror「撤销失效」。
  正确做法：① 用文档里绝无仅有的字符串作为探针；② 同时校验文档长度回到插入前。

本轮还加入「撤销分组的时间窗口」验证：
  CodeMirror 会按时间把连续输入合并成一个撤销步（newGroupDelay 默认 500ms）。
  如果插入与撤销之间隔得久，可能被分成两步 —— 这属于正常设计，不是 bug。
"""
import json
import sys
import time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5188"
REPORT_PATH = r"D:\Users\LINKIT\Desktop\格致\poc\ime\cdp-undo-report2.json"

# 这三个字在初始模板里绝不存在（生僻字），可用作唯一探针
PROBE_WORD = "龘靐齉"
PROBE_LATIN = "dabingnang"


def compose(page, latin, hanzi, steps=None):
    cdp = page.context.new_cdp_session(page)
    seq = steps if steps is not None else [latin, hanzi]
    for s in seq:
        cdp.send("Input.imeSetComposition", {"text": s, "selectionStart": len(s), "selectionEnd": len(s)})
        page.wait_for_timeout(110)
    cdp.send("Input.insertText", {"text": seq[-1]})
    page.wait_for_timeout(200)
    cdp.detach()


def cm_state(page):
    return page.evaluate("() => ({ text: window.__gezhi.docText(), len: window.__gezhi.docLen() })")


def run_undo_probe(page, label, word, do_input, hold_ms=250, max_presses=5):
    """do_input: 执行输入的 callable；返回撤销统计。"""
    page.click("#btn-reset")
    page.wait_for_timeout(180)
    page.evaluate("() => window.__gezhi.setCursor(window.__gezhi.docLen())")
    page.wait_for_timeout(120)

    before = cm_state(page)
    assert word not in before["text"], f"{label}: 探针词 {word} 竟然已存在于初始文档，测试用例无效"

    do_input(page)
    time.sleep(hold_ms / 1000.0)
    after = cm_state(page)
    inserted = word in after["text"]
    delta = after["len"] - before["len"]

    history = []
    for i in range(max_presses):
        page.keyboard.press("Control+z")
        page.wait_for_timeout(200)
        st = cm_state(page)
        history.append({
            "press": i + 1,
            "len": st["len"],
            "len_back_to_before": st["len"] == before["len"],
            "word_still_present": word in st["text"],
        })
        if st["len"] == before["len"] and word not in st["text"]:
            break

    ok = bool(history) and history[-1]["len_back_to_before"] and not history[-1]["word_still_present"]
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}")
    print(f"         插入 OK={inserted} Δ={delta}｜撤销 {len(history)} 次回到 len={before['len']}"
          f"（最终 len={history[-1]['len'] if history else 'n/a'}）")
    return {
        "label": label, "insert_ok": inserted, "delta_len": delta,
        "before_len": before["len"], "presses": len(history), "history": history, "pass": ok,
    }


def main():
    report = {"probe_word": PROBE_WORD, "cases": []}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_selector(".cm-editor", timeout=30000)
        page.wait_for_timeout(700)

        print("=== 修正断言后的撤销粒度测试（探针词：%s）===" % PROBE_WORD)
        print("   校验方式：文档长度回到插入前 且 探针词消失（两条同时满足才算通过）\n")

        # 1) 组合输入（CDP 输入法路径）
        report["cases"].append(run_undo_probe(
            page, "1 CDP 组合输入一个词后撤销", PROBE_WORD,
            lambda pg: compose(pg, PROBE_LATIN, PROBE_WORD)))

        # 2) 多步组合（更像真实输入法：拼音串逐步增长）
        report["cases"].append(run_undo_probe(
            page, "2 多步组合输入后撤销", PROBE_WORD,
            lambda pg: compose(pg, PROBE_LATIN, PROBE_WORD,
                               steps=["da", "dabing", "dabingnang", PROBE_WORD])))

        # 3) 普通插入（不经组合），作为 CodeMirror 自身撤销能力的基线
        report["cases"].append(run_undo_probe(
            page, "3 普通插入文本后撤销（CodeMirror 基线）", PROBE_WORD,
            lambda pg: (pg.keyboard.insert_text(PROBE_WORD), pg.wait_for_timeout(150))))

        # 4) 组合输入后**立即**撤销（<500ms，应落在同一个撤销组内）
        report["cases"].append(run_undo_probe(
            page, "4 组合输入后立刻撤销（间隔 <500ms）", PROBE_WORD,
            lambda pg: compose(pg, PROBE_LATIN, PROBE_WORD),
            hold_ms=120))

        # 5) 组合输入后**等久一点**再撤销（>500ms，可能分成两组的对照）
        report["cases"].append(run_undo_probe(
            page, "5 组合输入后等 1.5 秒再撤销", PROBE_WORD,
            lambda pg: compose(pg, PROBE_LATIN, PROBE_WORD),
            hold_ms=1500))

        print("\n=== 汇总 ===")
        passed = sum(1 for c in report["cases"] if c["pass"])
        print(f"  {passed}/{len(report['cases'])} 通过")
        for c in report["cases"]:
            if not c["pass"]:
                print(f"  FAIL {c['label']}：Δ={c['delta_len']}，撤销 {c['presses']} 次后 len="
                      f"{c['history'][-1]['len'] if c['history'] else 'n/a'}（应为 {c['before_len']}）")

        print("\n=== 页面级 JS 报错 ===")
        print("  无" if not errors else "\n".join("  " + e for e in errors))
        report["page_errors"] = errors

        with open(REPORT_PATH, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2)
        print(f"\n报告：{REPORT_PATH}")
        browser.close()
    return 0 if passed == len(report["cases"]) else 1


if __name__ == "__main__":
    sys.exit(main())
