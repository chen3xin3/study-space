# Project Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the verified GitHub copy into `D:\Desktop\app` as the only maintained project, remove regenerable and obsolete content, preserve one recovery backup, and leave a tested maintenance workflow.

**Architecture:** Treat `D:\Desktop\app\开源` as the source of truth because it is clean, tested, and already linked to GitHub. Capture the legacy repository history and dirty working state outside the project, remove only an explicit allowlist of generated or obsolete paths, then promote the clean repository to the root. Add a dry-run-first cleanup script and maintenance documentation so future builds do not recreate the current clutter unnoticed.

**Tech Stack:** PowerShell 7/Windows file operations, Git, Node.js 22 built-in test runner, npm, React + TypeScript + Vite, Rust/Cargo, Tauri 2.

---

## File Map

- Create: `scripts/clean-workspace.mjs` — safe, root-bounded cleanup command with dry-run default.
- Create: `scripts/clean-workspace.test.mjs` — validates cleanup target resolution and dry-run/apply behavior in temporary directories.
- Modify: `package.json` — exposes `clean:check`, `clean:generated`, and the cleanup unit test.
- Create: `docs/maintainers/workspace-maintenance.md` — explains the single-root workflow, rebuilding, releasing, and GitHub updates.
- Modify: `README.md` — points contributors to the maintenance guide and states which outputs are intentionally untracked.
- Create: `release/README.md` — documents that only current local installers belong here and GitHub Releases owns history.
- Preserve externally: `D:\Desktop\学习空间-旧项目备份-20261016` — legacy Git bundle, working-tree patches, untracked manifest, and selected untracked files.
- Remove during migration: explicit generated/cache paths, obsolete release paths, and the nested `开源` layer after promotion.

### Task 1: Freeze State and Create Auditable Manifests

**Files:**
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\legacy-status.txt`
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\legacy-files.txt`
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\open-source-files.txt`
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\checksums.txt`

- [ ] **Step 1: Resolve and validate all roots**

Run from PowerShell:

```powershell
$legacyRoot = (Resolve-Path -LiteralPath 'D:\Desktop\app').Path
$cleanRoot = (Resolve-Path -LiteralPath 'D:\Desktop\app\开源').Path
$backupRoot = 'D:\Desktop\学习空间-旧项目备份-20261016'
if ($legacyRoot -ne 'D:\Desktop\app') { throw "Unexpected legacy root: $legacyRoot" }
if ($cleanRoot -ne 'D:\Desktop\app\开源') { throw "Unexpected clean root: $cleanRoot" }
if (-not $cleanRoot.StartsWith($legacyRoot + '\')) { throw 'Clean repository is not nested under the expected root' }
```

Expected: no output and no exception.

- [ ] **Step 2: Verify both repository states**

```powershell
git -C 'D:\Desktop\app' status --short
git -C 'D:\Desktop\app\开源' status --short
git -C 'D:\Desktop\app\开源' rev-parse HEAD
git -C 'D:\Desktop\app\开源' rev-parse origin/main
```

Expected: legacy repository reports its existing dirty state; clean repository has no status entries; the two clean-repository hashes match.

- [ ] **Step 3: Create the external backup directory and text manifests**

```powershell
New-Item -ItemType Directory -Path 'D:\Desktop\学习空间-旧项目备份-20261016' -ErrorAction Stop
git -C 'D:\Desktop\app' status --porcelain=v1 | Set-Content -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016\legacy-status.txt' -Encoding utf8
git -C 'D:\Desktop\app' ls-files | Set-Content -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016\legacy-files.txt' -Encoding utf8
git -C 'D:\Desktop\app\开源' ls-files | Set-Content -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016\open-source-files.txt' -Encoding utf8
```

Expected: four backup entries after the next task begins; no files are changed in either repository.

### Task 2: Build and Verify the Recovery Backup

**Files:**
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\legacy-history.bundle`
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\legacy-working-tree.patch`
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\legacy-index.patch`
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\untracked\...`
- Create: `D:\Desktop\学习空间-旧项目备份-20261016\untracked-files.txt`

- [ ] **Step 1: Save committed history and dirty patches**

```powershell
git -C 'D:\Desktop\app' bundle create 'D:\Desktop\学习空间-旧项目备份-20261016\legacy-history.bundle' --all
git -C 'D:\Desktop\app' diff --binary --output='D:\Desktop\学习空间-旧项目备份-20261016\legacy-working-tree.patch'
git -C 'D:\Desktop\app' diff --cached --binary --output='D:\Desktop\学习空间-旧项目备份-20261016\legacy-index.patch'
```

