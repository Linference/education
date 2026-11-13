# vendor/typst

This directory holds the Typst executable **distributed together with the Gezhi installer**.

- Source: C:\Users\LINKIT\AppData\Local\Microsoft\WinGet\Packages\Typst.Typst_Microsoft.Winget.Source_8wekyb3d8bbwe\typst-x86_64-pc-windows-msvc\typst.exe
- Version: typst 0.15.1 (9dfd3a08)
- Purpose: Markdown → PDF export (Gezhi's handout templates in templates/typst/ are compiled by typst)

## License

Typst uses the **Apache License 2.0**. When distributing it, its LICENSE and NOTICE files are retained
(see this directory). Upstream: https://github.com/typst/typst

## Why it is not in git

typst.exe is about 50 MB; binaries do not go into the version repository.
When needed, run:

    node scripts/vendor-typst.mjs

This script automatically finds typst from PATH / the winget installation directory and copies it here.
The build script `scripts/build-installer.mjs` checks that it exists before packaging.

## Why bundle it instead of letting users install it themselves

Gezhi's target users are middle-school students. Asking everyone to first run `winget install Typst.Typst`
is unrealistic — bundling means "install and you can export PDFs".
The cost is an increase of about 25 MB in installer size (after compression).
