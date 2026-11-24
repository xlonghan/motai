import { spawn } from 'node:child_process';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream,constants } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = 'x86_64-pc-windows-msvc';
const environment = { ...process.env };
const buildCacheRoot = environment.RUST_BUILD_CACHE_ROOT || path.join(homedir(), '.cache/rust-build');
environment.CARGO_TARGET_DIR ||= path.join(buildCacheRoot, 'markdown-desk');
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const child = spawn(process.execPath, [cli, 'build', '--no-bundle', '--target', target], { cwd: root, env: environment, stdio: 'inherit', windowsHide: true });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
const status = await new Promise((resolve) => child.on('close', resolve));
if (status !== 0) process.exit(status || 1);
const executableName = process.env.MARKDOWN_DESK_EXE_NAME || '墨台.exe';
if (path.basename(executableName) !== executableName || !executableName.endsWith('.exe')) throw new Error('Invalid executable filename');
const executable = path.join(root, 'output/desktop', executableName);
await mkdir(path.dirname(executable), { recursive: true });
// The EXE can also recreate these files at first launch. Keep an immediately
// editable copy beside the local build; never replace an existing user's file.
for(const relative of ['开始使用.md','Mermaid 示例集.md','Mermaid 常用图表示例.md','demo.md','2026-Architecture-Blueprint.md','assets/demo-illustration.svg']){
  const destination=path.join(path.dirname(executable),'builtin',relative);
  await mkdir(path.dirname(destination),{recursive:true});
  try{await copyFile(path.join(root,'builtin',relative),destination,constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
}
try {
  await copyFile(path.join(environment.CARGO_TARGET_DIR, target, 'release/markdown-desk.exe'), executable);
} catch (error) {
  if (error.code === 'EBUSY' || error.code === 'EPERM') console.error('请先关闭正在运行的墨台，然后重新执行构建以更新 EXE。');
  throw error;
}
const hash = createHash('sha256');
for await (const chunk of createReadStream(executable)) hash.update(chunk);
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await writeFile(path.join(root, 'output/desktop/build-info.json'), JSON.stringify({ version,executable, target, sha256: hash.digest('hex'), installer: false,builtAt:new Date().toISOString() }, null, 2));
console.log(`\nSingle executable: ${executable}\n`);
