// 关系图谱
//
// 把笔记之间的 [[wiki 链接]] 画成一张图。
//
// ★ 为什么自己写力导向布局，不引库：
//   常见方案（d3-force / cytoscape / vis-network）都不小，
//   而我们只需要最基础的三条力：斥力、弹簧、向心。
//   自己写不到 100 行，还能顺手做两件库不好做的事：
//     · 悬空节点（被引用但文件不存在）用虚线空心圈区分
//     · 节点半径按连接数开方缩放（degree 差 10 倍时视觉才不失控）
//
// ★ 什么时候停止迭代：
//   力导向是迭代逼近，跑满 300 轮就够稳定了；
//   持续跑会让 CPU 一直忙（几百个节点时很明显）。
//   布局算完就停，之后只在拖拽/缩放时重绘。
//
// ★ 节点上限：
//   几百个节点还看得清，上千个就是一团毛线。
//   所以主进程那边就截断了，界面上如实说明"图被截断"。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface GNode {
  id: string;
  /** 相对于库的路径（主进程算好的）—— 分组/着色必须用它 */
  rel?: string;
  name: string;
  ext: string;
  exists: boolean;
  degree: number;
}
interface GEdge {
  source: string;
  target: string;
  label: string | null;
  line: number | null;
}

interface Props {
  vaultPath: string | null;
  /** 点节点时打开对应文件 */
  onOpen?: (path: string) => void;
}

/** 布局迭代轮数：300 轮足够稳定，再多是浪费 */
const ITERATIONS = 300;
/** 节点半径：按连接数开方，避免大节点吃掉整张图 */
const radiusOf = (degree: number) => Math.min(26, 5 + Math.sqrt(degree) * 3.2);

/**
 * 顶层文件夹 → 颜色。
 *
 * ★ 为什么按文件夹着色（照 Obsidian 的做法）：
 *   颜色是这张图上唯一能"一眼看出结构"的线索。
 *   按文件夹分色之后，哪个学科/主题的笔记互相引用密集，直接就看得出来。
 *   如果所有节点一个颜色，几百个点就只是一团。
 *
 * 用固定调色板 + 名称哈希取色：同一个文件夹在任何库里都是同一个颜色，
 * 不需要用户配置，也不怕文件夹改名导致颜色乱跳（改了名颜色才会变，可接受）。
 */
const FOLDER_COLORS = [
  "#6366f1", // 靛蓝
  "#0ea5e9", // 天蓝
  "#10b981", // 翠绿
  "#f59e0b", // 琥珀
  "#ef4444", // 朱红
  "#8b5cf6", // 紫
  "#ec4899", // 品红
  "#14b8a6", // 青
  "#84cc16", // 黄绿
  "#f97316", // 橙
];
/**
 * 取节点所属的顶层文件夹。
 *
 * ★ 必须用**相对路径**（rel），不能用 id：
 *   id 是绝对路径 C:\...\数学\二次函数.md，取第一段只会得到 "C:"，
 *   实测就是这个现象 —— 图例显示成「C.（12）」，所有节点同色、分组失效。
 *   主进程已经把 rel 算好传过来了。
 */
function folderOf(n: { rel?: string; id: string; exists?: boolean }): string {
  const p = n.rel || "";
  if (!p) return "（未分类）";   // 悬空节点没有路径
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts[0] : "（根目录）";
}
function colorOf(folder: string): string {
  let h = 0;
  for (let i = 0; i < folder.length; i++) h = (h * 31 + folder.charCodeAt(i)) | 0;
  return FOLDER_COLORS[Math.abs(h) % FOLDER_COLORS.length];
}

/**
 * 并查集：把节点按"有边相连"归成连通分量。
 *
 * ★★ 这是修"图太乱"的关键 ★★
 *
 * 出处：Obsidian 的图谱把**每个新节点都从 (0,0) 开始**，
 * 于是所有互不相连的组全堆在原点，只靠浮点误差散开 ——
 * 而力导向布局**没有一种"让两个已经缠住的组件互相穿过"的动作**，
 * 只能互相推开。所以第一瞬间形成的缠绕是永久的，
 * 调斥力/向心力都救不回来（那是在治症状，不是治病）。
 *
 * 正确做法：**先在初始化阶段就把各组分开** ——
 * 算连通分量 → 各分量中心摆在一个环上 → 组内节点在圆盘里散布。
 * 这样模拟一开始各组就已经在各自的地盘上，怎么跑都不会缠。
 */
