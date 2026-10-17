import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATED_TARGETS = [
  "node_modules",
  "dist",
  "coverage",
  ".visual-qa",
  "src-tauri/target",
  "src-tauri/gen/android",
];

const generatedTargetSet = new Set(GENERATED_TARGETS);

export function resolveCleanupTarget(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  const prefix = `${resolvedRoot}${path.sep}`;

  if (resolved === resolvedRoot) {
    throw new Error("Refusing to remove workspace root");
  }
  if (!resolved.startsWith(prefix)) {
    throw new Error(`Cleanup target is outside workspace: ${relative}`);
  }

  return resolved;
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function cleanWorkspace({
  root,
  apply,
  targets = GENERATED_TARGETS,
}) {
  const found = [];
  const removed = [];

  for (const relative of targets) {
    if (!generatedTargetSet.has(relative)) {
      throw new Error(`Not an allowed generated target: ${relative}`);
    }

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

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const apply = process.argv.includes("--apply");
  const result = await cleanWorkspace({ root: process.cwd(), apply });

  console.log(
    apply ? "Removed generated paths:" : "Dry run; generated paths found:",
  );
  for (const item of apply ? result.removed : result.found) {
    console.log(`- ${item}`);
  }
  if (!apply) {
    console.log("Run npm run clean:generated to remove these paths.");
  }
}
