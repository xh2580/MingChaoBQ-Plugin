import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { dataRoot, cacheDir, SUPPORTED_EXTS, upstreamAliasPath } from './paths.js'
import { getBool, getInt, getList, getStr, setConfig } from './config.js'
import { isBlocked } from './blocklist.js'
import { getGroupRole } from './whitelist.js'
import { recordRole } from './statistics.js'
import { API_DIR_NAME, loadIndex } from './indexer.js'
import { downloadToUrl, fetchAndSave } from './api.js'
import * as siteApi from './site.js'
import { renderEmotionList, renderRank } from './render.js'
import {
  downloadToFile,
  escapeHtml,
  fetchImageBuffer,
  fileMd5,
  imageSegment,
  log,
  mapLimit,
  normArtist,
  safeName,
  sleep,
  stripPrefix,
  truncate,
  uniqueStem
} from './utils.js'
import { eventText, imageSources, isSameUser, parseChoice, waitFor } from './picker.js'

export const CHAR_PINYIN_MAP = {
  jx: '今汐',
  cl: '长离',
  sar: '守岸人',
  shr: '守岸人',
  sh: '守岸人',
  wln: '维里奈',
  zz: '折枝',
  xly: '相里要',
  c: '椿',
  fll: '弗洛洛',
  yh: '釉瑚',
  klt: '柯莱塔',
  dj: '丹瑾',
  ak: '安可',
  cx: '炽霞',
  bz: '白芷',
  yw: '渊武',
  mtf: '莫特斐',
  tq: '桃祈',
  kkl: '卡卡罗',
  jy: '忌炎',
  yl: '吟霖',
  pbz: '漂泊者',
  blt: '布兰特',
  lkk: '洛可可',
  zd: '赞迪',
  fb: '菲比',
  krl: '坎瑞拉'
}

let aliasMtime = -1
let aliasCache = {}

function loadUpstreamAlias() {
  if (!fs.existsSync(upstreamAliasPath)) {
    aliasMtime = -1
    aliasCache = {}
    return {}
  }
  let mtime = 0
  try {
    mtime = fs.statSync(upstreamAliasPath).mtimeMs
  } catch {
    return aliasCache
  }
  if (Object.keys(aliasCache).length && mtime === aliasMtime) return aliasCache

  try {
    const raw = JSON.parse(fs.readFileSync(upstreamAliasPath, 'utf8'))
    if (!raw || typeof raw !== 'object') return {}
    const result = {}
    for (const [realName, aliases] of Object.entries(raw)) {
      if (!Array.isArray(aliases)) continue
      for (const alias of aliases) {
        if (typeof alias === 'string' && alias.trim()) result[alias.trim()] = realName
      }
      result[realName] = result[realName] || realName
    }
    aliasMtime = mtime
    aliasCache = result
    return result
  } catch (err) {
    log('warn', `[鸣潮表情包·别名] 读取失败：${err.message}`)
    return {}
  }
}

export function getAliasMap() {
  const result = { ...loadUpstreamAlias() }
  for (const line of getList('mcbq_char_alias')) {
    if (!line.includes(':')) continue
    const [realRaw, aliasRaw] = line.split(':', 2)
    const real = realRaw.trim()
    if (!real) continue
    for (const alias of (aliasRaw || '').split(',')) {
      const value = alias.trim()
      if (value) result[value] = real
    }
  }
  return result
}

export function resolveCharName(keyword) {
  const cleaned = String(keyword ?? '').trim()
  if (!cleaned) return ''
  const aliasMap = getAliasMap()
  if (aliasMap[cleaned]) return aliasMap[cleaned]
  const lower = cleaned.toLowerCase()
  if (aliasMap[lower]) return aliasMap[lower]
  if (CHAR_PINYIN_MAP[lower]) return CHAR_PINYIN_MAP[lower]
  return cleaned
}

