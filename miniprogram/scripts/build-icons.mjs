// 由 icons.js 生成 icons.wxss（mask 定义），新增图标后执行：node scripts/build-icons.mjs
import { createRequire } from 'node:module'
import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const iconDir = resolve(here, '../components/ms-icon')

const { URI, NAMES } = require(resolve(iconDir, 'icons.js'))

const blocks = NAMES.map((name) => {
  const uri = URI[name]
  return `.ms-icon--${name} {\n  -webkit-mask-image: url("${uri}");\n  mask-image: url("${uri}");\n}`
})

const css = `/* 图标 mask 定义（由 icons.js 生成，勿手改） */\n${blocks.join('\n')}\n`
writeFileSync(resolve(iconDir, 'icons.wxss'), css, 'utf8')
console.log(`icons.wxss 已生成：${NAMES.length} 个图标`)
