import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { cleanWorkspace, resolveCleanupTarget } from "./clean-workspace.mjs";

test("resolveCleanupTarget keeps every target below the workspace root", () => {
  const root = path.resolve("C:/workspace/study-space");

  assert.equal(resolveCleanupTarget(root, "dist"), path.join(root, "dist"));
  assert.throws(() => resolveCleanupTarget(root, ".."), /outside workspace/i);
  assert.throws(() => resolveCleanupTarget(root, "."), /workspace root/i);
});

test("dry run reports generated paths without deleting them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "study-space-clean-"));
  await mkdir(path.join(root, "dist"));
  await writeFile(path.join(root, "dist", "asset.js"), "generated");

  const result = await cleanWorkspace({ root, apply: false, targets: ["dist"] });

  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.found, ["dist"]);
  await stat(path.join(root, "dist", "asset.js"));
});

test("apply removes only allowlisted generated paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "study-space-clean-"));
  await mkdir(path.join(root, "dist"));
  await writeFile(path.join(root, "dist", "asset.js"), "generated");
  await writeFile(path.join(root, "README.md"), "keep");

  const result = await cleanWorkspace({ root, apply: true, targets: ["dist"] });

  assert.deepEqual(result.removed, ["dist"]);
  await assert.rejects(stat(path.join(root, "dist")), { code: "ENOENT" });
  await stat(path.join(root, "README.md"));
});

test("cleanup rejects paths outside the generated target allowlist", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "study-space-clean-"));
  await writeFile(path.join(root, "README.md"), "keep");

  await assert.rejects(
    cleanWorkspace({ root, apply: true, targets: ["README.md"] }),
    /not an allowed generated target/i,
  );

  await stat(path.join(root, "README.md"));
});