export function allCharNames(index) {
  const names = new Set()
  for (const chars of Object.values(index)) {
    for (const name of Object.keys(chars)) if (name !== '_default') names.add(name)
  }
  return names
}

export function localNames(index) {
  const artists = Object.keys(index).filter(name => name !== API_DIR_NAME).sort()
  const chars = [...allCharNames(index)].sort()
  return { artists, chars }
}

export function matchArtists(index, keyword) {
  return Object.keys(index).filter(name => name !== API_DIR_NAME && (keyword === name || keyword.includes(name) || name.includes(keyword)))
}

export function matchChars(index, keyword) {
  const real = resolveCharName(keyword)
  return allCharNames(index).has(real) ? [real] : []
}

export function matchCharsFuzzy(index, keyword) {
  const real = resolveCharName(keyword)
  const names = allCharNames(index)
  if (names.has(real)) return [real]
  return [...names].filter(name => keyword.includes(name) || name.includes(keyword)).sort()
}

function withMeta(pic, artist, char, sub) {
  const entry = { file: pic.file, emotion: pic.emotion }
  if (pic.source !== undefined) entry.source = pic.source
  entry._artist = artist
  entry._char = char
  entry._sub = sub
  return entry
}

export function matchEmotions(index, keyword, fuzzy = false) {
  const results = []
  for (const [artist, chars] of Object.entries(index)) {
    for (const [char, subcats] of Object.entries(chars)) {
      for (const [sub, pics] of Object.entries(subcats)) {
        for (const pic of pics) {
          if (pic.emotion === keyword || (fuzzy && pic.emotion.includes(keyword))) {
            results.push(withMeta(pic, artist, char, sub))
          }
        }
      }
    }
  }
  return results
}

export function collectAllPics(index, artist = null, char = null) {
  const results = []
  for (const [artistName, chars] of Object.entries(index)) {
    if (artist && artistName !== artist) continue
    for (const [charName, subcats] of Object.entries(chars)) {
      if (char && charName !== char) continue
      for (const [subName, pics] of Object.entries(subcats)) {
        for (const pic of pics) results.push(withMeta(pic, artistName, charName, subName))
      }
    }
  }
  return results
}

export function charOf(pic) {
  const char = pic._char || ''
  return char === '' || char === '_default' ? '未分类' : char
}

export function matchArtistChar(index, keyword) {
  const { artists, chars } = localNames(index)

  const take = (text, names) => {
    for (const name of [...names].sort((a, b) => b.length - a.length)) {
      const rest = stripPrefix(text, name)
      if (rest !== null) return [name, rest]
    }
    return null
  }

  const artistFirst = take(keyword, artists)
  if (artistFirst) {
    const charPart = take(artistFirst[1], chars)
    if (charPart && charPart[1] === '') {
      const pics = collectAllPics(index, artistFirst[0], charPart[0])
      if (pics.length) return [artistFirst[0], charPart[0], pics]
    }
  }

  const charFirst = take(keyword, chars)
  if (charFirst) {
    const artistPart = take(charFirst[1], artists)
    if (artistPart && artistPart[1] === '') {
      const pics = collectAllPics(index, artistPart[0], charFirst[0])
      if (pics.length) return [artistPart[0], charFirst[0], pics]
    }
  }

  return null
}

export async function sendText(e, text) {
  try {
    if (typeof e.reply === 'function') return await e.reply(text)
    if (e.group_id && global.Bot?.pickGroup) return await global.Bot.pickGroup(e.group_id).sendMsg(text)
    if (global.Bot?.pickFriend) return await global.Bot.pickFriend(e.user_id).sendMsg(text)
  } catch (err) {
    log('warn', `[鸣潮表情包·发送] ${err.message}`)
  }
}

export async function sendImage(e, file) {
  return sendText(e, imageSegment(file))
}

