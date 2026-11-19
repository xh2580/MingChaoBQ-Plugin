import { getBool } from './config.js'
import { isBlocked } from './blocklist.js'
import { fetchJson } from './utils.js'

const SITE_API = 'https://emoji.wuwa.games/apis/api.random-emoji.wuwa.games/v1alpha1'
const MAX_SIZE = 100
const EMOJI_MAX_SIZE = 50

function asInt(value) {
  return Number.isInteger(value) ? value : 0
}

function asStr(value) {
  return typeof value === 'string' ? value : ''
}

function parseCharacter(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = asStr(raw.name)
  if (!name) return null
  return { slug: asStr(raw.slug), name, count: asInt(raw.count), packCount: asInt(raw.packCount) }
}

function parseArtist(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = asStr(raw.name)
  if (!name) return null
  return { slug: asStr(raw.slug), name, count: asInt(raw.count), packCount: asInt(raw.packCount) }
}

function names(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(item => (item && typeof item === 'object' ? asStr(item.name) : '')).filter(Boolean)
}

function parsePack(raw) {
  if (!raw || typeof raw !== 'object') return null
  const title = asStr(raw.title).trim()
  if (!title) return null
  return {
    slug: asStr(raw.slug),
    title,
    count: asInt(raw.count),
    artists: names(raw.artists),
    characters: names(raw.characters)
  }
}

function parseEmoji(raw) {
  if (!raw || typeof raw !== 'object') return null
  const url = asStr(raw.url)
  if (!url) return null
  const characters = names(raw.characters)
  const artists = names(raw.artists)
  const packTitle = raw.pack && typeof raw.pack === 'object' ? asStr(raw.pack.title).trim() : ''
  return {
    id: asStr(raw.id),
    url,
    format: asStr(raw.format),
    character: characters[0] || '',
    artist: artists[0] || '',
    pack_title: packTitle
  }
}

async function getJson(path, params) {
  if (!getBool('mcbq_site_enable')) return null
  return fetchJson(`${SITE_API}/${path}`, params, 15000)
}

function items(data) {
  return data && typeof data === 'object' && Array.isArray(data.items) ? data.items : []
}

export async function searchCharacters(keyword, limit = 20) {
  if (!keyword.trim()) return []
  const data = await getJson('characters', { q: keyword.trim(), page: 1, size: Math.min(limit, MAX_SIZE) })
  return items(data).map(parseCharacter).filter(Boolean)
}

export async function listCharacters(limit = MAX_SIZE) {
  const data = await getJson('characters', { page: 1, size: Math.min(limit, MAX_SIZE) })
  return items(data).map(parseCharacter).filter(Boolean)
}

export async function listArtists(limit = MAX_SIZE) {
  const data = await getJson('artists', { page: 1, size: Math.min(limit, MAX_SIZE) })
  return items(data).map(parseArtist).filter(Boolean)
}

export async function listPacksByCharacter(character, limit = MAX_SIZE) {
  if (!character.trim()) return []
  const data = await getJson('packs', { character: character.trim(), page: 1, size: Math.min(limit, MAX_SIZE) })
  return items(data).map(parsePack).filter(Boolean)
}

export async function listPacks(page = 1, size = MAX_SIZE) {
  const data = await getJson('packs', { page: Math.max(1, page), size: Math.min(size, MAX_SIZE) })
  return items(data).map(parsePack).filter(Boolean)
}

export async function listEmojis(character = '', artist = '', page = 1, size = EMOJI_MAX_SIZE) {
  const params = { page: Math.max(1, page), size: Math.min(size, EMOJI_MAX_SIZE) }
  if (character.trim()) params.character = character.trim()
  if (artist.trim()) params.artist = artist.trim()
  if (!character.trim() && !artist.trim()) return []

  const data = await getJson('emojis', params)
  return items(data)
    .map(parseEmoji)
    .filter(Boolean)
    .filter(item => !isBlocked(item.id, item.character, item.artist, item.pack_title))
}
