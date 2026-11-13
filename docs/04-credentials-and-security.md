# Credentials and Security

> This document answers one question: **where do the API keys in Gezhi live, who can read them, and how are they rotated?**
> Background: this project has already suffered two key leaks —
> ① The DeepSeek and Zhipu keys sit in plaintext in `~/.config/opencode/opencode.json`, and that file was also copied into the competition project's `docs/opencode-config-sample.json`;
> ② Tencent Cloud's SecretId/SecretKey were pasted directly into the chat log (and DSH sessions are persisted to `~/.dsh/sessions`, which amounts to plaintext on disk).

---

## 1. Three Types of Keys, Stored in Different Places

| Category | Examples | Storage location | Goes into vault / git |
| --- | --- | --- | --- |
| **Model and cloud-service keys** | DeepSeek API key, Tencent Cloud SecretId/SecretKey, Zhipu key | `%APPDATA%\gezhi\credentials.enc` (**outside the vault**) | ❌ Never |
| **DSH's own login credentials** | DSH account | `~/.dsh/` (managed by DSH) | ❌ Never |
| **Data inside the vault** | Notes, textbooks, question bank | Vault directory | ✅ Vault only, not git |

**Why keys are not placed in the vault directory**: the vault may live under a sync directory such as OneDrive (on this machine `Documents` is on D: and OneDrive is enabled); once a key syncs to the cloud, it has effectively been handed to a third party.

---

## 2. Two Protection Modes for `%APPDATA%\gezhi\credentials.enc`

Implemented in [`packages/core/src/credentials.mjs`](../packages/core/src/credentials.mjs).

### Mode ① `passphrase` (default, recommended)

- scrypt derives the key from the master password (`N=2^15, r=8, p=1`), AES-256-GCM encryption
- **The master password is never written to disk** — it must be entered on every unlock
- An attacker who obtains the file cannot use it (unless they can brute-force the master password)
- Cost: a password must be entered on every startup

### Mode ② `dpapi` (convenient)

- Windows DPAPI `CurrentUser` encryption, bound to the current Windows account
- Usable immediately on boot, no password needed
- **What it protects against is "the file being copied away"** (it cannot be decrypted on another machine or under another account)
- **It cannot protect against "other processes under the same Windows account"** — they can all decrypt it

> **Why the default is ①**: pure Node cannot access DPAPI; PowerShell + .NET is required. That route either puts the plaintext into command-line arguments (same-machine processes may snoop it from the process list) or into environment variables (readable by child processes). Since "convenience mode" can essentially only protect at the level of "same-account processes", its security margin is limited; master-password mode is the kind that truly shuts attackers out.

**How to switch**: `saveSecrets(secrets, { passphrase })` uses mode ① when a master password is passed, and mode ② when it is not.

---

## 3. File Permissions: Do Not Repeat DSH's Mistake

**Measured finding**: the ACL of `~/.dsh/.credentials.yaml` allows the `LINFERENCE\CodexSandboxUsers` group to read it — in other words, **processes inside the sandbox can read the keys of all providers in it**. This is DSH's own behavior (not a configuration error), but Gezhi does not repeat it.

`hardenAcl()` will:
1. Break ACL inheritance (`SetAccessRuleProtection($true, $false)`)
2. Clear existing rules
3. Keep only `FullControl` for the current user

On non-Windows platforms it degrades to `chmod 600`.

---

## 4. Three Lines of Defense (All Measured Effective)

| Defense | Implementation | Measured evidence |
| --- | --- | --- |
| **Pre-commit interception** | `.githooks/pre-commit` scans the **staged content** (using `git show :file` to get the staged version, not the working-tree version) | Inserted a fake key → commit exit code 1; `git log` confirmed no commit was created |
| **Whole-repo scan** | `node scripts/scan-secrets.mjs` (7 rules: Tencent Cloud / DeepSeek / Zhipu / GitHub / AWS / private-key blocks / generic assignments) | All 63 files in the repo passed the scan |
| **Scanner self-test** | `node scripts/scan-secrets.test.mjs` (13 cases: 9 categories must be blocked, 4 categories must be allowed) | 13/13 passed |

**Why the hook is in `.githooks/` rather than `.git/hooks/`**: `.git/` is not version-controlled — a hook placed there disappears when the repo is cloned to another machine, which amounts to "only my machine is safe". Only `git config core.hooksPath .githooks` truly shares it.

> On a new machine, run once: `git config core.hooksPath .githooks`

---

## 5. What to Do If a Key Leaks (Operations Checklist)

1. **Revoke immediately**; do not investigate first — investigation can come later, and every minute a key is exposed creates risk
2. Go to the corresponding console and **create a new pair**
3. **Do not paste it to anyone/AI again** — store it in `%APPDATA%\gezhi\credentials.enc`
4. Tencent Cloud: **use a sub-user rather than the main account**, granting only the necessary permissions (e.g., `QcloudASRFullAccess` + `QcloudTTSFullAccess`). This way, even if leaked, the worst-case loss is the call volume of those two services
5. Check whether it has already entered git: `git log --all -S "<key prefix>" --oneline`
6. If it has already been committed: **rotation is the only real solution**. Rewriting history (`filter-repo`) can only clean up traces, not undo the fact that it leaked

---

## 6. How Tencent Cloud Voice Will Be Integrated (To-Do)

After rotating the keys, integrate as follows:

- Use **sub-user** keys, granting only `QcloudASRFullAccess` (speech recognition) + `QcloudTTSFullAccess` (speech synthesis)
- Store the keys in `%APPDATA%\gezhi\credentials.enc` (master-password mode)
- **Signing must be completed in the local main process and must never be sent to the renderer process**: TC3-HMAC-SHA256 signing requires the SecretKey; once it reaches the frontend, it is equivalent to handing the key to anyone who can open DevTools
- The official Python SDK (`tencentcloud-sdk-python`) is not currently installed; on the Node side, `tencentcloud-sdk-nodejs` can be used, or the TC3 signature can be implemented directly per the official documentation (the algorithm is not complex, but tests must be written)

> Status: **no connectivity verification has been done for these two APIs yet**. The keys appeared in chat; I will not use them to call any interface. Wait until you have rotated them and configured secure storage before verifying.

---

## 7. `git config` Checklist (New Machine)

```bash
git config core.hooksPath .githooks     # enable pre-commit checks (required)
git config user.name  "your name"        # commit signature (this project does not decide identity for anyone)
git config user.email "your email"
```
