import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

/** 插件根目录 */
export const pluginRoot = path.resolve(currentDir, '..')

/** 云崽根目录 */
export const botRoot = global.Yunzai?.filePath || process.cwd()

/** 插件数据目录，与原版保持一致：data/MingChaoBQ */
export const dataRoot = path.join(botRoot, 'data', 'MingChaoBQ')
export const cacheDir = path.join(dataRoot, 'cache')
export const indexPath = path.join(dataRoot, 'index.json')
export const builtinMarker = path.join(dataRoot, '.builtin_pack.json')
export const statisticsPath = path.join(dataRoot, 'statistics.json')
export const dataIconsDir = path.join(dataRoot, 'icons')

export const configPath = path.join(pluginRoot, 'config', 'config.yaml')
export const resourcesDir = path.join(pluginRoot, 'resources')
export const iconsDir = path.join(resourcesDir, 'icons')
export const pluginIcon = path.join(resourcesDir, 'ICON.png')

export const SUPPORTED_EXTS = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp'])

/** 上游鸣潮插件（XutheringWavesUID）的角色别名表，存在就读取 */
export const upstreamAliasPath = path.join(botRoot, 'data', 'XutheringWavesUID', 'alias', 'char_alias.json')

export function ensureDirs() {
  for (const dir of [dataRoot, cacheDir, dataIconsDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

ensureDirs()
