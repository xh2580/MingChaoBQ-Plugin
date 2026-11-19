import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { builtinMarker, cacheDir, dataRoot, SUPPORTED_EXTS } from './paths.js'
import { getBool, getStr } from './config.js'
import { log, readJson, writeJsonAtomicSync } from './utils.js'

export const DEFAULT_PACK_URL = 'https://github.com/Xbaiyz12/MingChaoBQ/releases/download/bq-builtin-v1/builtin-bq.zip'
export const PACK_VERSION = 'bq-builtin-v1'
const MAX_ENTRY_BYTES = 60 * 1024 * 1024

export function installedVersion() {
  if (!fs.existsSync(builtinMarker)) return ''
  try {
    const raw = JSON.parse(fs.readFileSync(builtinMarker, 'utf8'))
    return typeof raw?.version === 'string' ? raw.version : ''
  } catch {
    return ''
  }
}

export function needInstall() {
  return installedVersion() !== PACK_VERSION
}

function run(command, args, timeout = 600000) {
  return new Promise(resolve => {
    const proc = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeout)
    proc.stderr.on('data', chunk => { stderr += chunk.toString() })
    proc.on('error', () => {
      clearTimeout(timer)
      resolve({ ok: false, stderr })
    })
    proc.on('close', code => {
      clearTimeout(timer)
      resolve({ ok: code === 0, stderr })
    })
  })
}

async function downloadLarge(url, target) {
  await fsp.mkdir(path.dirname(target), { recursive: true })
  const curl = await run('curl', ['-sSL', '--max-time', '3600', '-o', target, url], 3600000)
  if (curl.ok && fs.existsSync(target) && fs.statSync(target).size > 0) return true

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3600000) })
    if (!res.ok) return false
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length) return false
    await fsp.writeFile(target, buffer)
    return true
  } catch (err) {
    log('warn', `[鸣潮表情包·内置包] 下载异常：${err.message}`)
    return false
  }
}

async function extractArchive(archive, target) {
  await fsp.mkdir(target, { recursive: true })
  const attempts = [
    ['unzip', ['-q', '-o', archive, '-d', target]],
    ['tar', ['-xf', archive, '-C', target]],
    ['python3', ['-m', 'zipfile', '-e', archive, target]]
  ]
  for (const [command, args] of attempts) {
    const result = await run(command, args, 600000)
    if (result.ok) return true
  }
  return false
}

async function collectFiles(root) {
  const files = []
  const walk = async directory => {
    const entries = await fsp.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else files.push(full)
    }
  }
  await walk(root)
  return files
}

export async function ensurePack(force = false) {
  if (!force) {
    if (!needInstall()) return { installed: false, note: '' }
    if (!getBool('mcbq_builtin_auto_fetch')) return { installed: false, note: '' }
  }

  const url = getStr('mcbq_builtin_pack_url') || DEFAULT_PACK_URL
  const archive = path.join(cacheDir, 'builtin_pack.zip')
  log('info', `[鸣潮表情包·内置包] 开始下载：${url}`)

  if (!(await downloadLarge(url, archive))) {
    return { installed: false, note: '内置表情包下载失败，可稍后再发 bq下载表情包 重试。' }
  }

  const tempDir = path.join(cacheDir, `builtin-extract-${Date.now()}`)
  let added = 0
  try {
    if (!(await extractArchive(archive, tempDir))) {
      return { installed: false, note: '内置表情包解压失败（需要 unzip / tar / python3 之一），可稍后再试。' }
    }

    for (const file of await collectFiles(tempDir)) {
      if (!SUPPORTED_EXTS.has(path.extname(file).toLowerCase())) continue
      const stat = await fsp.stat(file)
      if (stat.size > MAX_ENTRY_BYTES) continue

      const relative = path.relative(tempDir, file)
      const parts = relative.split(path.sep).filter(part => part && part !== '.')
      if (!parts.length || parts.includes('..') || path.isAbsolute(relative)) continue

      const dest = path.join(dataRoot, ...parts)
      if (fs.existsSync(dest)) continue
      await fsp.mkdir(path.dirname(dest), { recursive: true })
      await fsp.copyFile(file, dest)
      added++
    }
  } finally {
    await fsp.unlink(archive).catch(() => {})
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }

  writeJsonAtomicSync(builtinMarker, { version: PACK_VERSION, added })
  log('info', `[鸣潮表情包·内置包] 安装完成，新增 ${added} 张`)

  if (added === 0) return { installed: true, note: '内置表情包已是最新（没有新增文件）。' }
  return { installed: true, note: `内置表情包安装完成，新增 ${added} 张表情。` }
}

export { readJson }
