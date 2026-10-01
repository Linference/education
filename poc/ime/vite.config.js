import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    watch: {
      // 坑：从后台任务启动 python.exe 时，Windows 会把脚本写到当前工作目录的
      // `.selfcheck.py.<pid>.<uuid>.tmpdir/` 里；Vite 的 fs watcher 一旦监听到
      // 这个被独占锁定的文件就抛 EBUSY，整个 dev server 直接崩掉。
      // 因此把本目录里的临时/日志/产物一律排除。
      ignored: [
        "**/.selfcheck.*",
        "**/*.tmpdir/**",
        "**/*.tmp",
        "**/dist/**",
        "**/.vite/**",
      ],
    },
  },
  // 中文文件名与路径在 Windows 上必须保证 UTF-8
  esbuild: { charset: "utf8" },
  build: { outDir: "dist", emptyOutDir: true, target: "chrome120" },
});
