# 鏍艰嚧

> 鏈湴浼樺厛鐨勪釜浜哄涔犳搷浣滅郴缁?鈥斺€?鍍?Obsidian 涓€鏍风鐭ヨ瘑锛屽儚 VSCode 涓€鏍风紪杈戞枃妗ｏ紝
> 璁?AI 绔欏湪**浣犺嚜宸辩殑涔︿笂**璇磋瘽锛岃兘鍑哄嵎銆佽兘鑰冧綘銆佽兘鏇夸綘鎺掕鍒掋€?
浜у搧鍚嶅彇鑷€屾牸鐗╄嚧鐭ャ€嶃€?
---

## 鐜板湪鑳借窇浠€涔?
```bash
# 涓€鏉″懡浠よ窇瀹屽叏閮ㄥ湴鍩烘鏌ワ紙P0锛?node scripts/p0.mjs

# 鐪?鏂囨。"鐩綍鏄€庝箞瑙ｆ瀽鍑烘潵鐨勶紙搴撻粯璁ゆ斁杩欏効锛?node packages/db/src/cli.mjs where

# 寤轰竴涓簱
node packages/db/src/cli.mjs init 楂樹簩涓?--subject 鑻辫 --grade 楂樹簩

# 鍒楀嚭鎵€鏈夊簱
node packages/db/src/cli.mjs list

# 渚濊禆璁稿彲闂ㄧ锛堟嫤浣?AGPL / 闈炲晢涓?/ 绂佹鐢熶骇浣跨敤绛夛級
node scripts/check-licenses.mjs
node scripts/check-licenses.test.mjs    # 闂ㄧ鑷祴锛氳瘉鏄庡畠鐪熺殑浼氭嫤

# 鏁版嵁搴撶粨鏋勬柇瑷€锛堝惈涓枃鍙?FTS 绱㈠紩锛?node packages/db/src/assert-schema.mjs

# DSH 妗ュ啋鐑燂紙鐪熷疄璋冪敤 AI + 鍙楁帶鏀瑰簱鍐呮枃浠讹級
node packages/dsh-bridge/smoke.mjs
```

> **涓嶉渶瑕?`npm install`** 鈥斺€?鐩墠鎵€鏈変唬鐮佸彧鐢?Node 鍐呯疆妯″潡锛堝惈 `node:sqlite`锛夈€?> 杩欐鏄埢鎰忕殑锛氬湴鍩洪樁娈典笉寮曞叆浠讳綍渚濊禆锛屽氨涓嶅彲鑳芥湁渚涘簲閾句笌璁稿彲椋庨櫓銆?
---

## 鐩綍缁撴瀯

```
鏍艰嚧/
鈹溾攢 鏍艰嚧-寮€鍙戣鍒?md          鈫?鎬荤翰锛氶€夊瀷銆佹灦鏋勩€佹暟鎹ā鍨嬨€丳0鈥揚11銆侀闄╃櫥璁板唽
鈹溾攢 docs/                     鈫?瀹炴祴鏂囨。锛堢幆澧冨嫎瀵?/ DSH 閫夊瀷 / 瀛樺偍 / DSH 闆嗘垚锛?鈹? 鈹斺攢 templates/             鈫?鍙璺戠殑鎺㈤拡鑴氭湰涓?DSH 閰嶇疆鏍锋湰
鈹溾攢 research/                 鈫?鍏唤鎶€鏈皟鐮旓紙缂栬緫鍣ㄥ浘璋?/ 鏂囨。鍐呮牳 / 鏁欐潗棰樺簱 / 鏁板瓧浜?/ 鏃ュ巻锛?鈹溾攢 poc/ime/                  鈫?涓枃杈撳叆娉?PoC锛圕odeMirror 6锛岃嚜鍔ㄦ祴璇?8/8 閫氳繃锛?鈹溾攢 packages/
鈹? 鈹溾攢 db/                    鈫?SQLite 缁撴瀯涓庢绱紙node:sqlite + FTS5 鍙岀储寮曪級
鈹? 鈹溾攢 core/                  鈫?搴擄紙Vault锛夎剼鎵嬫灦銆佽矾寰勮В鏋?鈹? 鈹斺攢 dsh-bridge/            鈫?DeepSeek Harness 妗ワ細鎶?dsh headless 灏佹垚浜嬩欢娴?鈹溾攢 apps/desktop/             鈫?Electron 妗岄潰绔紙P1 璧凤級
鈹斺攢 scripts/                  鈫?P0 鎬诲叆鍙ｄ笌 CI 闂ㄧ
```

---

## 鍥涙潯涓嶅Ε鍗忕殑鍘熷垯

