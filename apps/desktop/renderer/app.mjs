// 格致桌面端 · 渲染进程
//
// P1 第一步：把"库 → 文件树 → 标签页 → 看文件"这条链路跑通。
// 编辑器内核（CodeMirror 6）已通过 PoC 验证（见 poc/ime/），
// 但接入需要构建步骤（Vite），所以这一步先用等宽文本视图把数据链路打通，
// 下一步再把 CodeMirror 装上 —— 这样出问题时能分清是"数据链路"还是"编辑器"。
//
// 依赖的 API 全部来自 preload 暴露的 window.gezhi，页面本身碰不到 Node。

const $ = (sel) => document.querySelector(sel);
const api = window.gezhi;

// ------------------------------------------------------------------ 状态

const state = {
  vault: null,          // 当前库 { path, name, isVault, vault }
  expanded: new Set(),  // 展开的目录路径
  treeCache: new Map(), // 目录 → entries
  tabs: [],             // [{ path, name, text, size, mtime }]
  activeTab: null,      // path
};

// ------------------------------------------------------------------ 工具

function fmtSize(n) {
  if (!n) return "";
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + "K";
  return (n / 1024 / 1024).toFixed(1) + "M";
}

function status(left, right) {
  if (left !== undefined) $("#status-left").textContent = left;
  if (right !== undefined) $("#status-right").textContent = right;
}

function setEmptyTree(msg) {
  $("#tree").innerHTML = `<div class="empty">${msg}</div>`;
}

// ------------------------------------------------------------------ 启动

(async function boot() {
  const info = await api.info();
  $("#env-info").textContent = `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`;
  status("就绪", `文档目录：${info.documentsDir}`);
  window.__gezhiReady = true;   // 给自动化测试用的就绪标志
})().catch((e) => {
  status("启动失败：" + e.message);
});

// ------------------------------------------------------------------ 打开库

$("#btn-open-vault").addEventListener("click", async () => {
  const picked = await api.vault.pick();
  if (!picked) return;
  if (!picked.ok) { status("打开失败：" + picked.error); return; }
  await openVault(picked);
});

async function openVault(v) {
  state.vault = v;
  state.expanded.clear();
  state.treeCache.clear();
  state.tabs = [];
  state.activeTab = null;
  renderTabs();
  renderEditor();

  $("#vault-name").textContent = v.isVault ? `${v.name}（格致库）` : `${v.name}（普通文件夹）`;
  renderInfoPanel(v);
  status(`已打开 ${v.name}`, v.path);

  await renderTree();
}

