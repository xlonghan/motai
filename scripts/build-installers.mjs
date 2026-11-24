import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = 'x86_64-pc-windows-msvc';
const environment = { ...process.env };
const buildCacheRoot = environment.RUST_BUILD_CACHE_ROOT || path.join(homedir(), '.cache/rust-build');
environment.CARGO_TARGET_DIR = path.resolve(root, environment.CARGO_TARGET_DIR || path.join(buildCacheRoot, 'markdown-desk'));
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const { productName, version } = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const output = path.join(root, 'output/installers');
const setup = path.join(environment.CARGO_TARGET_DIR, target, 'release/bundle/nsis', `${productName}_${version}_x64-setup.exe`);
const config = {
  mainBinaryName: productName,
  build: {
    beforeBuildCommand: 'npm run build -- --outDir .cache/windows-installer-web',
    frontendDist: '../.cache/windows-installer-web',
  },
  bundle: {
    active: true,
    targets: ['nsis'],
    windows: {
      webviewInstallMode: { type: 'embedBootstrapper', silent: true },
      nsis: { languages: ['SimpChinese', 'English'] },
    },
  },
};

function runTauri(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root, env: environment, stdio: 'inherit', windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (status, signal) => {
      if (status === 0) resolve();
      else reject(new Error(`Tauri ${args[0]} failed (${signal || status})`));
    });
  });
}

await runTauri(['build', '--no-bundle', '--target', target, '--features', 'installed', '--config', JSON.stringify(config), '--', '--locked']);
await mkdir(output, { recursive: true });
const staging = await mkdtemp(path.join(output, '.build-'));
const modes = [
  { installMode: 'currentUser', filename: `${productName}-${version}-x64-用户级安装.exe` },
  { installMode: 'perMachine', filename: `${productName}-${version}-x64-系统级安装.exe` },
];
try {
  for (const { installMode, filename } of modes) {
    config.bundle.windows.nsis.installMode = installMode;
    await runTauri(['bundle', '--bundles', 'nsis', '--target', target, '--features', 'installed', '--no-binary-patching', '--config', JSON.stringify(config)]);
    await copyFile(setup, path.join(staging, filename));
  }
  for (const { filename } of modes) {
    const destination = path.join(output, filename);
    await rename(path.join(staging, filename), destination);
    console.log(destination);
  }
} finally {
  for (const { filename } of modes) await rm(path.join(staging, filename), { force: true });
  await rmdir(staging);
}
