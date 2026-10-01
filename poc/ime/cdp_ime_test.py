# -*- coding: utf-8 -*-
"""格致 PoC · 用 CDP 输入法接口自动驱动中文组合输入

为什么这不是"假测试"：
  Input.imeSetComposition 是 Chrome DevTools Protocol 里的**输入法接口**，
  它走 Blink 真实的 composition 编辑路径（不是往 DOM 里硬塞事件），
  因此 CodeMirror 观察到的事件序列与真实输入法高度一致。

它测不到的：
  - 操作系统输入法引擎本身（候选词排序、翻页、模糊音、云候选）
  - 某些输入法特有的"先上屏拼音串再替换"的行为
  → 这两部分仍需要真人用一次；但"编辑器处理组合输入是否会丢字/重复/跳位"可以自动测。

用法：先启动 poc/ime 的开发服务器，再运行本脚本。
"""
import json
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:5188"
REPORT = []
# 报告写回 PoC 目录（脚本本体从临时目录运行，避免被 Vite 的 fs watcher 锁住）
REPORT_PATH = r"D:\Users\LINKIT\Desktop\格致\poc\ime\cdp-ime-report.json"


def install_probe(page):
    """在页面里挂一个全局探针，记录所有 composition / 文档变化事件。"""
    page.evaluate("""() => {
      window.__probe = { events: [], errors: [] };
      const ed = document.querySelector('.cm-content');
      const rec = (kind, detail) => {
        window.__probe.events.push({ t: performance.now(), kind, ...detail });
      };
      ed.addEventListener('compositionstart', (e) => rec('compositionstart', { data: e.data ?? null }));
      ed.addEventListener('compositionupdate', (e) => rec('compositionupdate', { data: e.data ?? null }));
      ed.addEventListener('compositionend', (e) => rec('compositionend', { data: e.data ?? null }));
      ed.addEventListener('input', (e) => rec('input', {
        inputType: e.inputType, data: e.data ?? null, isComposing: e.isComposing,
        docLen: document.querySelector('.cm-content').textContent.length,
      }));
      window.addEventListener('error', (e) => window.__probe.errors.push(String(e.message)));
    }""")


def doc_state(page):
    return page.evaluate("""() => {
      const c = document.querySelector('.cm-content');
      const sel = window.getSelection();
      const g = window.__gezhi;
      return {
        text: g ? g.docText() : c.textContent,   // 以编辑器状态为准，比 DOM 文本可靠
        len: g ? g.docLen() : c.textContent.length,
        selHead: g ? g.selection().head : null,
        domText: c.textContent,
        events: (window.__probe.events || []).slice(),
        errors: (window.__probe.errors || []).slice(),
      };
    }""")


def reset(page):
    page.click("#btn-reset")
    page.wait_for_timeout(150)
    page.evaluate("() => { window.__probe.events = []; window.__probe.errors = []; }")


def click_editor_end(page):
    """把光标点到最后一行末尾并聚焦编辑器。"""
    page.click(".cm-content")
    page.keyboard.press("Control+End")
    page.wait_for_timeout(120)


def compose(page, latin, hanzi):
    """用 CDP 输入法接口做一次完整组合输入：拼音串 -> 组合更新 -> 上屏。"""
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.imeSetComposition", {"text": latin, "selectionStart": len(latin), "selectionEnd": len(latin)})
    page.wait_for_timeout(120)
    cdp.send("Input.imeSetComposition", {"text": hanzi, "selectionStart": len(hanzi), "selectionEnd": len(hanzi)})
    page.wait_for_timeout(120)
    cdp.send("Input.insertText", {"text": hanzi})
    page.wait_for_timeout(180)
    cdp.detach()


def find_duplicates(text):
    """找紧邻重复的汉字/全角字符（IME 类 bug 的典型表征）。"""
    out = []
    for i in range(len(text) - 1):
        a, b = text[i], text[i + 1]
        if a == b and ("\u4e00" <= a <= "\u9fff" or "\uff00" <= a <= "\uffef"):
            out.append((i, a + b))
    return out


