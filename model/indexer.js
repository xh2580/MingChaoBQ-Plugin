import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { dataRoot, indexPath, SUPPORTED_EXTS } from './paths.js'
import { log } from './utils.js'

export const API_DIR_NAME = 'API'
const SKIP_DIRS = new Set(['icons', 'cache'])

let cachedMtime = -1
let cachedIndex = null

function isImage(file) {
  return SUPPORTED_EXTS.has(path.extname(file).toLowerCase())
}

export function extractEmotionName(filename) {
  const stem = path.parse(filename).name
  let match = stem.match(/^\d+-\w+?_(.+?)(?:_\d{4}-\d{2}-\d{2}.*)?$/)
  if (match) return match[1].trim()

  match = stem.match(/^\d+-(\d*)(.+)$/)
  if (match && match[2].trim()) return match[2].trim()

  match = stem.match(/^[A-Z]+\d*_(.+)$/)
  if (match) return match[1].trim()

  match = stem.match(/^\d+\s*(.+)$/)
  if (match) return match[1].trim()

  return stem
}

function makePic(filePath, isApi = false) {
  const pic = {
    file: path.relative(dataRoot, filePath).split(path.sep).join('/'),
    emotion: extractEmotionName(path.basename(filePath))
  }
  if (isApi) pic.source = 'api'
  return pic
}

async function listImages(directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && isImage(entry.name))
    .map(entry => path.join(directory, entry.name))
    .sort()
}

export async function generateIndex() {
  const index = {}
  if (!fs.existsSync(dataRoot)) throw new Error(`表情包目录不存在：${dataRoot}`)

  const artists = await fsp.readdir(dataRoot, { withFileTypes: true })
  for (const artistEntry of artists.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!artistEntry.isDirectory() || SKIP_DIRS.has(artistEntry.name)) continue
    const artistDir = path.join(dataRoot, artistEntry.name)
    const isApiDir = artistEntry.name === API_DIR_NAME
    const charMap = {}

    const direct = await listImages(artistDir)
    if (direct.length) {
      charMap._default = { _default: direct.map(file => makePic(file, isApiDir)) }
    }

    const charEntries = await fsp.readdir(artistDir, { withFileTypes: true })
    for (const charEntry of charEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!charEntry.isDirectory()) continue
      const charDir = path.join(artistDir, charEntry.name)
      const charImages = await listImages(charDir)
      const subEntries = (await fsp.readdir(charDir, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))

      if (subEntries.length) {
        const subMap = {}
        if (charImages.length) subMap._default = charImages.map(file => makePic(file, isApiDir))
        for (const sub of subEntries) {
          const images = await listImages(path.join(charDir, sub.name))
          if (images.length) subMap[sub.name] = images.map(file => makePic(file, isApiDir))
        }
        if (Object.keys(subMap).length) charMap[charEntry.name] = subMap
      } else if (charImages.length) {
        charMap[charEntry.name] = { _default: charImages.map(file => makePic(file, isApiDir)) }
      }
    }

    if (Object.keys(charMap).length) index[artistEntry.name] = charMap
  }

  return index
}

export function countPics(index) {
  let total = 0
  for (const chars of Object.values(index)) {
    for (const subcats of Object.values(chars)) {
      for (const pics of Object.values(subcats)) total += pics.length
    }
  }
  return total
}

function parsePic(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.file !== 'string' || typeof raw.emotion !== 'string') return null
  const pic = { file: raw.file.replace(/\\/g, '/'), emotion: raw.emotion }
  if (typeof raw.source === 'string') pic.source = raw.source
  return pic
}

function parseIndex(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const index = {}
  for (const [artist, chars] of Object.entries(raw)) {
    if (!chars || typeof chars !== 'object') continue
    const charMap = {}
    for (const [char, subcats] of Object.entries(chars)) {
      if (!subcats || typeof subcats !== 'object') continue
      const subMap = {}
      for (const [sub, pics] of Object.entries(subcats)) {
        if (!Array.isArray(pics)) continue
        const parsed = pics.map(parsePic).filter(Boolean)
        if (parsed.length) subMap[sub] = parsed
      }
      if (Object.keys(subMap).length) charMap[char] = subMap
    }
    if (Object.keys(charMap).length) index[artist] = charMap
  }
  return index
}

function indexMtime() {
  try {
    return fs.statSync(indexPath).mtimeMs
  } catch {
    return -1
  }
}

export async function saveIndex(index) {
  await fsp.mkdir(path.dirname(indexPath), { recursive: true })
  const tmp = `${indexPath}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(index, null, 2), 'utf8')
  await fsp.rename(tmp, indexPath)
  cachedIndex = index
  cachedMtime = indexMtime()
}

export async function rebuildIndex() {
  const index = await generateIndex()
  await saveIndex(index)
  return index
}

export async function loadIndex() {
  if (!fs.existsSync(indexPath)) return rebuildIndex()

  const mtime = indexMtime()
  if (cachedIndex && mtime === cachedMtime) return cachedIndex

  try {
    const raw = JSON.parse(await fsp.readFile(indexPath, 'utf8'))
    const index = parseIndex(raw)
    cachedIndex = index
    cachedMtime = mtime
    return index
  } catch (err) {
    log('warn', `[鸣潮表情包·索引] index.json 无法读取，重新生成：${err.message}`)
    return rebuildIndex()
  }
}

export async function cleanTmpFiles(root = dataRoot) {
  let removed = 0
  const walk = async directory => {
    let entries = []
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name.startsWith('tmp_')) {
        try {
          await fsp.unlink(full)
          removed++
        } catch {}
      }
    }
  }
  await walk(root)
  return removed
}
