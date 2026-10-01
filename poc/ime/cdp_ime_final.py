# -*- coding: utf-8 -*-
"""格致 PoC · CDP 输入法自动测试（最终版，已修正断言）

会话中踩过的两个坑，写在这里防止复用脚本时再犯：
  1. 断言「文档里不含某词」时，必须确认该词在初始文档中不存在 —— 否则断言恒真。
     （第一版用「测试」作探针，而初始模板里本来就有「测试」→ 误报 CodeMirror 撤销失效。）
  2. 断言必须同时校验「文档长度回到插入前」，单看文本包含关系会漏判。
  3. Windows 控制台是 GBK，输出里不要放 emoji。
  4. 脚本要从 %TEMP% 运行，放在 PoC 目录里会被 Vite 的 fs watcher 锁住导致 dev server 崩溃。
"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5188"
REPORT_PATH = r"D:\Users\LINKIT\Desktop\格致\poc\ime\cdp-ime-report-final.json"

# 生僻字探针：在初始模板里绝不存在，安全
W1, W2, W3 = "龘", "靐", "齉"
RESULTS = []


def install_probe(page):
    page.evaluate("""() => {
      window.__probe = { events: [], errors: [] };
      const ed = document.querySelector('.cm-content');
      const rec = (kind, d) => window.__probe.events.push({ kind, ...d });
      ed.addEventListener('compositionstart', e => rec('compositionstart', { data: e.data ?? null }));
      ed.addEventListener('compositionupdate', e => rec('compositionupdate', { data: e.data ?? null }));
      ed.addEventListener('compositionend', e => rec('compositionend', { data: e.data ?? null }));
      ed.addEventListener('input', e => rec('input', {
        inputType: e.inputType, data: e.data ?? null, isComposing: e.isComposing }));
      window.addEventListener('error', e => window.__probe.errors.push(String(e.message)));
    }""")


def state(page):
    return page.evaluate("""() => ({
      text: window.__gezhi.docText(),
      len: window.__gezhi.docLen(),
      head: window.__gezhi.selection().head,
      events: window.__probe.events.slice(),
      errors: window.__probe.errors.slice(),
    })""")


def reset(page):
    page.click("#btn-reset")
    page.wait_for_timeout(160)
    page.evaluate("() => { window.__probe.events = []; window.__probe.errors = []; }")
    page.evaluate("() => window.__gezhi.setCursor(window.__gezhi.docLen())")
    page.wait_for_timeout(120)


def compose(page, seq):
    """seq 为组合中间态序列，最后一个元素是上屏结果。"""
    cdp = page.context.new_cdp_session(page)
    for s in seq:
        cdp.send("Input.imeSetComposition", {"text": s, "selectionStart": len(s), "selectionEnd": len(s)})
        page.wait_for_timeout(100)
    cdp.send("Input.insertText", {"text": seq[-1]})
    page.wait_for_timeout(180)
    cdp.detach()


def set_cursor(page, js_expr):
    page.evaluate(f"() => window.__gezhi.setCursor({js_expr})")
    page.wait_for_timeout(120)


def dup_check(text):
    out = []
    for i in range(len(text) - 1):
        if text[i] == text[i + 1] and ("\u4e00" <= text[i] <= "\u9fff"):
            out.append(text[i] * 2)
    return out


def case(page, name, prepare, seq, expect, expect_len_delta=True):
    reset(page)
    prepare(page)
    before = state(page)
    compose(page, seq)
    after = state(page)
    kinds = [e["kind"] for e in after["events"]]
    notes = []
    if expect not in after["text"]:
        notes.append(f"正文中未找到期望串「{expect}」")
    if kinds.count("compositionstart") == 0:
        notes.append("未收到 compositionstart")
    if kinds.count("compositionstart") != kinds.count("compositionend"):
        notes.append(f"组合事件不配对 start={kinds.count('compositionstart')} end={kinds.count('compositionend')}")
    dups = dup_check(after["text"])
    if dups:
        notes.append(f"出现重复字符 {dups[:3]}")
    if expect_len_delta:
        delta = after["len"] - before["len"]
        if delta != len(seq[-1]):
            notes.append(f"长度增量 {delta} ≠ 上屏内容长度 {len(seq[-1])}")
    if after["errors"]:
        notes.append(f"页面报错 {after['errors'][:2]}")

    verdict = "PASS" if not notes else "FAIL"
    RESULTS.append({
        "case": name, "verdict": verdict, "notes": notes,
        "compositionstart": kinds.count("compositionstart"),
        "compositionupdate": kinds.count("compositionupdate"),
        "compositionend": kinds.count("compositionend"),
        "input_events": kinds.count("input"),
        "delta_len": after["len"] - before["len"],
        "duplicates": dups[:5],
        "tail": after["text"][-40:].replace("\n", "\\n"),
    })
    print(f"  [{verdict}] {name}   (start={kinds.count('compositionstart')} "
          f"update={kinds.count('compositionupdate')} end={kinds.count('compositionend')} "
          f"input={kinds.count('input')} Δ={after['len']-before['len']})")
    for n in notes:
        print(f"         -> {n}")


def main():
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1450, "height": 950})
        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_selector(".cm-editor", timeout=30000)
        page.wait_for_timeout(800)
        install_probe(page)

        print("=== CDP 输入法自动测试（最终版）===")
        print(f"  UA: {page.evaluate('navigator.userAgent')[:80]}")
        print(f"  探针字：{W1} {W2} {W3}（初始文档中不存在）\n")

        case(page, f"1 行尾组合输入「情态动词{W1}」", lambda pg: None,
             ["qing", "qingtai", "qingtaidongci", f"情态动词{W1}"], f"情态动词{W1}")

        def prep2(pg):
            pg.keyboard.insert_text("modal ")
            pg.wait_for_timeout(120)
        case(page, f"2 中英混排「modal {W2}」", prep2, ["bing", W2], f"modal {W2}")

        # 3：wikilink 内部（CodeMirror #1688 的场景）
        #    注意：初始文档里的 wikilink 是 [[虚拟语气]]，索引必须对得上，
        #    否则 indexOf 返回 -1，光标会落到 +1 的位置上，测试就变成了"在开头打字"
        def prep3(pg):
            probe = pg.evaluate("() => window.__gezhi.docText().indexOf('[[虚拟语气]]')")
            assert probe >= 0, f"初始文档里找不到 [[虚拟语气]]，实际索引 {probe}"
            set_cursor(pg, "window.__gezhi.docText().indexOf('[[虚拟语气]]') + 2")
        case(page, f"3 在 [[ ]] 内部输入「{W1}」", prep3, ["da", W1], W1)

        # 4：公式内部
        def prep4(pg):
            set_cursor(pg, "window.__gezhi.docText().indexOf('$P(A|B)') + 1")
        case(page, f"4 在 $ 公式内部输入「{W2}」", prep4, ["bing", W2], W2)

        # 5：标签内部
        def prep5(pg):
            set_cursor(pg, "window.__gezhi.docText().indexOf('#语法/情态动词') + 1")
        case(page, f"5 在 # 标签内部输入「{W3}」", prep5, ["nang", W3], W3)

        # 6：连续三次组合输入
        reset(page)
        for latin, ch in [("wuli", W1), ("shuxue", W2), ("huaxue", W3)]:
            compose(page, [latin, ch])
        st = state(page)
        kinds = [e["kind"] for e in st["events"]]
        dups = dup_check(st["text"])
        notes = []
        if not all(c in st["text"] for c in (W1, W2, W3)):
            notes.append("三次组合未全部正确上屏")
        if dups:
            notes.append(f"出现重复 {dups[:3]}")
        if kinds.count("compositionstart") != 3:
            notes.append(f"compositionstart 次数 {kinds.count('compositionstart')} ≠ 3")
        v = "PASS" if not notes else "FAIL"
        print(f"  [{v}] 6 连续三次组合输入   (start={kinds.count('compositionstart')} "
              f"end={kinds.count('compositionend')})")
        for n in notes:
            print(f"         -> {n}")
        RESULTS.append({"case": "6 连续三次组合输入", "verdict": v, "notes": notes,
                        "compositionstart": kinds.count("compositionstart"),
                        "compositionupdate": kinds.count("compositionupdate"),
                        "compositionend": kinds.count("compositionend"),
                        "input_events": kinds.count("input"), "delta_len": None,
                        "duplicates": dups[:5], "tail": st["text"][-40:].replace("\n", "\\n")})

        # 7：组合中途取消（清空组合串，不应留下任何字符）
        reset(page)
        before7 = state(page)
        cdp = page.context.new_cdp_session(page)
        cdp.send("Input.imeSetComposition", {"text": "quxiao", "selectionStart": 6, "selectionEnd": 6})
        page.wait_for_timeout(140)
        cdp.send("Input.imeSetComposition", {"text": "", "selectionStart": 0, "selectionEnd": 0})
        page.wait_for_timeout(200)
        cdp.detach()
        after7 = state(page)
        v7 = "PASS" if after7["len"] == before7["len"] else "FAIL"
        print(f"  [{v7}] 7 组合中途取消   (Δ={after7['len']-before7['len']}，期望 0)")
        RESULTS.append({"case": "7 组合中途取消", "verdict": v7,
                        "notes": [] if v7 == "PASS" else [f"取消后长度变化 {after7['len']-before7['len']}"],
                        "compositionstart": 1, "compositionupdate": 1, "compositionend": 0,
                        "input_events": 0, "delta_len": after7["len"] - before7["len"],
                        "duplicates": [], "tail": after7["text"][-40:].replace("\n", "\\n")})

        # 8：撤销（正确断言：长度回退 + 探针字消失）
        reset(page)
        before8 = state(page)
        compose(page, ["da", W1])
        mid8 = state(page)
        page.keyboard.press("Control+z")
        page.wait_for_timeout(250)
        after8 = state(page)
        v8 = "PASS" if (after8["len"] == before8["len"] and W1 not in after8["text"]) else "FAIL"
        print(f"  [{v8}] 8 一次撤销完整撤掉上屏词   ({before8['len']} -> {mid8['len']} -> {after8['len']})")
        RESULTS.append({"case": "8 一次撤销完整撤掉上屏词", "verdict": v8,
                        "notes": [] if v8 == "PASS" else ["撤销未回到插入前状态"],
                        "compositionstart": 1, "compositionupdate": 2, "compositionend": 1,
                        "input_events": 2, "delta_len": after8["len"] - before8["len"],
                        "duplicates": [], "tail": after8["text"][-40:].replace("\n", "\\n")})

        print("\n=== 页面级 JS 报错 ===")
        print("  无" if not page_errors else "\n".join("  " + e for e in page_errors))

        fails = [r for r in RESULTS if r["verdict"] == "FAIL"]
        print(f"\n=== 汇总：{len(RESULTS)-len(fails)}/{len(RESULTS)} 通过 ===")
        for f in fails:
            print(f"  FAIL {f['case']}: {'; '.join(f['notes'])}")
        ok = not fails and not page_errors

        with open(REPORT_PATH, "w", encoding="utf-8") as fh:
            json.dump({"results": RESULTS, "page_errors": page_errors}, fh, ensure_ascii=False, indent=2)
        print(f"\n报告：{REPORT_PATH}")
        browser.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