def run_case(page, name, prepare, latin, hanzi, expect_substring):
    reset(page)
    prepare(page)
    before = doc_state(page)
    compose(page, latin, hanzi)
    after = doc_state(page)
    events = after["events"]

    kinds = [e["kind"] for e in events]
    got_cs = kinds.count("compositionstart")
    got_ce = kinds.count("compositionend")
    dup = find_duplicates(after["text"])
    appended = after["len"] - before["len"]
    ok_len = expect_substring in after["text"]

    verdict = "PASS"
    notes = []
    if not ok_len:
        verdict = "FAIL"
        notes.append(f"正文里找不到期望的「{expect_substring}」")
    if got_cs == 0:
        verdict = "FAIL"
        notes.append("没有收到 compositionstart（CDP 路径未触发组合事件）")
    if got_cs != got_ce:
        verdict = "FAIL"
        notes.append(f"组合事件不配对 start={got_cs} end={got_ce}")
    if dup:
        verdict = "FAIL"
        notes.append(f"出现重复字符 {dup[:3]}")
    if after["errors"]:
        verdict = "FAIL"
        notes.append(f"页面报错 {after['errors'][:2]}")

    REPORT.append({
        "case": name, "verdict": verdict, "notes": notes,
        "compositionstart": got_cs, "compositionupdate": kinds.count("compositionupdate"),
        "compositionend": got_ce, "input_events": kinds.count("input"),
        "delta_len": appended, "duplicates": dup[:5],
        "got": after["text"][-70:].replace("\n", "\\n"),
    })
    print(f"  [{verdict}] {name}  (start={got_cs} update={kinds.count('compositionupdate')} "
          f"end={got_ce} input={kinds.count('input')} Δ={appended})")
    for n in notes:
        print(f"         └─ {n}")
    return verdict


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-features=ElasticOverscroll"])
        page = browser.new_page(viewport={"width": 1500, "height": 950})
        console_errors = []
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.goto(URL, wait_until="load", timeout=60000)
        page.wait_for_selector(".cm-editor", timeout=30000)
        page.wait_for_timeout(800)
        install_probe(page)

        print("=== CDP 输入法自动测试（组合输入路径）===")
        print(f"环境: {page.evaluate('navigator.userAgent')[:90]}")

        # 用例 1：行尾纯中文组合输入
        run_case(page, "1 行尾输入「情态动词」",
                 click_editor_end, "qingtaidongci", "情态动词", "情态动词")

        # 用例 2：中英混排（先英后中，模拟频繁切换）
        def prep2(pg):
            click_editor_end(pg)
            pg.keyboard.type("modal ")
            pg.wait_for_timeout(100)
        run_case(page, "2 中英混排「modal 动词」", prep2, "dongci", "动词", "modal 动词")

        # 用例 3：在 wikilink 方括号内部输入（历史 bug #1688 的场景）
        def prep3(pg):
            pos = pg.evaluate("""() => {
              const t = window.__gezhi.docText();
              const i = t.indexOf('[[');
              return i < 0 ? -1 : i + 2;
            }""")
            assert pos > 0, "文档里找不到 [["
            pg.evaluate("(p) => window.__gezhi.setCursor(p)", pos)
            pg.wait_for_timeout(150)
        run_case(page, "3 在 [[ ]] 内部输入「语气」", prep3, "yuqi", "语气", "语气")

        # 用例 4：在 $ $ 公式内部输入
        def prep4(pg):
            pos = pg.evaluate("""() => {
              const t = window.__gezhi.docText();
              const i = t.indexOf('$P(A|B)');
              return i < 0 ? -1 : i + 1;
            }""")
            assert pos > 0, "文档里找不到公式"
            pg.evaluate("(p) => window.__gezhi.setCursor(p)", pos)
            pg.wait_for_timeout(150)
        run_case(page, "4 在 $ 公式内部输入「概率」", prep4, "gailv", "概率", "概率")

        # 用例 5：连续多次组合输入（考验状态机与撤销栈）
        reset(page)
        click_editor_end(page)
        for latin, hanzi in [("wuli", "物理"), ("shuxue", "数学"), ("huaxue", "化学")]:
            compose(page, latin, hanzi)
        st = doc_state(page)
        dup5 = find_duplicates(st["text"])
        ok5 = all(w in st["text"] for w in ("物理", "数学", "化学"))
        v5 = "PASS" if (ok5 and not dup5) else "FAIL"
        kinds5 = [e["kind"] for e in st["events"]]
        print(f"  [{v5}] 5 连续三次组合输入  (start={kinds5.count('compositionstart')} "
              f"end={kinds5.count('compositionend')} duplicates={dup5[:3]})")
        REPORT.append({"case": "5 连续三次组合输入", "verdict": v5,
                       "notes": [] if v5 == "PASS" else ["三次组合输入未全部正确上屏或出现重复"],
                       "compositionstart": kinds5.count("compositionstart"),
                       "compositionupdate": kinds5.count("compositionupdate"),
                       "compositionend": kinds5.count("compositionend"),
                       "input_events": kinds5.count("input"),
                       "delta_len": None, "duplicates": dup5[:5],
                       "got": st["text"][-70:].replace("\n", "\\n")})

        # 用例 6：组合中途取消（不 insertText，直接清空组合）
        reset(page)
        click_editor_end(page)
        before6 = doc_state(page)
        cdp = page.context.new_cdp_session(page)
        cdp.send("Input.imeSetComposition", {"text": "quxiao", "selectionStart": 6, "selectionEnd": 6})
        page.wait_for_timeout(150)
        cdp.send("Input.imeSetComposition", {"text": "", "selectionStart": 0, "selectionEnd": 0})
        page.wait_for_timeout(200)
        cdp.detach()
        after6 = doc_state(page)
        v6 = "PASS" if after6["len"] == before6["len"] else "FAIL"
        print(f"  [{v6}] 6 组合中途取消  (Δ={after6['len'] - before6['len']}, 期望 0)")
        REPORT.append({"case": "6 组合中途取消", "verdict": v6,
                       "notes": [] if v6 == "PASS" else [f"取消后文档长度变化 {after6['len'] - before6['len']}"],
                       "duplicates": []})

        # 用例 7：撤销 —— 一次撤销应整体撤掉刚上屏的词
        reset(page)
        click_editor_end(page)
        compose(page, "ceshi", "测试")
        len_after_compose = doc_state(page)["len"]
        page.keyboard.press("Control+z")
        page.wait_for_timeout(250)
        len_after_undo = doc_state(page)["len"]
        txt_after_undo = doc_state(page)["text"]
        v7 = "PASS" if ("测试" not in txt_after_undo) else "FAIL"
        print(f"  [{v7}] 7 撤销整体撤掉上屏词  ({len_after_compose} -> {len_after_undo}, 剩「测试」={('测试' in txt_after_undo)})")
        REPORT.append({"case": "7 撤销整体撤掉上屏词", "verdict": v7,
                       "notes": [] if v7 == "PASS" else ["撤销后仍然残留「测试」"],
                       "duplicates": []})

        print("\n=== 页面级 JS 报错 ===")
        print("  无" if not console_errors else "\n".join("  " + e for e in console_errors))

        fails = [r for r in REPORT if r["verdict"] == "FAIL"]
        print(f"\n=== 汇总：{len(REPORT) - len(fails)}/{len(REPORT)} 通过 ===")
        for f in fails:
            print(f"  FAIL {f['case']}: {'; '.join(f['notes'])}")

        with open(REPORT_PATH, "w", encoding="utf-8") as fh:
            json.dump(REPORT, fh, ensure_ascii=False, indent=2)
        print(f"\n详细报告已写入 {REPORT_PATH}")

        browser.close()
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