1. **鏁版嵁鍦ㄤ綘鐢佃剳涓?* 鈥斺€?搴撳氨鏄竴涓櫘閫氭枃浠跺す锛孧arkdown 鏄敮涓€鐪熸簮锛岄殢鏃惰兘鐢ㄥ埆鐨勮蒋浠舵墦寮€銆?2. **AI 蹇呴』绔欏湪璇佹嵁涓?* 鈥斺€?鍥炵瓟鏁欐潗闂瑕佺粰銆屽摢鏈功銆佸摢涓€椤点€嶏紱鎵句笉鍒板嚭澶勫氨鏄庤锛屼笉璁哥紪銆?3. **鍙搷浣溿€佸彲楠屾敹** 鈥斺€?姣忎釜闃舵閮借兘璺戙€佽兘婕旂ず銆佽兘鍥為€€锛涗笉鍋?鐪嬭捣鏉ュ揩瀹屾垚"鐨勫崐鎴愬搧銆?4. **涓嶉噸澶嶉€犲紩鎿?* 鈥斺€?Agent 鍐呮牳鐢?DeepSeek Harness锛屾枃妗ｅ唴鏍哥敤鐜版垚寮€婧愪欢锛屾牸鑷村彧鍋氬涔犻鍩熺湡姝ｇ己鐨勪笢瑗裤€?
---

## 宸茬煡鐨勭‖绾︽潫锛堥兘鏄疄娴嬪緱鍑虹殑锛屽埆鍐嶈俯锛?
| 绾︽潫 | 璇存槑 |
| --- | --- |
| **涓枃 FTS 蹇呴』鐢?trigram** | SQLite 榛樿 `unicode61` 鎶婃眽瀛楄涓?token 瀛楃鑰屼腑鏂囨棤绌烘牸 鈫?鏁村彞鍙樻垚涓€涓?token锛?*妫€绱㈤潤榛樿繑鍥?0 鏉?*銆傚凡鐢ㄥ弻绱㈠紩瑙ｅ喅锛坱rigram 鍙洖 + jieba 棰勫垎璇嶆帓搴忥級 |
| **搴撹矾寰勪笉鑳界‖缂栫爜** | 銆屾枃妗ｃ€嶅彲鑳借閲嶅畾鍚戯紙鏈満灏卞湪 D 鐩橈級銆傜敤 `app.getPath('documents')`锛岀函 Node 涓嬭娉ㄥ唽琛?|
| **绱㈠紩涓庣紦瀛樻斁 `%APPDATA%`** | 搴撹嫢鍦?OneDrive 绛夊悓姝ョ洰褰曢噷锛學AL 妯″紡鐨?SQLite 浼氳浜戠洏鎵撴柇鍐欏叆鑰屾崯鍧?|
| **涓嶈 spawn `.cmd` 鏂囦欢** | Node 24 璧锋姤 `EINVAL`銆侱SH 妗ョ洿鎺ヨ皟 `DeepSeek Harness.exe` + `ELECTRON_RUN_AS_NODE=1`锛?*缁曞紑 shell 涔熷氨缁曞紑浜嗗懡浠ゆ敞鍏ラ潰** |
| **DSH 鐨?cwd 灏辨槸娌欑杈圭晫** | `sandbox-policy.workspaceRoot = process.cwd()`锛屾墍浠ユ妸 cwd 璁炬垚褰撳墠搴?= AI 鍙兘鏀硅繖涓簱 |
| **瀛愯繘绋?stdout 瑕佹樉寮?UTF-8** | 鍚﹀垯涓枃涔辩爜锛涘彟澶?NDJSON 閲屽彲鑳芥湁琚?ANSI 姹℃煋鐨勮锛岃В鏋愯瀹藉 |
| **PowerShell 鐢?GBK 璇?UTF-8 鏂囦欢** | 浼氭樉绀烘垚涔辩爜锛屼絾**鏂囦欢鏈韩鏄鐨?*銆傚垽鏂紪鐮佽鐢?Node 璇伙紝鍒俊 `Get-Content` |

---

## 渚濊禆璁稿彲绾㈢嚎

璋冪爺鍙戠幇涓€鎵?鐪嬭捣鏉ヨ兘鐢ㄣ€佸疄闄呬笉鑳界敤"鐨勫簱锛屽凡鍦?CI 闂ㄧ閲屾嫤浣忥細

- **AGPL-3.0**锛歅yMuPDF銆乣ezexam`锛圱ypst 璇曞嵎妯℃澘锛夈€丩ogseq / AppFlowy / Trilium / 鎬濇簮
- **闈炲晢涓?*锛歂ougat 妯″瀷鏉冮噸锛圕C-BY-NC-4.0锛?- **鏄庢枃绂佹鐢熶骇浣跨敤**锛歵ldraw
- **闈?OSI 寮€婧?*锛欰nytype

鏇夸唬鏂规瑙?[鏍艰嚧-寮€鍙戣鍒?md](鏍艰嚧-寮€鍙戣鍒?md) 鐨勯闄╃櫥璁板唽 R2b/R2c銆?
---

## 涓嬩竴姝?
P0 宸插畬鎴愩€侾1 = 鐭ヨ瘑搴撲笌缂栬緫鍣紙Electron 澹?+ 鏂囦欢鏍?+ 鏍囩椤?+ CodeMirror 6 + Live Preview锛夈€?
杩涘害涓庨獙鏀舵爣鍑嗚 [鏍艰嚧-寮€鍙戣鍒?md](鏍艰嚧-寮€鍙戣鍒?md) 搂5銆?