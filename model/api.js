import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { dataRoot } from './paths.js'
import { getBool, getStr } from './config.js'
import { API_DIR_NAME } from './indexer.js'
import { downloadToFile, fetchJson, fileMd5, log, safeName, sleep } from './utils.js'

export const DEFAULT_BASE = 'https://emoji.wuwa.games/apis/api.random-emoji.wuwa.games'
export const DEFAULT_RANDOM_PATH = '/v1alpha1/random'
export const DEFAULT_CHARACTER_PARAM = 'character'
const ALLOWED_SUFFIX = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp'])

export function getClientConfig() {
  return {
    baseUrl: (getStr('mcbq_api_base') || DEFAULT_BASE).replace(/\/+$/, ''),
    token: getStr('mcbq_api_token'),
    randomPath: (getStr('mcbq_api_random_path') || DEFAULT_RANDOM_PATH).replace(/^\/?/, '/'),
    characterParam: getStr('mcbq_api_character_param') || DEFAULT_CHARACTER_PARAM
  }
}

function headers(token) {
  const result = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Referer: 'https://emoji.wuwa.games/'
  }
  if (token) result.Authorization = `Bearer ${token}`
  return result
}

export async function fetchRandomJson(role = '', artist = '', pack = '') {
  const { baseUrl, token, randomPath, characterParam } = getClientConfig()
  const url = `${baseUrl}${randomPath}`
  const params = {}
  if (role) params[characterParam] = role
  if (artist) params.artist = artist
  if (pack) params.pack = pack

  let data = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const fetch = globalThis.fetch
    if (!fetch) return null
    const target = new URL(url)
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
    try {
      const res = await fetch(target, { headers: headers(token), signal: AbortSignal.timeout(20000) })
      if (!res.ok) {
        log('warn', `[鸣潮表情包·API] status=${res.status} url=${url}`)
        return null
      }
      data = await res.json()
      break
    } catch (err) {
      log('warn', `[鸣潮表情包·API] 请求失败（${attempt + 1}/3）：${err.message}`)
      await sleep(800)
    }
  }
  if (!data || typeof data !== 'object') return null
  if (typeof data.url !== 'string' || !data.url) return null

  let roleName = role || '未知角色'
  const charRaw = data.character || data.role
  if (typeof charRaw === 'string' && charRaw) roleName = charRaw
  else if (charRaw && typeof charRaw === 'object') {
    const name = charRaw.name || charRaw.slug
    if (typeof name === 'string' && name) roleName = name
  }

  const format = typeof data.format === 'string' ? data.format.toLowerCase() : ''
  const suffix = ALLOWED_SUFFIX.has(`.${format}`) ? `.${format}` : '.gif'
  const name = typeof data.id === 'string' || typeof data.id === 'number' ? String(data.id) : '未命名'

  let packSlug = ''
  if (typeof data.sourceUrl === 'string' && data.sourceUrl.includes('/archives/')) {
    packSlug = data.sourceUrl.split('/archives/').pop().replace(/^\/+|\/+$/g, '').split('/')[0]
  }

  return { url: data.url, name, role: roleName, suffix, pack_slug: packSlug }
}

function apiSaveDir(role) {
  return path.join(dataRoot, API_DIR_NAME, safeName(role))
}

export async function saveApiPicToLocal(data) {
  if (!getBool('mcbq_api_save_local')) return null

  const saveDir = apiSaveDir(data.role)
  await fsp.mkdir(saveDir, { recursive: true })

  const stem = safeName(data.name)
  const existing = (await fsp.readdir(saveDir).catch(() => [])).find(name => name.startsWith(`${stem}_`))
  if (existing) return path.join(saveDir, existing)

  const tmp = path.join(saveDir, `tmp_${fileMd5Hex(data.url)}${data.suffix}`)
  try {
    if (!(await downloadToFile(data.url, tmp))) return null
    const digest = await fileMd5(tmp)
    const final = path.join(saveDir, `${stem}_${digest}${data.suffix}`)
    if (fs.existsSync(final)) return final
    await fsp.rename(tmp, final)
    return final
  } catch (err) {
    log('warn', `[鸣潮表情包·API] 保存失败：${err.message}`)
    return null
  } finally {
    await fsp.unlink(tmp).catch(() => {})
  }
}

function fileMd5Hex(text) {
  return crypto.createHash('md5').update(text).digest('hex').slice(0, 10)
}

export async function fetchAndSave(role = '', artist = '', pack = '') {
  const data = await fetchRandomJson(role, artist, pack)
  if (!data) return null
  const saved = await saveApiPicToLocal(data)
  if (saved) data.saved_path = saved
  return data
}

export function downloadToUrl(url, savePath) {
  return downloadToFile(url, savePath)
}

export async function cleanTmpFilesIn(root) {
  const { cleanTmpFiles } = await import('./indexer.js')
  return cleanTmpFiles(root)
}

export function cacheApiDir() {
  return path.join(dataRoot, API_DIR_NAME)
}

export { fetchJson }
