# vendor/typst

本目录存放**随格致安装包一起分发**的 Typst 可执行文件。

- 来源：C:\Users\LINKIT\AppData\Local\Microsoft\WinGet\Packages\Typst.Typst_Microsoft.Winget.Source_8wekyb3d8bbwe\typst-x86_64-pc-windows-msvc\typst.exe
- 版本：typst 0.15.1 (9dfd3a08)
- 用途：Markdown → PDF 导出（格致的讲义模板 templates/typst/ 由 typst 编译）

## 许可

Typst 采用 **Apache License 2.0**。随包分发时保留其 LICENSE 与 NOTICE 文件
（见本目录）。上游：https://github.com/typst/typst

## 为什么不放 git

typst.exe 约 50 MB，二进制不进版本库。
需要时运行：

    node scripts/vendor-typst.mjs

该脚本会自动从 PATH / winget 安装目录找到 typst 并复制到这里。
构建脚本 `scripts/build-installer.mjs` 会在打包前检查它是否存在。

## 为什么内置而不是让用户自己装

格致的目标用户是中学生。让每个人先去 `winget install Typst.Typst`
不现实 —— 内置后"装完就能导 PDF"。
代价是安装包体积增加约 25 MB（压缩后）。
