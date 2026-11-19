import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
export const REFERER = 'https://emoji.wuwa.games/'
const MAX_BYTES = 20 * 1024 * 1024

export function log(level, ...args) {
  const logger = global.logger
  if (logger?.[level]) logger[level](...args)
  else if (level === 'error') console.error(...args)
  else if (level === 'warn') console.warn(...args)
}

let curlChecked = false
let curlAvailable = false

function hasCurl() {
  if (curlChecked) return curlAvailable
  curlChecked = true
  try {
    const bin = process.platform === 'win32' ? 'where' : 'which'
    curlAvailable = spawnSync(bin, ['curl'], { stdio: 'ignore' }).status === 0
  } catch {
    curlAvailable = false
  }
  return curlAvailable
}

function looksLikeHtml(buffer) {
  const head = buffer.subarray(0, 64).toString('utf8').trim().toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html')
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

export function safeName(name) {
  let cleaned = String(name ?? '')
  for (const ch of ['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
    cleaned = cleaned.split(ch).join('_')
  }
  cleaned = [...cleaned].filter(ch => {
    const code = ch.codePointAt(0)
    return code >= 32 && code !== 127
  }).join('')
  cleaned = cleaned.trim().replace(/^\.+|\.+$/g, '')
  return cleaned.slice(0, 64) || '未命名'
}

export function normName(name) {
  return String(name ?? '').replace(/\s+/g, '').toLowerCase()
}

export function normArtist(name) {
  return String(name ?? '').replace(/[\s\-_·&.]+/g, '').toLowerCase()
}

export function commonPrefixLen(a, b) {
  const limit = Math.min(a.length, b.length)
  let index = 0
  while (index < limit && a[index] === b[index]) index++
  return index
}

/** text 是否以 name 开头（忽略空白与大小写），是则返回剩余文本 */
export function stripPrefix(text, name) {
  let cursor = 0
  for (const char of name) {
    if (/\s/.test(char)) continue
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++
    if (cursor >= text.length || text[cursor].toLowerCase() !== char.toLowerCase()) return null
    cursor++
  }
  return text.slice(cursor).trim()
}

export function detectImageSuffix(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png'
  if (buffer.subarray(0, 4).toString('latin1') === 'GIF8') return '.gif'
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return '.jpg'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp'
  return '.png'
}

export function uniqueStem(directory, stem, ext) {
  if (!fs.existsSync(path.join(directory, `${stem}${ext}`))) return stem
  let seq = 2
  while (fs.existsSync(path.join(directory, `${stem}_${seq}${ext}`))) seq++
  return `${stem}_${seq}`
}

export function fileMd5(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(file)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex').slice(0, 10)))
  })
}

export function bufferMd5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex').slice(0, 10)
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJsonAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fsp.rename(tmp, file)
}

export function writeJsonAtomicSync(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

function curlDownload(url, savePath) {
  return new Promise(resolve => {
    const args = [
      '-sSL',
      '--max-time', '30',
      '-H', `Referer: ${REFERER}`,
      '-H', `User-Agent: ${UA}`,
      '-H', 'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      '-H', 'Accept-Language: zh-CN,zh;q=0.9',
      '-H', 'Accept-Encoding: identity',
      '-o', savePath,
      url
    ]
    const proc = spawn('curl', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', chunk => { stderr += chunk.toString() })
    proc.on('error', () => resolve(false))
    proc.on('close', code => {
      if (code !== 0) {
        log('warn', `[鸣潮表情包·下载] curl 失败 rc=${code} ${stderr.slice(0, 200)}`)
        return resolve(false)
      }
      try {
        if (!fs.existsSync(savePath) || fs.statSync(savePath).size === 0) return resolve(false)
        const head = fs.readFileSync(savePath).subarray(0, 64)
        if (looksLikeHtml(head)) {
          fs.unlinkSync(savePath)
          log('warn', '[鸣潮表情包·下载] curl 拿到 HTML 拦截页')
          return resolve(false)
        }
        resolve(true)
      } catch {
        resolve(false)
      }
    })
  })
}

async function fetchDownload(url, savePath) {
  try {
    const res = await getFetch()(url, {
      headers: { 'User-Agent': UA, Referer: REFERER, 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) {
      log('warn', `[鸣潮表情包·下载] HTTP ${res.status} ${url}`)
      return false
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    if (!buffer.length || buffer.length > MAX_BYTES || looksLikeHtml(buffer)) return false
    await fsp.mkdir(path.dirname(savePath), { recursive: true })
    await fsp.writeFile(savePath, buffer)
    return true
  } catch (err) {
    log('warn', `[鸣潮表情包·下载] 请求失败：${err.message}`)
    return false
  }
}

/** 下载图片到本地，优先 curl（绕过 Cloudflare 的 TLS 指纹拦截），失败回退 fetch */
export async function downloadToFile(url, savePath) {
  if (!url) return false
  if (url.startsWith('//')) url = `https:${url}`
  await fsp.mkdir(path.dirname(savePath), { recursive: true })
  const useCurl = hasCurl()
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = useCurl ? await curlDownload(url, savePath) : await fetchDownload(url, savePath)
    if (ok) return true
  }
  if (useCurl) return fetchDownload(url, savePath)
  return false
}

let fetchImpl = null
export function getFetch() {
  if (fetchImpl) return fetchImpl
  if (typeof globalThis.fetch === 'function') fetchImpl = globalThis.fetch
  return fetchImpl
}

export async function fetchJson(url, params = {}, timeout = 20000) {
  const fetch = getFetch()
  if (!fetch) return null
  const target = new URL(url)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value))
  }
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, Referer: REFERER, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeout)
    })
    if (!res.ok) {
      log('warn', `[鸣潮表情包·接口] ${target.pathname} HTTP ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    log('warn', `[鸣潮表情包·接口] ${target.pathname} 请求失败：${err.message}`)
    return null
  }
}

export function decodeBase64(value) {
  const raw = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  return Buffer.from(raw, 'base64')
}

/** 把云崽事件里的图片地址（http/base64/file/本地路径）读成 Buffer */
export async function fetchImageBuffer(src) {
  if (!src) return null
  if (src.startsWith('base64://')) return decodeBase64(src.slice(9))
  if (src.startsWith('data:')) return decodeBase64(src)
  if (/^https?:\/\//i.test(src)) {
    const fetch = getFetch()
    if (!fetch) return null
    try {
      const res = await fetch(src, { headers: { 'User-Agent': UA, Referer: REFERER }, signal: AbortSignal.timeout(30000) })
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      log('warn', `[鸣潮表情包·图片] 下载失败：${err.message}`)
      return null
    }
  }
  try {
    const file = src.startsWith('file://') ? fileURLToPath(src) : src
    return await fsp.readFile(file)
  } catch {
    return null
  }
}

export function imageSegment(file) {
  const segment = global.segment
  return segment?.image ? segment.image(file) : file
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'{]/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '{': '&#123;'
  })[ch])
}

export function truncate(text, max = 30) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}
