/* global process */

import { readdir, mkdir, copyFile, access } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getConfigHome() {
  if (process.env.XDG_CONFIG_HOME) return process.env.XDG_CONFIG_HOME;

  if (process.platform === 'win32') {
    if (process.env.APPDATA) return process.env.APPDATA;
    return join(os.homedir(), 'AppData', 'Roaming');
  }

  return join(os.homedir(), '.config');
}

async function copyDirIfMissing(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const dstPath = join(dstDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirIfMissing(srcPath, dstPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (await pathExists(dstPath)) {
      continue;
    }

    await mkdir(dirname(dstPath), { recursive: true });
    await copyFile(srcPath, dstPath);
  }
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const srcAssetsDir = join(scriptDir, '..', '@asset');
  const configHome = getConfigHome();
  const userOcdxDir = join(configHome, 'opencode', 'ocdx');

  // Ensure stable directories exist even if @asset has no files for them.
  await mkdir(join(userOcdxDir, 'prompt'), { recursive: true });

  if (!(await pathExists(srcAssetsDir))) {
    return;
  }

  await copyDirIfMissing(srcAssetsDir, userOcdxDir);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`[ocdx] postinstall: skipped (${message})\n`);
});