function renderInfoPanel(v) {
  const rows = [
    ["路径", v.path],
    ["类型", v.isVault ? "格致库" : "普通文件夹"],
  ];
  if (v.vault) {
    rows.push(["库 ID", v.vault.id ?? "—"]);
    rows.push(["创建时间", v.vault.createdAt ?? "—"]);
    if (v.vault.dataPolicy) {
      for (const [k, val] of Object.entries(v.vault.dataPolicy)) rows.push([k, val]);
    }
  }
  $("#info-panel").innerHTML = "<dl>" + rows
    .map(([k, val]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(val))}</dd>`)
    .join("") + "</dl>";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ------------------------------------------------------------------ 文件树
//
// 渲染策略：**状态决定视图** —— 点击只改 state.expanded，然后整棵树重画。
//
// 为什么不用增量更新：第一版试过"只重画被点的那一层"，结果是异步竞态
// （先清空 innerHTML 再 await 取数据，期间别的渲染插进来就互相覆盖），
// 表现为"点了目录什么都不出现"，而且**静默失败**、控制台无报错。
// 树只有几百个节点，整树重画的代价远小于维护增量逻辑的复杂度。
// 将来真到几千节点再引入虚拟滚动，那时也该换更好的数据源而不是打补丁。

/** 目录 → entries 缓存（一次会话内不重复读盘） */
async function getEntries(dir, { fresh = false } = {}) {
  if (!fresh && state.treeCache.has(dir)) return state.treeCache.get(dir);
  const r = await api.vault.list(dir);
  const entries = r.ok ? r.entries : [];
  state.treeCache.set(dir, entries);
  return entries;
}

/**
 * 整树重画（唯一入口，避免多处渲染互相打架）。
 * @param {object} opts
 * @param {boolean} [opts.fresh] 丢弃缓存、重新读盘 —— 对应"用户在外部改了文件，我要刷新"
 */
async function renderTree({ fresh = false } = {}) {
  const host = $("#tree");
  if (!state.vault) {
    setEmptyTree("打开一个库后在这里浏览文件");
    return;
  }
  // ★ 刷新时必须**先清缓存再渲染**，否则会把旧数据又读回来缓存一遍 ——
  //   实测就是这么踩的：用户新建了文件，树却一直显示旧内容，而且不报错。
  if (fresh) state.treeCache.clear();

  host.textContent = "";
  try {
    await appendDir(host, state.vault.path, 0);
  } catch (e) {
    // 静默失败是最糟的：宁可显式报出来
    host.textContent = "";
    const err = document.createElement("div");
    err.className = "empty";
    err.textContent = `读取目录失败：${e.message}`;
    host.appendChild(err);
    status("文件树渲染失败：" + e.message);
    throw e;
  }
}

/** 把某个目录的内容追加到容器里；已展开的子目录递归展开 */
async function appendDir(container, dir, depth) {
  const entries = await getEntries(dir);

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.style.paddingLeft = `${10 + depth * 14}px`;
    empty.textContent = "（空）";
    container.appendChild(empty);
    return;
  }

  for (const e of entries) {
    container.appendChild(makeRow(e, depth));
    if (e.isDir && state.expanded.has(e.path)) {
      const kids = document.createElement("div");
      kids.className = "tree-children";
      container.appendChild(kids);
      await appendDir(kids, e.path, depth + 1);
    }
  }
}

function makeRow(e, depth) {
  const row = document.createElement("div");
  row.className = "tree-row" + (e.isDir ? " is-dir" : "");
  if (!e.isDir && e.path === state.activeTab) row.classList.add("active");
  row.style.paddingLeft = `${8 + depth * 14}px`;
  row.dataset.path = e.path;

  const tw = document.createElement("span");
  tw.className = "tw";
  tw.textContent = e.isDir ? (state.expanded.has(e.path) ? "▾" : "▸") : "";
  row.appendChild(tw);

  const nm = document.createElement("span");
  nm.className = "nm";
  nm.textContent = e.name;
  row.appendChild(nm);

  if (!e.isDir && e.size) {
    const sz = document.createElement("span");
    sz.className = "sz";
    sz.textContent = fmtSize(e.size);
    row.appendChild(sz);
  }

  row.addEventListener("click", () => {
    // 只改状态，不碰 DOM —— 重画交给 renderTree
    if (e.isDir) {
      if (state.expanded.has(e.path)) state.expanded.delete(e.path);
      else state.expanded.add(e.path);
      renderTree().catch(() => { /* 已在 renderTree 内提示 */ });
    } else {
      openFile(e).catch((err) => status("打开失败：" + err.message));
    }
  });

  return row;
}

// ------------------------------------------------------------------ 文件

async function openFile(entry) {
  const existing = state.tabs.find((t) => t.path === entry.path);
  if (existing) { activateTab(entry.path); return; }

  const r = await api.file.read(entry.path);
  if (!r.ok) {
    status(`打开失败：${r.error}`);
    return;
  }
  state.tabs.push({ path: entry.path, name: entry.name, text: r.text, size: r.size, mtime: r.mtime });
  state.activeTab = entry.path;
  renderTabs();
  renderEditor();
  highlightActiveRow();
  status(`已打开 ${entry.name}`, `${r.text.length} 字 · ${fmtSize(r.size)}`);
}

function activateTab(path) {
  state.activeTab = path;
  renderTabs();
  renderEditor();
  highlightActiveRow();
  const t = state.tabs.find((x) => x.path === path);
  if (t) status(`已打开 ${t.name}`, `${t.text.length} 字 · ${fmtSize(t.size)}`);
}

function closeTab(path) {
  const i = state.tabs.findIndex((t) => t.path === path);
  if (i < 0) return;
  state.tabs.splice(i, 1);
  if (state.activeTab === path) {
    state.activeTab = state.tabs[Math.min(i, state.tabs.length - 1)]?.path ?? null;
  }
  renderTabs();
  renderEditor();
  highlightActiveRow();
}

function renderTabs() {
  const host = $("#tabs");
  host.innerHTML = "";
  if (state.tabs.length === 0) {
    host.innerHTML = `<div class="tab" style="color:var(--fg-faint);cursor:default"><span class="tname">没有打开的文件</span></div>`;
    return;
  }
  for (const t of state.tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (t.path === state.activeTab ? " active" : "");
    el.title = t.path;
    el.innerHTML = `<span class="tname"></span><span class="tclose" title="关闭">✕</span>`;
    el.querySelector(".tname").textContent = t.name;
    el.addEventListener("click", (ev) => {
      if (ev.target.classList.contains("tclose")) closeTab(t.path);
      else activateTab(t.path);
    });
    host.appendChild(el);
  }
}

function renderEditor() {
  const host = $("#editor-host");
  const t = state.tabs.find((x) => x.path === state.activeTab);
  if (!t) {
    host.innerHTML = `<div class="empty"><p>还没有打开任何文件。</p><p class="hint">从左边选一个文件，或先点「打开库…」。</p></div>`;
    return;
  }
  host.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "file-view";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${t.path}　·　${t.text.length} 字　·　${fmtSize(t.size)}`;
  const pre = document.createElement("pre");
  pre.textContent = t.text;
  pre.id = "file-content";
  wrap.append(meta, pre);
  host.appendChild(wrap);
}

function highlightActiveRow() {
  document.querySelectorAll(".tree-row.active").forEach((el) => el.classList.remove("active"));
  if (state.activeTab) {
    document.querySelector(`.tree-row[data-path="${CSS.escape(state.activeTab)}"]`)?.classList.add("active");
  }
}

// ------------------------------------------------------------------ 拖拽分栏

function wireSplitter(el, target, { min = 180, max = 600, invert = false } = {}) {
  let dragging = false;
  el.addEventListener("mousedown", (e) => {
    dragging = true;
    e.preventDefault();
    document.body.style.cursor = "col-resize";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = invert ? window.innerWidth - e.clientX : e.clientX;
    target.style.width = Math.max(min, Math.min(max, w)) + "px";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
  });
}

wireSplitter($("#split-a"), $("#sidebar"), { min: 180, max: 520 });
wireSplitter($("#split-b"), $("#rightbar"), { min: 200, max: 560, invert: true });

// 给自动化测试留的钩子（正式产品里可以删，或者改成受控调试接口）
window.__gezhiTest = {
  state,
  openVaultByPath: async (dir) => {
    const v = await api.vault.info(dir);
    if (v.ok) await openVault(v);
    return v;
  },
  openFileByPath: async (p) => {
    const r = await api.file.read(p);
    return r;
  },
  /** 刷新文件树：丢弃缓存重新读盘（不清标签页）—— 对应用户在外部改了文件 */
  refreshTree: async () => {
    if (!state.vault) return false;
    await renderTree({ fresh: true });
    return true;
  },
  tabCount: () => state.tabs.length,
  activePath: () => state.activeTab,
};
