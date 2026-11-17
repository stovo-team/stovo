import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, platform, arch } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const mode = process.argv[2];
if (!['prepare', 'restore'].includes(mode)) {
  throw new Error('Usage: node .github/workflows/frontend-dependencies.mjs <prepare|restore>');
}

const root = process.cwd();
const frontend = path.join(root, 'frontend');
const modules = path.join(frontend, 'node_modules');
const nodeVersion = process.version;
const npmResult = spawnSync('npm', ['--version'], { encoding: 'utf8', shell: platform() === 'win32' });
if (npmResult.status !== 0) throw new Error(`npm --version failed: ${npmResult.stderr}`);
const npmVersion = npmResult.stdout.trim();
const hash = createHash('sha256');
for (const file of ['frontend/package.json', 'frontend/package-lock.json', 'frontend/.npmrc', '.npmrc']) {
  try {
    hash.update(file).update('\0').update(await readFile(path.join(root, file)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const key = `v3-${platform()}-${arch()}-${nodeVersion}-${npmVersion}-${hash.digest('hex')}`;
const cacheBase = platform() === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'Stovo', 'ci-cache', 'frontend-dependencies')
  : path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'stovo', 'ci-cache', 'frontend-dependencies');
const cache = path.join(cacheBase, key);
const marker = path.join(cache, '.stovo-cache-key');

async function restore() {
  try {
    if ((await readFile(marker, 'utf8')).trim() !== key) return false;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  try {
    await readFile(path.join(cache, 'node_modules', '.package-lock.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  await rm(modules, { recursive: true, force: true });
  await cp(path.join(cache, 'node_modules'), modules, { recursive: true });
  console.log(`Restored frontend node_modules from the local runner cache (${key}).`);
  return true;
}

async function install() {
  console.log(`No local frontend dependency cache for ${key}; running npm ci.`);
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['ci'], { cwd: frontend, stdio: 'inherit', shell: platform() === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`npm ci exited with code ${code}`)));
  });
}

async function publish() {
  const staging = `${cache}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(cacheBase, { recursive: true });
  try {
    await mkdir(staging, { recursive: true });
    await cp(modules, path.join(staging, 'node_modules'), { recursive: true });
    await writeFile(path.join(staging, '.stovo-cache-key'), key);
    try {
      await rename(staging, cache);
      console.log(`Published frontend node_modules to the local runner cache (${key}).`);
    } catch (error) {
      // Another master run may have published this immutable key concurrently.
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
      console.log(`Local frontend dependency cache already exists (${key}).`);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (!(await restore())) {
  await install();
  if (mode === 'prepare' && process.env.FRONTEND_DEPENDENCY_CACHE_WRITE === 'true') {
    await publish();
  }
}
