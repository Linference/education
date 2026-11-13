# 凭据与安全

> 这份文档回答一个问题：**格致里那些 API 密钥，存在哪、谁能读、怎么轮换。**
> 背景：本项目已经踩过两次密钥泄露 ——
> ① `~/.config/opencode/opencode.json` 里明文躺着 DeepSeek 与智谱的 key，那份还被复制进了比赛项目的 `docs/opencode-config-sample.json`；
> ② 腾讯云的 SecretId/SecretKey 直接贴进了聊天记录（而 DSH 的会话是持久化到 `~/.dsh/sessions` 的，等于明文落盘）。

---

## 一、密钥分三类，存放位置不同

| 类别 | 例子 | 存放位置 | 是否进库 / 进 git |
| --- | --- | --- | --- |
| **模型与云服务密钥** | DeepSeek API key、腾讯云 SecretId/SecretKey、智谱 key | `%APPDATA%\gezhi\credentials.enc`（**库之外**） | ❌ 绝不 |
| **DSH 自身的登录凭据** | DSH 账号 | `~/.dsh/`（由 DSH 管理） | ❌ 绝不 |
| **库内数据** | 笔记、教材、题库 | 库目录 | ✅ 只进库，不进 git |

**为什么密钥不放在库目录里**：库可能落在 OneDrive 等同步目录下（本机 `文档` 就在 D 盘，且 OneDrive 已启用），密钥一旦同步到云端就等于交给了第三方。

---

## 二、`%APPDATA%\gezhi\credentials.enc` 的两种保护模式

实现在 [`packages/core/src/credentials.mjs`](../packages/core/src/credentials.mjs)。

### 模式 ① `passphrase`（默认，推荐）

- scrypt 从主密码派生密钥（`N=2^15, r=8, p=1`），AES-256-GCM 加密
- **主密码不落盘** —— 每次解锁都要输
- 攻击者拿到文件也没用（除非能暴力破解主密码）
- 代价：每次启动要输一次密码

### 模式 ② `dpapi`（便利）

- Windows DPAPI `CurrentUser` 加密，绑定当前 Windows 账户
- 开机即用，不用输密码
- **能防的是「文件被拷走」**（换台机器或换个账户都解不开）
- **防不了「同一 Windows 账户下的其他进程」** —— 它们都能解

> **为什么默认是 ①**：纯 Node 拿不到 DPAPI，必须走 PowerShell + .NET。而那条路要么把明文放进命令行参数（同机进程可能从进程列表窥探），要么放环境变量（子进程可读）。既然"便利模式"本质上只能在"同账户进程"这个层面上防护，那它的安全边际有限；主密码模式是真正把攻击者挡在外面的那种。

**切换方式**：`saveSecrets(secrets, { passphrase })` 传主密码即用模式 ①，不传即用模式 ②。

---

## 三、文件权限：不重复 DSH 的错误

**实测发现**：`~/.dsh/.credentials.yaml` 的 ACL 允许 `LINFERENCE\CodexSandboxUsers` 组读取 —— 也就是说**沙箱里的进程能读到里面所有 provider 的 key**。这是 DSH 自身的行为（不是配置错误），但格致不重复它。

`hardenAcl()` 会：
1. 断开 ACL 继承（`SetAccessRuleProtection($true, $false)`）
2. 清空已有规则
3. 只留当前用户 `FullControl`

非 Windows 平台退化为 `chmod 600`。

---

## 四、三道防线（都已实测有效）

| 防线 | 实现 | 实测证据 |
| --- | --- | --- |
| **提交前拦截** | `.githooks/pre-commit` 扫描**暂存区内容**（用 `git show :file` 取暂存版本，不是工作区版本） | 塞入假密钥 → 提交退出码 1，`git log` 确认未产生提交 |
| **全仓扫描** | `node scripts/scan-secrets.mjs`（7 条规则：腾讯云 / DeepSeek / 智谱 / GitHub / AWS / 私钥块 / 通用赋值） | 全仓 63 个文件扫描通过 |
| **扫描器自测** | `node scripts/scan-secrets.test.mjs`（13 条用例：9 类必须拦、4 类必须放行） | 13/13 通过 |

**为什么钩子放在 `.githooks/` 而不是 `.git/hooks/`**：`.git/` 不纳入版本控制 —— 钩子放那儿 clone 到别的机器就没了，等于"只有我这台机器安全"。用 `git config core.hooksPath .githooks` 才能真正共享。

> 新机器上要执行一次：`git config core.hooksPath .githooks`

---

## 五、密钥泄露了怎么办（操作清单）

1. **立刻吊销**，不要先调查 —— 调查可以之后做，密钥暴露的每分钟都在产生风险
2. 到对应控制台**新建一对**
3. **不要再贴给任何人/AI** —— 存进 `%APPDATA%\gezhi\credentials.enc`
4. 如果是腾讯云：**用子用户而不是主账号**，只授予必要权限（如 `QcloudASRFullAccess` + `QcloudTTSFullAccess`）。这样即便泄露，损失上限就是那两项服务的调用量
5. 检查是否已落进 git：`git log --all -S "<密钥前缀>" --oneline`
6. 如果已经提交过：**轮换是唯一真正的解法**。改历史（`filter-repo`）只能清理痕迹，不能挽回已泄露的事实

---

## 六、腾讯云语音的接入方式（待办）

密钥轮换后，接入按此进行：

- 用**子用户**密钥，权限只给 `QcloudASRFullAccess`（语音识别）+ `QcloudTTSFullAccess`（语音合成）
- 密钥存 `%APPDATA%\gezhi\credentials.enc`（主密码模式）
- **签名必须在本机主进程完成，绝不下发到渲染进程**：TC3-HMAC-SHA256 签名需要 SecretKey，一旦进前端就等于把密钥交给了任何能开 DevTools 的人
- 官方 Python SDK（`tencentcloud-sdk-python`）当前未安装；Node 侧可用 `tencentcloud-sdk-nodejs`，或按官方文档自行实现 TC3 签名（算法不复杂，但要写测试）

> 状态：**这两个 API 尚未做任何连通性验证**。密钥在聊天里出现过，我不会用它去调用任何接口；等你轮换并用安全存储配好之后再验。

---

## 七、`git config` 检查表（新机器）

```bash
git config core.hooksPath .githooks     # 启用提交前检查（必须）
git config user.name  "你的名字"         # 提交署名（本项目不替任何人决定身份）
git config user.email "你的邮箱"
```
