#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const warnings = [];
const errors = [];

const protectedPaths = [
  "journal_covers",
  "nasa_svs_output",
  "nature_covers",
  "sjtu_platform_media",
  "sci-viz-case-hub/server/uploads/originals",
  "sci-viz-case-hub/server/uploads/thumbnails",
  "sci-viz-case-hub/server/prisma",
  "sci-viz-case-hub/server/backups",
];

const sourceRoots = [
  "sci-viz-case-hub/server/src",
  "sci-viz-case-hub/web/src",
];

function relativePath(absolutePath) {
  return path.relative(projectRoot, absolutePath);
}

function walkFiles(relativeRoot) {
  const absoluteRoot = path.join(projectRoot, relativeRoot);
  if (!existsSync(absoluteRoot)) {
    return [];
  }

  const files = [];
  const pending = [absoluteRoot];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }
  return files;
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

for (const protectedPath of protectedPaths) {
  const absolutePath = path.join(projectRoot, protectedPath);
  if (!existsSync(absolutePath)) {
    errors.push(`Protected path is missing: ${protectedPath}`);
    continue;
  }
  if (!lstatSync(absolutePath).isDirectory()) {
    errors.push(`Protected path is not a directory: ${protectedPath}`);
  }
}

const trackedFiles = gitOutput(["ls-files", "-z"])
  .split("\0")
  .filter(Boolean);

const forbiddenTrackedRuntime = trackedFiles.filter((file) => {
  if (
    file === "sci-viz-case-hub/server/uploads/originals/.gitkeep" ||
    file === "sci-viz-case-hub/server/uploads/thumbnails/.gitkeep"
  ) {
    return false;
  }

  return (
    file.includes("/node_modules/") ||
    file.includes("/.playwright-cli/") ||
    file.includes("/dist/") ||
    file.includes("/server/backups/") ||
    file.includes("/server/uploads/originals/") ||
    file.includes("/server/uploads/thumbnails/") ||
    file.endsWith(".db") ||
    file.endsWith(".db-shm") ||
    file.endsWith(".db-wal") ||
    file.endsWith(".tsbuildinfo")
  );
});

if (forbiddenTrackedRuntime.length > 0) {
  errors.push(
    `Generated/runtime files are tracked:\n${forbiddenTrackedRuntime
      .map((file) => `  - ${file}`)
      .join("\n")}`,
  );
}

const sourceFiles = sourceRoots.flatMap(walkFiles).filter((file) =>
  [".css", ".ts", ".tsx"].includes(path.extname(file)),
);

const largeSourceFiles = sourceFiles
  .map((file) => ({
    file: relativePath(file),
    lines: readFileSync(file, "utf8").split(/\r?\n/).length,
  }))
  .filter((entry) => entry.lines > 1000)
  .sort((left, right) => right.lines - left.lines);

if (largeSourceFiles.length > 0) {
  warnings.push(
    `Source files over 1,000 lines:\n${largeSourceFiles
      .map((entry) => `  - ${entry.file}: ${entry.lines}`)
      .join("\n")}`,
  );
}

const largeTrackedFiles = trackedFiles
  .map((file) => {
    const absolutePath = path.join(projectRoot, file);
    if (!existsSync(absolutePath)) {
      return null;
    }
    const fileStat = lstatSync(absolutePath);
    if (!fileStat.isFile() || fileStat.size < 10 * 1024 * 1024) {
      return null;
    }
    return { file, bytes: fileStat.size };
  })
  .filter(Boolean)
  .sort((left, right) => right.bytes - left.bytes);

if (largeTrackedFiles.length > 0) {
  warnings.push(
    `Tracked files over 10 MiB:\n${largeTrackedFiles
      .map(
        (entry) =>
          `  - ${entry.file}: ${(entry.bytes / 1024 / 1024).toFixed(1)} MiB`,
      )
      .join("\n")}`,
  );
}

const worktreeLines = gitOutput(["status", "--short"])
  .split(/\r?\n/)
  .filter(Boolean);
if (worktreeLines.length > 0) {
  warnings.push(
    `Working tree has ${worktreeLines.length} changed or untracked entries. This check does not modify them.`,
  );
}

console.log("Project health check");
console.log(`Protected directories: ${protectedPaths.length}`);
console.log(`Tracked files: ${trackedFiles.length}`);
console.log(`Source files inspected: ${sourceFiles.length}`);

if (warnings.length > 0) {
  console.log("\nWarnings");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error("\nErrors");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("\nResult: PASS (read-only checks; no files were changed)");
}
