import fs from 'node:fs'
import { getBool, getInt } from './config.js'
import { indexPath } from './paths.js'
import { countPics, rebuildIndex } from './indexer.js'
import { log } from './utils.js'

let timer = null

function targetMinutes() {
  const hour = Math.min(23, Math.max(0, getInt('mcbq_index_update_hour', 4)))
  const minute = Math.min(59, Math.max(0, getInt('mcbq_index_update_minute', 0)))
  return hour * 60 + minute
}

function updatedToday(now) {
  try {
    const stat = fs.statSync(indexPath)
    const date = new Date(stat.mtimeMs)
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  } catch {
    return false
  }
}

export function startScheduler() {
  if (timer) return
  timer = setInterval(async () => {
    try {
      if (!getBool('mcbq_index_auto_update')) return
      const now = new Date()
      if (now.getHours() * 60 + now.getMinutes() < targetMinutes()) return
      if (updatedToday(now)) return
      const index = await rebuildIndex()
      log('info', `[鸣潮表情包·索引] 每日自动更新完成，共 ${countPics(index)} 张`)
    } catch (err) {
      log('warn', `[鸣潮表情包·索引] 自动更新失败：${err.message}`)
    }
  }, 60 * 1000)
  timer.unref?.()
}