Expected: bundle and two patch files exist. Empty patches are acceptable; a missing bundle is not.

- [ ] **Step 2: Copy only meaningful untracked files**

Use a PowerShell loop that rejects absolute paths and excludes `开源`, build outputs, toolchains, logs, and caches:

```powershell
$legacyRoot = (Resolve-Path -LiteralPath 'D:\Desktop\app').Path
$backupUntracked = 'D:\Desktop\学习空间-旧项目备份-20261016\untracked'
New-Item -ItemType Directory -Path $backupUntracked -Force | Out-Null
$excludedPrefixes = @('开源/', 'node_modules/', 'dist/', 'src-tauri/target/', 'src-tauri/gen/', '.android-tools/', '.visual-qa/', 'release/', 'artifacts/')
$untracked = git -C $legacyRoot ls-files --others --exclude-standard
$kept = foreach ($relative in $untracked) {
  $normalized = $relative.Replace('\', '/')
  if ($normalized.StartsWith('/') -or $normalized.Contains('../')) { throw "Unsafe untracked path: $relative" }
  if ($excludedPrefixes.Where({ $normalized.StartsWith($_) }).Count -gt 0) { continue }
  $source = Join-Path $legacyRoot $relative
  $destination = Join-Path $backupUntracked $relative
  $resolvedParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $destination))
  if (-not $resolvedParent.StartsWith([System.IO.Path]::GetFullPath($backupUntracked))) { throw "Unsafe destination: $destination" }
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
  $relative
}
$kept | Set-Content -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016\untracked-files.txt' -Encoding utf8
```

Expected: no generated directory is copied.

- [ ] **Step 3: Verify the backup before any deletion**

```powershell
git bundle verify 'D:\Desktop\学习空间-旧项目备份-20261016\legacy-history.bundle'
Get-Item -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016\legacy-history.bundle'
Get-Content -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016\legacy-status.txt' -TotalCount 20
```

Expected: `git bundle verify` succeeds and reports complete history references.

- [ ] **Step 4: Record backup checksums**

```powershell
Get-ChildItem -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016' -File | ForEach-Object {
  "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)  $($_.Name)"
} | Set-Content -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016\checksums.txt' -Encoding ascii
```

Expected: `checksums.txt` lists the bundle, patches, and manifests.

### Task 3: Add a Safe Future Cleanup Command

**Files:**
- Create: `scripts/clean-workspace.test.mjs`
- Create: `scripts/clean-workspace.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing cleanup safety tests**

Create `scripts/clean-workspace.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cleanWorkspace, resolveCleanupTarget } from './clean-workspace.mjs';

test('resolveCleanupTarget keeps every target below the workspace root', () => {
  const root = path.resolve('C:/workspace/study-space');
  assert.equal(resolveCleanupTarget(root, 'dist'), path.join(root, 'dist'));
  assert.throws(() => resolveCleanupTarget(root, '..'), /outside workspace/i);
  assert.throws(() => resolveCleanupTarget(root, '.'), /workspace root/i);
});

test('dry run reports generated paths without deleting them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'study-space-clean-'));
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist', 'asset.js'), 'generated');
  const result = await cleanWorkspace({ root, apply: false, targets: ['dist'] });
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.found, ['dist']);
  await stat(path.join(root, 'dist', 'asset.js'));
});