function connectedComponents(nodeIds: string[], edges: GEdge[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // 路径压缩
    let c = x;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of nodeIds) parent.set(id, id);
  for (const e of edges) {
    if (parent.has(e.source) && parent.has(e.target)) union(e.source, e.target);
  }
  const groups = new Map<string, string[]>();
  for (const id of nodeIds) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(id);
  }
  // 大的排前面：环上位置按大小分配，大的占更好（更靠外/更宽）的位置
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

export default function GraphView({ vaultPath, onOpen }: Props) {
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[]; truncated?: boolean; totalDocs?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 悬停的节点（显示名字） */
  const [hover, setHover] = useState<string | null>(null);
  /** 只看已存在的笔记（默认也画悬空节点，但可以关掉） */
  const [hideDangling, setHideDangling] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 算好的坐标：id → {x, y} */
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /** 画布尺寸 */
  const sizeRef = useRef({ w: 800, h: 600 });

  // ---- 取数据 ----
  const load = useCallback(async () => {
    if (!vaultPath) { setData(null); return; }
    setLoading(true);
    setErr(null);
    try {
      // 索引要先建好才有图；这里顺带触发一次索引并等它完成
      await window.gezhi.search.open(vaultPath).catch(() => null);
      const r = await window.gezhi.search.graph({ vault: vaultPath });
      if (r?.ok === false) { setErr(String(r.error)); return; }
      setData({ nodes: r.nodes ?? [], edges: r.edges ?? [], truncated: r.truncated, totalDocs: r.totalDocs });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  useEffect(() => { void load(); }, [load]);

  /** 过滤后的图 */
  const view = useMemo(() => {
    if (!data) return { nodes: [] as GNode[], edges: [] as GEdge[] };
    if (!hideDangling) return { nodes: data.nodes, edges: data.edges };
    const keep = new Set(data.nodes.filter((n) => n.exists).map((n) => n.id));
    return {
      nodes: data.nodes.filter((n) => n.exists),
      edges: data.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    };
  }, [data, hideDangling]);

  /**
   * 力导向布局。
   *
   * ★★ 初始化比力更重要 ★★
   *
   * 参照 Obsidian 的实际做法（以及社区对它的修正）：
   *   它的模拟把每个新节点都放在 (0,0)，所有互不相连的组堆在原点，
   *   只靠浮点误差散开。而力布局**无法让两个已缠住的组件互相穿过** ——
   *   只能推开，所以第一瞬的缠绕是**永久的**。
   *
   * 所以这里分两步：
   *   ① 初始化：并查集分组 → 各分量中心摆成环 → 组内按 √n 半径散布
   *   ② 迭代：斥力 + 弹簧 + 组内聚 + 组间离 + 向心
   * 这样一开始各组就在各自地盘上，跑起来不会互相穿插。
   */
  const computeLayout = useCallback(() => {
    const { nodes, edges } = view;
    if (!nodes.length) return;

    const { w, h } = sizeRef.current;
    const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    const cx = w / 2;
    const cy = h / 2;

    // ---------- ① 初始化：先分组，再摆位 ----------
    const comps = connectedComponents(nodes.map((n) => n.id), edges);
    // 组分色（用于组间分离力，也用于节点着色）
    const groupOf = new Map<string, string>();
    for (const n of nodes) groupOf.set(n.id, folderOf(n));

    /*
     * 环半径要能让最大的两个分量互不重叠。
     * 每个分量自己占的半径 ≈ 175 × √(n/π)（照 graph-spawn 的经验值），
     * 环上放 k 个分量时，相邻中心距至少得有 r1 + r2，
     * 取周长 / k 来估，再留 1.25 倍余量。
     */
    const compRadius = (n: number) => Math.max(38, 175 * Math.sqrt(n / Math.PI) * 0.55);
    const k = comps.length;
    let ringR = 0;
    if (k > 1) {
      const maxPair = compRadius(comps[0].length) + compRadius(comps[1].length);
      // 相邻中心距 = 2·ringR·sin(π/k) ≥ maxPair
      ringR = (maxPair * 1.25) / (2 * Math.sin(Math.PI / k));
      // 别让环大得超出画布
      ringR = Math.min(ringR, Math.min(w, h) * 0.42);
    }

    // 确定性散布用：同一个图每次画出同样的结果（不是 Math.random，否则每次开都不一样）
    let seed = 20261002;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    comps.forEach((ids, ci) => {
      // 单分量时居中；多分量时按大小顺序摆在环上
      const ang = k > 1 ? (ci / k) * Math.PI * 2 - Math.PI / 2 : 0;
      const gx = k > 1 ? cx + ringR * Math.cos(ang) : cx;
      const gy = k > 1 ? cy + ringR * Math.sin(ang) : cy;

      // 组内散布半径：由组大小决定，用 sqrt 保证面积与节点数成正比
      const r = compRadius(ids.length);
      ids.forEach((id, i) => {
        // 黄金角螺旋：比纯随机更均匀，且确定性
        const a = i * Math.PI * (3 - Math.sqrt(5)) + rnd() * 0.3;
        const rr = r * Math.sqrt((i + 0.5) / ids.length);
        pos.set(id, {
          x: gx + rr * Math.cos(a),
          y: gy + rr * Math.sin(a),
          vx: 0, vy: 0,
        });
      });
    });

    // ---------- ② 迭代 ----------
    const idealLen = Math.max(70, Math.min(w, h) / 8);
    const deg = new Map(nodes.map((n) => [n.id, n.degree]));
    const arr = nodes.map((n) => ({ id: n.id, p: pos.get(n.id)! }));

    for (let it = 0; it < ITERATIONS; it++) {
      const cooling = 1 - it / ITERATIONS;
      const step = 14 * cooling + 0.3;

      // 斥力：两两相斥。节点数被主进程限制在 400 以内，O(n²) 可接受
      // （再大就该上 Barnes-Hut 八叉树了，那是另一个量级的复杂度）
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i].p;
          const b = arr[j].p;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { d2 = 1; dx = rnd() - 0.5; dy = rnd() - 0.5; }
          const f = 2600 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }

      // 弹簧：有边相连的拉近到 idealLen。悬空节点用更长的边，显得"还没落地"
      for (const e of edges) {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) continue;
        const isDangling = e.target.startsWith("dangling:");
        const target = idealLen * (isDangling ? 1.5 : 1);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (d - target) * 0.04;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      /*
       * 组内聚 + 组间离（照 fast-graph 的"聚类感知布局"）。
       * 只有斥力和弹簧的话，同一文件夹的笔记会被别的组插进来，
       * 看着就是一团糊；加了这两条，各学科/主题才会各自成团。
       */
      const centroids = new Map<string, { x: number; y: number; n: number }>();
      for (const { id, p } of arr) {
        const g = groupOf.get(id) ?? "";
        const c = centroids.get(g) ?? { x: 0, y: 0, n: 0 };
        c.x += p.x; c.y += p.y; c.n += 1;
        centroids.set(g, c);
      }
      for (const c of centroids.values()) { c.x /= c.n; c.y /= c.n; }

      const groups = [...centroids.keys()];
      for (const { id, p } of arr) {
        const g = groupOf.get(id);
        const c = g ? centroids.get(g) : null;
        // 组内聚：往自己组的质心靠（系数很小，别压过弹簧）
        if (c) {
          p.vx += (c.x - p.x) * 0.02;
          p.vy += (c.y - p.y) * 0.02;
        }
        // 组间离：被别的组的质心推开（只算质心，不是两两，代价 O(组数)）
        for (const og of groups) {
          if (og === g) continue;
          const oc = centroids.get(og)!;
          let dx = p.x - oc.x;
          let dy = p.y - oc.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 1) continue;
          const d = Math.sqrt(d2);
          /*
           * 组间分离力。取 600/d（不是 /d²）：远处也保留一点推力。
           * 曾试过 1600/d + 6 倍作用范围，结果**用力过猛** ——
           * 三个群被推到画布四角、贴着边被裁掉。
           * 力度这种事调不准，所以最后还有一道"整体缩放适配画布"兜底
           * （见下面的 fitToCanvas），它才是保证不溢出、不缩小成一坨的关键。
           */
          if (d > idealLen * 4.5) continue;
          const f = 600 / Math.max(1, d);
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }

      // 向心 + 阻尼 + 限速 + 应用
      for (const { id, p } of arr) {
        /*
         * 向心力必须**很弱**。
         * 原来 0.004 太强：300 轮迭代下来会把已经分开的几个群
         * 重新压回画布中心（实测症状就是"三个群挤成一坨"）。
         * 它的作用只是"别让孤立节点飘出画布"，不该主导布局。
         */
        p.vx += (cx - p.x) * 0.0012;
        p.vy += (cy - p.y) * 0.0012;
        const damp = 0.84 + Math.min(0.1, (deg.get(id) ?? 0) * 0.005);
        p.vx *= damp;
        p.vy *= damp;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > step) { p.vx = (p.vx / sp) * step; p.vy = (p.vy / sp) * step; }
        p.x += p.vx;
        p.y += p.vy;
        const m = 34;
        p.x = Math.max(m, Math.min(w - m, p.x));
        p.y = Math.max(m, Math.min(h - m, p.y));
      }
    }

    /*
     * ---------- ③ 整体缩放适配画布 ----------
     *
     * ★ 这一步是"图不好看"的通用解药。
     *
     * 力的大小非常难调：
     *   斥力小 → 全挤在中间一小块
     *   斥力大 → 被推到画布四角、贴着边被裁掉
     * 我两种都实测撞过。与其反复试系数，不如**算完再整体缩放**：
     *   把包围盒等比缩放到画布内（留边距），结构完全不变，
     *   但无论力怎么调都不会溢出、也不会只占中间一小点。
     */
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pos.values()) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 56;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const availW = Math.max(60, w - pad * 2);
    const availH = Math.max(60, h - pad * 2);
    // 只放大到刚好铺满，不缩小超过 1.6 倍（缩太狠会让节点挤成一团）
    let scale = Math.min(availW / bw, availH / bh);
    scale = Math.min(scale, 1.6);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;

    const out = new Map<string, { x: number; y: number }>();
    for (const [id, p] of pos) {
      out.set(id, {
        x: cx + (p.x - (minX + maxX) / 2) * scale,
        y: cy + (p.y - (minY + maxY) / 2) * scale,
      });
    }
    posRef.current = out;
  }, [view]);

  // ---- 画 ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { w, h } = sizeRef.current;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pos = posRef.current;
    const { nodes, edges } = view;

    // 先画边（在节点下面，不然会压住圆）
    ctx.lineWidth = 1;
    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const dim = hover && hover !== e.source && hover !== e.target;
      ctx.strokeStyle = dim ? "rgba(150,150,160,0.10)" : "rgba(120,120,135,0.32)";
      // 悬空目标的边用虚线：一眼看出"这条链接还没落地"
      const target = data?.nodes.find((n) => n.id === e.target);
      ctx.setLineDash(target && !target.exists ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 再画节点
    for (const n of nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const r = radiusOf(n.degree);
      const dim = hover && hover !== n.id;
      const active = hover === n.id;

      ctx.globalAlpha = dim ? 0.25 : 1;

      if (!n.exists) {
        // 悬空节点：空心 + 虚线边框
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3.5, r * 0.7), 0, Math.PI * 2);
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = "#b0b0bd";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // 按顶层文件夹着色（照 Obsidian）：颜色是这张图上唯一能
        // "一眼看出结构"的线索，同一个文件夹的笔记聚成同色的一团
        const col = colorOf(folderOf(n));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = active ? "#1e1b4b" : col;
        ctx.fill();
        // 连接多的节点加一圈浅色晕，视觉上显得"重要"
        if (n.degree >= 4) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = col + "55";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    /*
     * 标签**最后统一画**，而且要带白色描边。
     *
     * ★ 为什么不能和节点一起画：
     *   参照 Obsidian 的图谱 —— 标签压在连线和其他节点上时必须仍然看得清。
     *   我第一版把标签和节点混在一起画，后画的节点会盖住先画的标签，
     *   几百条连线穿过去就成了一团糊（用户直接指出"太乱"）。
     *
     * ★ 白色描边（先粗描边再填色）是让文字在任意背景上可读的常用手法，
     *   比加半透明底色更干净，也不会遮住图形。
     */
    const labelOf = (n: GNode) => (n.name.length > 16 ? n.name.slice(0, 15) + "…" : n.name);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const n of nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const active = hover === n.id;
      const dim = hover && !active;

      // 只在"悬停 / 连接多 / 图不大"时显示标签，否则几百个标签必然重叠
      const show = active || n.degree >= 2 || nodes.length <= 60;
      if (!show) continue;

      const r = radiusOf(n.degree);
      const text = labelOf(n);
      const fs = active ? 12 : 11;
      ctx.globalAlpha = dim ? 0.3 : 1;
      ctx.font = `${active ? 600 : 400} ${fs}px system-ui, "Microsoft YaHei", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineJoin = "round";
      ctx.strokeText(text, p.x, p.y + r + 3);
      ctx.fillStyle = n.exists ? "#2c2833" : "#9a9aa6";
      ctx.fillText(text, p.x, p.y + r + 3);
      ctx.globalAlpha = 1;
    }
  }, [view, hover, data]);

  // ---- 尺寸变化 ----
  useEffect(() => {
    const wrap = canvasRef.current?.parentElement;
    if (!wrap) return;
    const update = () => {
      const r = wrap.getBoundingClientRect();
      const changed = Math.abs(r.width - sizeRef.current.w) > 4 || Math.abs(r.height - sizeRef.current.h) > 4;
      sizeRef.current = { w: Math.max(200, r.width), h: Math.max(200, r.height) };
      if (changed) { computeLayout(); draw(); } else { draw(); }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [computeLayout, draw]);

  // ---- 数据变化 → 重算布局 ----
  useEffect(() => {
    computeLayout();
    draw();
  }, [computeLayout, draw]);

  // ---- 交互：悬停高亮 + 点击打开 ----
  const pick = (mx: number, my: number) => {
    const pos = posRef.current;
    let best: string | null = null;
    let bestD = 1e9;
    for (const n of view.nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const d = Math.hypot(p.x - mx, p.y - my);
      const r = radiusOf(n.degree) + 4;
      if (d < r && d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (hit !== hover) { setHover(hit); }
    e.currentTarget.style.cursor = hit ? "pointer" : "default";
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    const node = view.nodes.find((n) => n.id === hit);
    if (node?.exists) onOpen?.(hit);
    else setErr(`「${node?.name ?? hit}」还没有对应的文件 —— 这是一条悬空链接`);
  };

  if (!vaultPath) return <div className="tree-empty">打开一个库后可以看到关系图谱</div>;

  const stats = view.nodes.length
    ? `${view.nodes.length} 个节点 · ${view.edges.length} 条链接` +
      (data?.nodes.some((n) => !n.exists) ? ` · ${data.nodes.filter((n) => !n.exists).length} 个悬空` : "")
    : "还没有链接";

  /** 图例：按文件夹分组（界面要能解释颜色是什么意思） */
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of view.nodes) {
      if (!n.exists) continue;
      const f = folderOf(n);
      m.set(f, (m.get(f) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [view]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 10,
        padding: "6px 12px", borderBottom: "1px solid var(--bd)",
        background: "var(--bg-secondary)", fontSize: 12,
      }}>
        <span style={{ fontWeight: 600 }}>关系图谱</span>
        <span style={{ color: "var(--text-muted)" }}>{stats}</span>
        {data?.truncated && (
          <span style={{ color: "var(--orange, #f59e0b)" }} title={`库里共 ${data.totalDocs} 篇`}>
            （图已截断，只画了前 400 个节点）
          </span>
        )}
        <div style={{ flex: "1 1 auto" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11.5 }}>
          <input type="checkbox" checked={hideDangling} onChange={(e) => setHideDangling(e.target.checked)} />
          只看已有笔记
        </label>
        <button onClick={() => void load()} style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "underline" }}>
          {loading ? "载入中…" : "重新载入"}
        </button>
      </div>

      {err && (
        <div style={{ flex: "0 0 auto", padding: "4px 12px", fontSize: 11.5, color: "var(--red)", background: "#fdecec" }}>
          {err}
        </div>
      )}

      <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative", background: "var(--bg-primary)" }}>
        <canvas
          ref={canvasRef}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={onClick}
          style={{ display: "block" }}
        />
        {!loading && view.nodes.length === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            color: "var(--text-faint)", fontSize: 12.5, textAlign: "center", lineHeight: 2,
          }}>
            <div>
              还没有链接可以画。
              <br />
              在笔记里用 <code>[[另一篇笔记]]</code> 建立链接，这里就会出现连线。
            </div>
          </div>
        )}
      </div>

      <div style={{
        flex: "0 0 auto", padding: "5px 12px", fontSize: 10.5,
        color: "var(--text-faint)", borderTop: "1px solid var(--bd)",
        background: "var(--bg-secondary)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        {/* 颜色图例：不解释颜色，用户不知道那一团团是什么意思 */}
        {folders.map(([f, n]) => (
          <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: colorOf(f), display: "inline-block",
            }} />
            {f}（{n}）
          </span>
        ))}
        <span style={{ flex: "1 1 auto" }} />
        <span>实心 = 已有笔记（点开）· 虚线空心 = 还没写的笔记 · 圆越大 = 连接越多</span>
      </div>
    </div>
  );
}
