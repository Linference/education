// 格致渲染进程的构建配置
//
// 为什么必须上 Vite：CodeMirror 6、pdf.js、docx-preview、KaTeX 都是 npm 包，
// 纯静态页没法用。第一版把 Electron 壳做成无构建的静态页，等于把编辑器的路堵上了
// —— 这是我的决策失误，现在补回来。
//
// 两个关键点：
//   1. base: "./" —— Electron 用 file:// 加载 index.html，
//      默认的绝对路径 "/assets/..." 会 404，必须用相对路径。
//   2. 产物输出到 renderer/dist/，主进程从这里加载。
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "renderer"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome130",       // Electron 44 自带 Chromium 152，可以用新语法
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // 把重依赖拆开，首屏只加载必要的
        manualChunks: {
          codemirror: [
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/commands",
            "@codemirror/language",
            "@codemirror/lang-markdown",
            "@codemirror/autocomplete",
            "@codemirror/search",
          ],
          pdf: ["pdfjs-dist"],
          docx: ["docx-preview", "mammoth"],
          markdown: ["markdown-it", "highlight.js"],
          katex: ["katex"],
        },
      },
    },
  },
  // pdf.js 的 worker 需要特殊处理：用 ?url 引入并在运行时指定
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },
});