test('apply removes only allowlisted generated paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'study-space-clean-'));
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist', 'asset.js'), 'generated');
  await writeFile(path.join(root, 'README.md'), 'keep');
  const result = await cleanWorkspace({ root, apply: true, targets: ['dist'] });
  assert.deepEqual(result.removed, ['dist']);
  await assert.rejects(stat(path.join(root, 'dist')), { code: 'ENOENT' });
  await stat(path.join(root, 'README.md'));
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```powershell
node --test scripts/clean-workspace.test.mjs
```

Expected: FAIL because `scripts/clean-workspace.mjs` does not exist.

- [ ] **Step 3: Implement the bounded cleanup command**

Create `scripts/clean-workspace.mjs`:

```js
import { lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENERATED_TARGETS = [
  'node_modules',
  'dist',
  'coverage',
  '.visual-qa',
  'src-tauri/target',
  'src-tauri/gen/android',
];

export function resolveCleanupTarget(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  const prefix = `${resolvedRoot}${path.sep}`;
  if (resolved === resolvedRoot) throw new Error('Refusing to remove workspace root');
  if (!resolved.startsWith(prefix)) throw new Error(`Cleanup target is outside workspace: ${relative}`);
  return resolved;
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function cleanWorkspace({ root, apply, targets = GENERATED_TARGETS }) {
  const found = [];
  const removed = [];
  for (const relative of targets) {
    const target = resolveCleanupTarget(root, relative);
    if (!(await exists(target))) continue;
    found.push(relative);
    if (apply) {
      await rm(target, { recursive: true, force: false });
      removed.push(relative);
    }
  }
  return { found, removed };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const apply = process.argv.includes('--apply');
  const root = process.cwd();
  const result = await cleanWorkspace({ root, apply });
  console.log(apply ? 'Removed generated paths:' : 'Dry run; generated paths found:');
  for (const item of apply ? result.removed : result.found) console.log(`- ${item}`);
  if (!apply) console.log('Run npm run clean:generated to remove these paths.');
}
```

- [ ] **Step 4: Expose and test npm commands**

Add these scripts to `package.json`:

```json
"clean:check": "node scripts/clean-workspace.mjs",
"clean:generated": "node scripts/clean-workspace.mjs --apply",
"test:clean": "node --test scripts/clean-workspace.test.mjs"
```

Run:

```powershell
npm run test:clean
npm run clean:check
```

Expected: three tests pass; dry run lists only allowlisted generated paths.

- [ ] **Step 5: Commit the maintenance command in the clean repository**

```powershell
git -C 'D:\Desktop\app\开源' add scripts/clean-workspace.mjs scripts/clean-workspace.test.mjs package.json
git -C 'D:\Desktop\app\开源' commit -m "chore: add safe workspace cleanup command"
```

### Task 4: Retain Only Current Release Files

**Files:**
- Preserve temporarily: three files under `D:\Desktop\app\release\current`
- Create: `release/README.md`
- Create after promotion: `release/current/学习空间_0.6.0_安装版.exe`
- Create after promotion: `release/current/学习空间_0.6.0_免安装版.exe`
- Create after promotion: `release/current/学习空间_0.6.0_平板版.apk`

- [ ] **Step 1: Record hashes for the three retained binaries**

```powershell
$keep = @(
  'D:\Desktop\app\release\current\windows\学习空间_0.6.0_安装版.exe',
  'D:\Desktop\app\release\current\windows\学习空间_0.6.0_免安装版.exe',
  'D:\Desktop\app\release\current\android\学习空间_0.6.0_平板版.apk'
)
$keep | ForEach-Object {
  if (-not (Test-Path -LiteralPath $_ -PathType Leaf)) { throw "Missing retained release: $_" }
  Get-FileHash -LiteralPath $_ -Algorithm SHA256
} | Format-Table -AutoSize
```

Expected: exactly three hashes.

- [ ] **Step 2: Copy retained binaries to a migration holding directory**

```powershell
$holding = 'D:\Desktop\学习空间-旧项目备份-20261016\current-release-holding'
New-Item -ItemType Directory -Path $holding -ErrorAction Stop
Copy-Item -LiteralPath $keep -Destination $holding
```

Expected: exactly three files in `current-release-holding`.

- [ ] **Step 3: Document release retention**

Create `release/README.md`:

````markdown
# 本地发布文件

`current/` 只保留当前可安装版本，便于本机快速安装和测试。历史版本发布到 GitHub Releases，不在源码目录长期堆积。

该目录中的二进制文件不纳入 Git；构建新版本后，用新的 Windows 安装版、Windows 免安装版和 Android 平板版替换旧文件。
````

- [ ] **Step 4: Adjust `.gitignore` to retain documentation but ignore binaries**

Use these release rules:

```gitignore
release/*
!release/README.md
```

- [ ] **Step 5: Commit release documentation**

```powershell
git -C 'D:\Desktop\app\开源' add .gitignore release/README.md
git -C 'D:\Desktop\app\开源' commit -m "docs: define current release retention policy"
```

### Task 5: Promote the Clean Repository to the Root

**Files:**
- Move: all content from `D:\Desktop\app\开源` to `D:\Desktop\app`
- Remove: old root content only after Tasks 1–4 succeed

- [ ] **Step 1: Revalidate the destructive target list**

The only removable legacy paths are:

```text
D:\Desktop\app\.android-tools
D:\Desktop\app\.git
D:\Desktop\app\.superpowers
D:\Desktop\app\.visual-qa
D:\Desktop\app\artifacts
D:\Desktop\app\dist
D:\Desktop\app\docs
D:\Desktop\app\node_modules
D:\Desktop\app\release
D:\Desktop\app\src
D:\Desktop\app\src-tauri
D:\Desktop\app\.gitignore
D:\Desktop\app\index.html
D:\Desktop\app\jdk-extract.log
D:\Desktop\app\package.json
D:\Desktop\app\package-lock.json
D:\Desktop\app\README.md
D:\Desktop\app\tsconfig.app.json
D:\Desktop\app\tsconfig.json
D:\Desktop\app\tsconfig.node.json
D:\Desktop\app\vite.config.ts
```

Resolve every path with `[System.IO.Path]::GetFullPath()` and stop unless its parent is exactly `D:\Desktop\app` or it is one of the named child directories. Do not include `D:\Desktop\app\开源`.

- [ ] **Step 2: Delete the explicit legacy allowlist using PowerShell only**

```powershell
$root = [System.IO.Path]::GetFullPath('D:\Desktop\app')
$names = @('.android-tools','.git','.superpowers','.visual-qa','artifacts','dist','docs','node_modules','release','src','src-tauri','.gitignore','index.html','jdk-extract.log','package.json','package-lock.json','README.md','tsconfig.app.json','tsconfig.json','tsconfig.node.json','vite.config.ts')
foreach ($name in $names) {
  $target = [System.IO.Path]::GetFullPath((Join-Path $root $name))
  if ((Split-Path -Parent $target) -ne $root) { throw "Unsafe legacy target: $target" }
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}
```

Expected: `D:\Desktop\app\开源` remains intact and the root contains only that migration source plus any explicitly unlisted user files.

- [ ] **Step 3: Move clean repository entries to the root**

```powershell
$source = (Resolve-Path -LiteralPath 'D:\Desktop\app\开源').Path
$destination = (Resolve-Path -LiteralPath 'D:\Desktop\app').Path
if ($source -ne 'D:\Desktop\app\开源' -or $destination -ne 'D:\Desktop\app') { throw 'Unexpected migration paths' }
Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
  Move-Item -LiteralPath $_.FullName -Destination $destination -Force
}
Remove-Item -LiteralPath $source
```

Expected: `D:\Desktop\app\.git` exists and `D:\Desktop\app\开源` no longer exists.

- [ ] **Step 4: Restore the three current installers**

```powershell
$releaseCurrent = 'D:\Desktop\app\release\current'
New-Item -ItemType Directory -Path $releaseCurrent -Force | Out-Null
Get-ChildItem -LiteralPath 'D:\Desktop\学习空间-旧项目备份-20261016\current-release-holding' -File | Copy-Item -Destination $releaseCurrent
```

Expected: exactly three binaries under `release/current`; Git continues to ignore them.

- [ ] **Step 5: Verify repository identity immediately**

```powershell
git -C 'D:\Desktop\app' remote -v
git -C 'D:\Desktop\app' branch --show-current
git -C 'D:\Desktop\app' status --short
```

Expected: remote is `https://github.com/chengxin23333-hue/study-space.git`, branch is `main`, and only expected maintenance-document changes appear.

### Task 6: Document the Single-Root Maintenance Workflow

**Files:**
- Create: `docs/maintainers/workspace-maintenance.md`
- Modify: `README.md`

- [ ] **Step 1: Write the maintenance guide**

The guide must include these exact sections and commands:

````markdown
# 工作区维护

## 唯一项目目录

只在 `D:\Desktop\app` 修改、测试和提交代码。不要再创建项目内的完整副本。

## 首次准备

```powershell
npm ci
```

## 日常验证

```powershell
npm run test:run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## 清理生成文件

先预览，再执行：

```powershell
npm run clean:check
npm run clean:generated
```

## 重新生成 Android 工程

```powershell
npm run tauri android init
```

## 上传 GitHub

```powershell
git add -A
git commit -m "说明本次修改"
git push
```

如果当前网络必须使用本机代理：

```powershell
git -c http.proxy=http://127.0.0.1:65532 -c https.proxy=http://127.0.0.1:65532 push
```
````

- [ ] **Step 2: Add a README maintenance link**

Add a concise “项目维护” section linking to `docs/maintainers/workspace-maintenance.md`, and state that generated directories and local release binaries are intentionally absent from Git.

- [ ] **Step 3: Verify documentation paths and commands**

```powershell
rg -n "D:\\Desktop\\app|clean:check|clean:generated|tauri android init|git push" README.md docs/maintainers/workspace-maintenance.md
```

Expected: all maintenance commands are discoverable; no reference tells users to work in `app\开源`.

- [ ] **Step 4: Commit maintenance documentation**

```powershell
git add README.md docs/maintainers/workspace-maintenance.md
git commit -m "docs: add single-root maintenance workflow"
```

### Task 7: Reinstall Dependencies and Run Full Verification

**Files:**
- Generated and ignored: `node_modules`, `dist`, `src-tauri/target`

- [ ] **Step 1: Install locked frontend dependencies**

```powershell
npm ci
```

Expected: install succeeds with no lockfile change.

- [ ] **Step 2: Run cleanup unit tests and full frontend tests**

```powershell
npm run test:clean
npm run test:run
```

Expected: cleanup tests pass; the existing frontend suite passes.

- [ ] **Step 3: Build production frontend**

```powershell
npm run build
```

Expected: Vite build succeeds; `dist` remains ignored.

- [ ] **Step 4: Run Rust tests and checks**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass; only documented existing warnings are acceptable.

- [ ] **Step 5: Validate the tutorial and repository hygiene**

```powershell
node --test scripts/tutorial/validate-tutorial.node-test.mjs
node scripts/tutorial/validate-tutorial.mjs
git diff --check
git status --short
git check-ignore node_modules dist src-tauri/target src-tauri/gen/android release/current/学习空间_0.6.0_平板版.apk
```

Expected: tutorial validator passes, whitespace check is clean, and every generated/binary path is ignored.

### Task 8: Final Size Audit, Commit, and GitHub Sync

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the finalization entry**

Document the single-root migration, safe cleanup command, retained releases, and external legacy backup in `CHANGELOG.md` without claiming that user data was migrated.

- [ ] **Step 2: Commit final documentation**

```powershell
git add CHANGELOG.md
git commit -m "chore: finalize project workspace"
```

- [ ] **Step 3: Remove verification build outputs again**

```powershell
npm run clean:check
npm run clean:generated
```

Expected: `node_modules`, `dist`, `coverage`, `.visual-qa`, `src-tauri/target`, and `src-tauri/gen/android` are absent. Source and release files remain.

- [ ] **Step 4: Measure the final workspace**

```powershell
$files = Get-ChildItem -LiteralPath 'D:\Desktop\app' -Force -Recurse -File -ErrorAction Stop
[pscustomobject]@{
  Files = ($files | Measure-Object).Count
  SizeMB = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
}
```

Expected: workspace no longer contains approximately 57GB of generated content; its remaining size is primarily source, Git history, and three current installers.

- [ ] **Step 5: Verify final Git and filesystem state**

```powershell
git status --short
git diff --check
git remote -v
git branch -vv
Test-Path -LiteralPath 'D:\Desktop\app\开源'
Get-ChildItem -LiteralPath 'D:\Desktop\app\release\current' -File
```

Expected: clean status; correct GitHub remote; `main` branch; nested copy returns `False`; exactly three installers exist.

- [ ] **Step 6: Push the finalized commits**

```powershell
git -c http.proxy=http://127.0.0.1:65532 -c https.proxy=http://127.0.0.1:65532 push origin main
```

Expected: GitHub `main` advances to the local final commit.

- [ ] **Step 7: Confirm remote equality**

```powershell
$local = git rev-parse HEAD
$remote = (git -c http.proxy=http://127.0.0.1:65532 -c https.proxy=http://127.0.0.1:65532 ls-remote origin refs/heads/main).Split("`t")[0]
if ($local -ne $remote) { throw "Remote mismatch: local=$local remote=$remote" }
```

Expected: no exception; local and remote hashes are identical.

---

## Safety Notes

- Never run `git reset --hard` or `git checkout --` during this migration.
- Never recursively delete `D:\Desktop\app` itself.
- Every recursive removal uses an explicit literal path verified against the allowlist.
- Do not delete `D:\Desktop\学习空间-旧项目备份-20261016` during this plan.
- The app's databases, attachments, photos, credentials, and settings are outside the repository and are not migration targets.
- If any preflight, backup verification, move, test, or build step fails, stop at that task and diagnose before continuing.