export function userPm(e) {
  if (e.isMaster) return 0
  if (e.isGroup) {
    if (e.member?.is_owner) return 2
    if (e.member?.is_admin) return 3
  }
  return 6
}

export function isMaster(e) {
  return e.isMaster === true
}

export function checkPm(e, required) {
  return userPm(e) <= required
}

export async function fetchUnblocked(role = '', artist = '', pack = '') {
  for (let i = 0; i < 3; i++) {
    const data = await fetchAndSave(role, artist, pack)
    if (!data) return null
    if (!isBlocked(data.name, data.role, data.pack_slug)) return data
    log('info', `[鸣潮表情包·屏蔽] 跳过 ${data.name}（${data.role} / ${data.pack_slug}）`)
  }
  return null
}

export async function tryApi(role = '') {
  if (!getBool('mcbq_api_enable')) return null
  const limit = getInt('mcbq_api_timeout', 3)
  if (limit <= 0) return fetchUnblocked(role)
  return Promise.race([
    fetchUnblocked(role).catch(err => {
      log('warn', `[鸣潮表情包·API] ${err.message}`)
      return null
    }),
    sleep(limit * 1000).then(() => null)
  ])
}

export async function sendFromApi(e, data) {
  if (data.saved_path && fs.existsSync(data.saved_path)) {
    await sendImage(e, data.saved_path)
    await recordRole(data.role)
    return
  }
  const temp = path.join(cacheDir, `api_${Date.now()}${data.suffix}`)
  if (await downloadToUrl(data.url, temp)) {
    await sendImage(e, temp)
    await recordRole(data.role)
    return
  }
  await sendText(e, '图片下载失败')
}

export async function sendPic(e, pic) {
  const full = path.join(dataRoot, pic.file)
  if (!fs.existsSync(full)) {
    await sendText(e, `图片文件不存在：${pic.file}`)
    return
  }
  if (pic.source === 'api' || pic._artist === API_DIR_NAME) {
    await sendImage(e, full)
    await recordRole(charOf(pic))
    return
  }
  const artist = pic._artist || ''
  const char = pic._char || '未知角色'
  const emotion = pic.emotion || ''
  await sendText(e, [`【${artist}】${char} · ${emotion}`, imageSegment(full)])
  await recordRole(charOf(pic))
}

export function sampleByChar(pics, perChar, limit) {
  const buckets = new Map()
  for (const pic of pics) {
    const key = charOf(pic)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(pic)
  }
  const picked = []
  for (let round = 0; round < perChar; round++) {
    for (const bucket of buckets.values()) {
      if (round >= bucket.length) continue
      picked.push(bucket[round])
      if (picked.length >= limit) return picked
    }
  }
  return picked
}

export function pickCandidates(pics, note, groupByChar) {
  if (!groupByChar) return [pics.slice(0, 50), note]
  return [sampleByChar(pics, 10, 50), `${note} · 每个角色最多 10 个`]
}

