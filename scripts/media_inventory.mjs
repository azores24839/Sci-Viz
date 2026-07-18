#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const shouldVerify = process.argv.includes("--verify");
const allowAdded = process.argv.includes("--allow-added");
const shouldHash = process.argv.includes("--hash") || shouldVerify;
const outputPath = path.join(
  projectRoot,
  "local-audits",
  shouldHash ? "media-assets-inventory.sha256.json" : "media-assets-inventory.json",
);

const protectedRoots = [
  "journal_covers",
  "nasa_svs_output",
  "nature_covers",
  "sjtu_platform_media",
  "sci-viz-case-hub/server/uploads/originals",
  "sci-viz-case-hub/server/uploads/thumbnails",
];

const imageAndVideoExtensions = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".m4v",
  ".mov",
  ".mp4",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".webm",
  ".webp",
]);

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function walk(relativeRoot) {
  const absoluteRoot = path.join(projectRoot, relativeRoot);
  if (!existsSync(absoluteRoot)) {
    return {
      root: relativeRoot,
      exists: false,
      fileCount: 0,
      mediaFileCount: 0,
      totalBytes: 0,
      files: [],
    };
  }

  const files = [];
  const pending = [absoluteRoot];

  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const fileStat = await stat(absolutePath);
      const relativePath = path.relative(projectRoot, absolutePath);
      const extension = path.extname(entry.name).toLowerCase();
      const record = {
        path: relativePath,
        bytes: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
        media: imageAndVideoExtensions.has(extension),
      };

      if (shouldHash) {
        record.sha256 = await sha256(absolutePath);
        const afterHashStat = await stat(absolutePath);
        record.changedDuringScan =
          afterHashStat.size !== fileStat.size ||
          afterHashStat.mtimeMs !== fileStat.mtimeMs;
      }
      files.push(record);
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    root: relativeRoot,
    exists: true,
    fileCount: files.length,
    mediaFileCount: files.filter((file) => file.media).length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
}

const roots = [];
for (const protectedRoot of protectedRoots) {
  roots.push(await walk(protectedRoot));
}

const inventory = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: shouldHash ? "sha256" : "metadata",
  warning:
    "This inventory is not a backup. It records protected media without deleting or modifying source files.",
  protectedRoots,
  totals: {
    fileCount: roots.reduce((sum, root) => sum + root.fileCount, 0),
    mediaFileCount: roots.reduce((sum, root) => sum + root.mediaFileCount, 0),
    totalBytes: roots.reduce((sum, root) => sum + root.totalBytes, 0),
  },
  roots,
};

if (shouldVerify) {
  if (!existsSync(outputPath)) {
    console.error(
      `Verification baseline is missing: ${path.relative(projectRoot, outputPath)}`,
    );
    console.error("Create it once with: node scripts/media_inventory.mjs --hash");
    process.exitCode = 2;
  } else {
    const baseline = JSON.parse(await import("node:fs/promises").then(({ readFile }) =>
      readFile(outputPath, "utf8"),
    ));
    const baselineFiles = new Map(
      baseline.roots.flatMap((root) => root.files).map((file) => [file.path, file]),
    );
    const currentFiles = new Map(
      inventory.roots.flatMap((root) => root.files).map((file) => [file.path, file]),
    );

    const missing = [...baselineFiles.keys()].filter(
      (filePath) => !currentFiles.has(filePath),
    );
    const added = [...currentFiles.keys()].filter(
      (filePath) => !baselineFiles.has(filePath),
    );
    const changed = [...baselineFiles.entries()]
      .filter(([filePath]) => currentFiles.has(filePath))
      .filter(([filePath, baselineFile]) => {
        const currentFile = currentFiles.get(filePath);
        return (
          baselineFile.bytes !== currentFile.bytes ||
          baselineFile.sha256 !== currentFile.sha256
        );
      })
      .map(([filePath]) => filePath);

    const printPaths = (label, paths) => {
      if (paths.length === 0) {
        return;
      }
      console.error(`${label} (${paths.length})`);
      for (const filePath of paths.slice(0, 20)) {
        console.error(`  - ${filePath}`);
      }
      if (paths.length > 20) {
        console.error(`  ... ${paths.length - 20} more`);
      }
    };

    if (
      missing.length > 0 ||
      (!allowAdded && added.length > 0) ||
      changed.length > 0
    ) {
      console.error("Protected media verification failed.");
      printPaths("Missing files", missing);
      printPaths("Added files", added);
      printPaths("Changed files", changed);
      process.exitCode = 3;
    } else {
      console.log(
        JSON.stringify(
          {
            baseline: path.relative(projectRoot, outputPath),
            verifiedFiles: currentFiles.size,
            verifiedBytes: inventory.totals.totalBytes,
            addedFiles: added.length,
            result: "PASS",
          },
          null,
          2,
        ),
      );
    }
  }
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        output: path.relative(projectRoot, outputPath),
        mode: inventory.mode,
        ...inventory.totals,
      },
      null,
      2,
    ),
  );
}

if (
  shouldHash &&
  roots.some((root) => root.files.some((file) => file.changedDuringScan))
) {
  console.error(
    "One or more files changed during hashing. The inventory was retained for diagnosis, but must not be treated as a verified backup manifest.",
  );
  process.exitCode = 2;
}
