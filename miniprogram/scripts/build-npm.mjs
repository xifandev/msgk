/**
 * 构建小程序 npm：把 node_modules 里的依赖同步到 miniprogram_npm。
 * 等价于微信开发者工具的「工具 - 构建 npm」，用于 CI 或无 IDE 环境。
 * 依赖包在 package.json 中用 "miniprogram" 字段指定入口目录（@vant/weapp -> lib）。
 */
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'miniprogram_npm');

async function stripTypes(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await stripTypes(full);
    } else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.tsbuildinfo')) {
      await rm(full);
    }
  }
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies ?? {});

await mkdir(outRoot, { recursive: true });

for (const name of deps) {
  const pkgDir = path.join(root, 'node_modules', name);
  if (!existsSync(pkgDir)) {
    console.error(`[skip] ${name} 未安装，请先执行 npm install`);
    continue;
  }
  const manifest = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
  const entry = manifest.miniprogram ?? 'miniprogram_dist';
  const src = path.join(pkgDir, entry);
  if (!existsSync(src) || !(await stat(src)).isDirectory()) {
    console.error(`[skip] ${name} 找不到入口目录 ${entry}`);
    continue;
  }
  const dest = path.join(outRoot, name);
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });
  await stripTypes(dest);
  console.log(`[ok] ${name} -> miniprogram_npm/${name}`);
}