export async function sendWithPicker(e, pics, keyword, note = '', groupByChar = false) {
  if (!pics.length) return
  if (pics.length === 1) return sendPic(e, pics[0])

  const [candidates, sampledNote] = pickCandidates(pics, note, groupByChar)
  const image = await renderEmotionList(candidates, keyword, sampledNote, '回复「表情N」发送第 N 个', pics.length)
  await sendText(e, image)

  const resp = await waitFor(e, ev => isSameUser(ev, e), 30000)
  if (!resp) return
  const text = eventText(resp).replace(/^#/, '').trim()
  const picked = parseChoice(text, candidates.length)
  if (picked === null) {
    await sendText(e, `没看懂「${text || '空消息'}」，请回复 表情1 ~ 表情${candidates.length}。`)
    return
  }
  await sendPic(resp, candidates[picked])
}

export function parseBurstArgs(command, rawText) {
  const defaultCount = command === '五连' || command === '来五张' ? 5 : 3
  const text = String(rawText ?? '').trim()
  if (!text) return [defaultCount, '']

  let match = text.match(/^(\d+)\s*张?\s*(.*)$/s)
  if (match) {
    return [Math.min(Math.max(Number(match[1]), 1), 5), match[2].trim()]
  }

  match = text.match(/^(.*?)\s+(\d+)\s*张?$/s)
  if (match) {
    return [Math.min(Math.max(Number(match[2]), 1), 5), match[1].trim()]
  }

  return [defaultCount, text]
}

export async function sendBurstItems(e, items) {
  if (!items.length) return

  if (items.length > 1 && getBool('mcbq_burst_forward') && global.Bot?.makeForwardMsg) {
    const nodes = []
    const roles = []
    for (const item of items) {
      if (item.file) {
        const full = path.join(dataRoot, item.file)
        if (!fs.existsSync(full)) continue
        if (item.source === 'api' || item._artist === API_DIR_NAME) {
          nodes.push({ user_id: e.self_id || e.user_id, nickname: '鸣潮表情包', message: imageSegment(full) })
        } else {
          const text = `【${item._artist || ''}】${item._char || '未知角色'} · ${item.emotion || ''}`
          nodes.push({ user_id: e.self_id || e.user_id, nickname: '鸣潮表情包', message: [text, imageSegment(full)] })
        }
        roles.push(charOf(item))
      } else {
        let file = item.saved_path
        if (!file || !fs.existsSync(file)) {
          file = path.join(cacheDir, `api_${Date.now()}_${Math.random().toString(36).slice(2)}${item.suffix}`)
          if (!(await downloadToUrl(item.url, file))) continue
        }
        nodes.push({ user_id: e.self_id || e.user_id, nickname: '鸣潮表情包', message: imageSegment(file) })
        roles.push(item.role)
      }
    }

    if (nodes.length) {
      try {
        const forward = await global.Bot.makeForwardMsg(nodes)
        await sendText(e, forward)
        for (const role of roles) await recordRole(role)
        return
      } catch (err) {
        log('warn', `[鸣潮表情包·连发] 合并转发失败，降级为单发：${err.message}`)
      }
    }
  }

  for (const item of items) {
    if (item.file) await sendPic(e, item)
    else await sendFromApi(e, item)
    await sleep(300)
  }
}

export async function trySiteRandom(keyword) {
  if (!String(keyword ?? '').trim() || !getBool('mcbq_site_random_fallback')) return null

  const chars = await siteApi.searchCharacters(keyword, 5)
  const hit = chars.find(item => item.name === keyword)
  if (hit) {
    log('info', `[鸣潮表情包·小站] 本地没有「${keyword}」，向小站按角色取图`)
    return fetchUnblocked(hit.name)
  }

  const artists = await siteApi.listArtists(100)
  const artist = artists.find(item => item.name === keyword)
  if (artist) {
    log('info', `[鸣潮表情包·小站] 本地没有「${keyword}」，向小站按画师取图`)
    return fetchUnblocked('', artist.name)
  }
  return null
}

export async function siteHint(keyword) {
  if (!String(keyword ?? '').trim()) return ''
  const hit = await siteApi.searchCharacters(keyword, 3)
  if (!hit.length) return ''
  const top = hit[0]
  return `\n小站上有「${top.name}」（${top.count} 张 · ${top.packCount} 个包），可用 bq拉取角色 ${top.name} 拉到本地。`
}

export function formatRoleDetail(added, unit = '张', limit = 15) {
  const ordered = Object.entries(added).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (!ordered.length) return ''
  let head = ordered.slice(0, limit).map(([role, count]) => `${role} ${count} ${unit}`).join('、')
  if (ordered.length > limit) {
    const rest = ordered.slice(limit).reduce((sum, [, count]) => sum + count, 0)
    head += ` 等 ${ordered.length - limit} 个角色共 ${rest} ${unit}`
  }
  return head
}

export function localArtistCounts(index) {
  const counts = {}
  for (const [artist, chars] of Object.entries(index)) {
    counts[artist] = Object.values(chars).reduce((sum, subs) => sum + Object.values(subs).reduce((s, pics) => s + pics.length, 0), 0)
  }
  return counts
}

export function matchLocalArtist(siteName, local) {
  if (Object.prototype.hasOwnProperty.call(local, siteName)) return local[siteName]
  const needle = normArtist(siteName)
  if (needle.length < 2) return 0
  let total = 0
  for (const [artist, count] of Object.entries(local)) {
    const key = normArtist(artist)
    if (key.length < 2) continue
    if (key === needle || key.includes(needle) || needle.includes(key)) {
      total += count
      continue
    }
    let common = 0
    while (common < Math.min(key.length, needle.length) && key[common] === needle[common]) common++
    if (common >= 2) total += count
  }
  return total
}

export async function expandBlockWords(word) {
  const needle = String(word ?? '').toLowerCase()
  const slugs = []
  for (let page = 1; page <= 8; page++) {
    const packs = await siteApi.listPacks(page, 100)
    if (!packs.length) break
    for (const pack of packs) {
      if ((pack.title.toLowerCase().includes(needle) || pack.slug.toLowerCase().includes(needle)) && !slugs.includes(pack.slug)) {
        slugs.push(pack.slug)
      }
    }
    if (packs.length < 100) break
  }
  return slugs
}

export async function roleFileCounts(apiRoot) {
  const counts = {}
  if (!fs.existsSync(apiRoot)) return counts
  for (const entry of await fsp.readdir(apiRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const files = await fsp.readdir(path.join(apiRoot, entry.name), { withFileTypes: true })
    counts[entry.name] = files.filter(item => item.isFile()).length
  }
  return counts
}

export async function downloadSiteEmojis(items, apiRoot) {
  const added = {}
  await mapLimit(items, 10, async item => {
    const role = item.character || '未知角色'
    const roleDir = path.join(apiRoot, safeName(role))
    const stem = safeName(item.id)
    const existing = await fsp.readdir(roleDir).catch(() => [])
    if (existing.some(name => name.startsWith(`${stem}_`))) return
    await fsp.mkdir(roleDir, { recursive: true })

    const suffix = item.format ? `.${item.format}` : '.gif'
    const tmp = path.join(roleDir, `tmp_${stem}${suffix}`)
    try {
      if (!(await downloadToUrl(item.url, tmp))) return
      const digest = await fileMd5(tmp)
      const target = path.join(roleDir, `${stem}_${digest}${suffix}`)
      if (fs.existsSync(target)) return
      await fsp.rename(tmp, target)
      added[role] = (added[role] || 0) + 1
    } catch (err) {
      log('warn', `[鸣潮表情包·小站] 下载失败 ${item.id}：${err.message}`)
    } finally {
      await fsp.unlink(tmp).catch(() => {})
    }
  })
  return added
}

export async function collectSiteEmojis(character = '', artist = '', want = 20) {
  const out = []
  for (let page = 1; page <= 20 && out.length < want; page++) {
    const batch = await siteApi.listEmojis(character, artist, page)
    if (!batch.length) break
    out.push(...batch)
  }
  return out.slice(0, want)
}

export async function fetchByEmojis(e, label, { character = '', artist = '', want = 20, totalHint = 0 } = {}) {
  const apiRoot = path.join(dataRoot, API_DIR_NAME)
  const emojis = await collectSiteEmojis(character, artist, want)
  if (!emojis.length) {
    await sendText(e, '没有取到表情清单（接口可能暂时不可用），稍后再试。')
    return
  }

  const addedMap = await downloadSiteEmojis(emojis, apiRoot)
  const added = Object.values(addedMap).reduce((sum, count) => sum + count, 0)
  if (!added) {
    await sendText(e, `「${label}」没有新增（这 ${emojis.length} 张本地都有了）。`)
    return
  }

  const { rebuildIndex, countPics } = await import('./indexer.js')
  const index = await rebuildIndex()
  const hint = totalHint ? `，小站共 ${totalHint} 张` : ''
  log('info', `[鸣潮表情包·小站] 拉取「${label}」新增 ${added} 张：${JSON.stringify(addedMap)}`)
  await sendText(
    e,
    `已拉取「${label}」${added} 张新表情（本次 ${emojis.length} 张候选${hint}）\n` +
    `各角色：${formatRoleDetail(addedMap)}\n` +
    `所有图按各自角色存入 API/<角色>/，当前索引共 ${countPics(index)} 张。`
  )
}

export async function findSitePack(key) {
  const needle = String(key ?? '').trim().toLowerCase()
  if (!needle) return null
  for (let page = 1; page <= 4; page++) {
    const packs = await siteApi.listPacks(page, 100)
    if (!packs.length) break
    const bySlug = packs.find(pack => pack.slug.toLowerCase() === needle)
    if (bySlug) return bySlug
    const byTitle = packs.find(pack => pack.title.trim().toLowerCase().includes(needle))
    if (byTitle) return byTitle
  }
  return null
}

export function siteFetchMax() {
  const limit = getInt('mcbq_site_fetch_max', 100)
  return limit > 0 ? limit : 100000
}

const LABEL_ALIASES = {
  画师: 'artist',
  作者: 'artist',
  artist: 'artist',
  角色: 'role',
  char: 'role',
  role: 'role',
  表情: 'emotion',
  表情名: 'emotion',
  emotion: 'emotion'
}

const LABEL_RE = /(?:^|\s)(画师|作者|角色|char|role|表情名|表情|artist|emotion)[:：]\s*(.*?)(?=\s*(?:画师|作者|角色|char|role|表情名|表情|artist|emotion)[:：]|$)/gis

function parseLabeledTokens(rawText) {
  const found = { artist: [], role: [], emotion: [] }
  let matched = false
  for (const match of rawText.matchAll(LABEL_RE)) {
    matched = true
    const value = match[2].trim()
    if (value) found[LABEL_ALIASES[match[1].toLowerCase()]].push(value)
  }
  if (!matched) return null
  return [found.artist.join(' '), found.role.join(' '), found.emotion.join(' ')]
}

function lookupLocal(name, candidates) {
  const target = String(name ?? '').replace(/\s+/g, '').toLowerCase()
  if (!target) return ['', []]
  const exact = candidates.filter(item => item.replace(/\s+/g, '').toLowerCase() === target)
  if (exact.length === 1) return [exact[0], []]
  if (exact.length > 1) return ['', exact]
  const fuzzy = candidates.filter(item => {
    const key = item.replace(/\s+/g, '').toLowerCase()
    return key.includes(target) || target.includes(key)
  })
  if (fuzzy.length === 1) return [fuzzy[0], []]
  return ['', fuzzy]
}

function splitKnownPrefix(text, artists, chars) {
  for (const name of [...artists].sort((a, b) => b.length - a.length)) {
    const rest = stripPrefix(text, name)
    if (rest === null) continue
    if (!rest) return [name, '', '']
    for (const char of [...chars].sort((a, b) => b.length - a.length)) {
      const rest2 = stripPrefix(rest, char)
      if (rest2 !== null) return [name, char, rest2]
    }
    return [name, '', rest]
  }
  for (const name of [...chars].sort((a, b) => b.length - a.length)) {
    const rest = stripPrefix(text, name)
    if (rest === null) continue
    if (!rest) return ['', name, '']
    for (const artist of [...artists].sort((a, b) => b.length - a.length)) {
      const rest2 = stripPrefix(rest, artist)
      if (rest2 !== null) return [artist, name, rest2]
    }
    return ['', name, rest]
  }
  return null
}

export function planAddPic(rawText, index) {
  const { artists, chars } = localNames(index)
  const tokens = String(rawText ?? '').trim().split(/\s+/).filter(Boolean)

  const looksArtist = token => {
    const [hit, choices] = lookupLocal(token, artists)
    return Boolean(hit || choices.length)
  }
  const looksChar = token => {
    const resolved = resolveCharName(token)
    if (chars.includes(resolved) || CHAR_PINYIN_MAP[token.toLowerCase()]) return true
    const [hit, choices] = lookupLocal(resolved, chars)
    return Boolean(hit || choices.length)
  }

  const build = (artist, role, emotion) => {
    const resolvedRole = role ? resolveCharName(role) : ''
    const [artistHit, artistChoices] = artist ? lookupLocal(artist, artists) : ['', []]
    const [roleHit, roleChoices] = resolvedRole ? lookupLocal(resolvedRole, chars) : ['', []]
    return {
      artist: artistHit || artist,
      role: roleHit || resolvedRole,
      emotion,
      artist_choices: artistChoices,
      role_choices: roleChoices,
      artist_local: Boolean(artistHit),
      role_local: Boolean(roleHit)
    }
  }

  const labeled = parseLabeledTokens(rawText)
  if (labeled) return build(...labeled)

  const known = splitKnownPrefix(String(rawText ?? '').trim(), artists, chars)
  if (known) return build(...known)

  if (tokens.length >= 3) {
    const [first, second] = tokens
    const third = tokens.slice(2).join(' ')
    if (looksChar(first) && looksArtist(second)) return build(second, first, third)
    return build(first, second, third)
  }

  if (tokens.length === 2) {
    const [first, second] = tokens
    if (looksChar(first) && !looksArtist(second)) return build('', first, second)
    if (looksArtist(first) && !looksChar(second)) return build(first, '', second)
    if (looksArtist(first) && looksChar(second)) return build(first, second, '')
    if (!looksArtist(first) && looksChar(second)) return build('', second, first)
    return build('', first, second)
  }

  if (tokens.length === 1) {
    const token = tokens[0]
    if (looksArtist(token)) return build(token, '', '')
    if (looksChar(token)) return build('', token, '')
    return build('', '', token)
  }

  return build('', '', '')
}

export async function confirmLocalName(e, kind, raw, choices) {
  const shown = choices.slice(0, 10)
  const listing = shown.map((name, index) => `${index + 1}. ${name}`).join('\n')
  const more = choices.length > shown.length ? `\n（另有 ${choices.length - shown.length} 个同名项未列出）` : ''
  await sendText(e, `「${raw}」在本地匹配到多个${kind}：\n${listing}${more}\n回复序号选一个，或回复完整名称按新${kind}创建。`)
  const resp = await waitFor(e, ev => isSameUser(ev, e), 30000)
  if (!resp) return null
  const answer = eventText(resp).replace(/^#/, '').trim()
  if (!answer) return null
  if (/^\d+$/.test(answer)) {
    const picked = Number(answer)
    return picked >= 1 && picked <= shown.length ? shown[picked - 1] : null
  }
  return answer
}

export async function getEventImageBuffer(e) {
  const sources = imageSources(e)
  if (!sources.length) return null
  for (const src of sources) {
    const buffer = await fetchImageBuffer(src)
    if (buffer?.length) return buffer
  }
  return null
}

export async function waitForImage(e, timeout = 30000) {
  const resp = await waitFor(e, ev => isSameUser(ev, e) && imageSources(ev).length > 0, timeout)
  if (!resp) return null
  return getEventImageBuffer(resp)
}

export function imageMissingText(pic) {
  return `图片文件不存在：${pic.file}`
}

export { escapeHtml, truncate, renderRank, getGroupRole, setConfig, SUPPORTED_EXTS, uniqueStem, loadIndex, API_DIR_NAME }
