// 云崽加载器只要发现 index.js 就只加载它，不会再扫描 apps/，所以必须在这里聚合导出。
// 依据：lib/plugins/loader.js#getPlugins + importPlugin（module.apps 分支）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = path.basename(fileURLToPath(new URL('./', import.meta.url)))
const APPS_DIR = new URL('./apps/', import.meta.url)

const files = fs
  .readdirSync(APPS_DIR)
  .filter(file => file.endsWith('.js'))
  .sort()

const results = await Promise.allSettled(files.map(file => import(new URL(file, APPS_DIR).href)))

export const apps = {}

files.forEach((file, index) => {
  const name = file.replace(/\.js$/, '')
  const result = results[index]

  if (result.status !== 'fulfilled') {
    const message = String(result.reason?.message || result.reason)
    const missing = message.match(/'(.+?)'/g)?.[0]?.replace(/'/g, '')
    if (missing && message.includes('Cannot find package')) {
      global.logger?.warn?.(
        `[${PLUGIN}] ${name} 缺少依赖 ${missing}，请在云崽根目录 pnpm i，或 cd plugins/${PLUGIN} && pnpm add ${missing}`
      )
    } else {
      global.logger?.error?.(`[${PLUGIN}] 载入插件错误：${name}`)
      global.logger?.error?.(result.reason)
    }
    return
  }

  const key = Object.keys(result.value).find(item => typeof result.value[item] === 'function')
  if (!key) {
    global.logger?.warn?.(`[${PLUGIN}] ${name} 没有导出插件类，已跳过`)
    return
  }
  apps[name] = result.value[key]
})

global.logger?.info?.(`[${PLUGIN}] 已加载 ${Object.keys(apps).length}/${files.length} 个 app`)
