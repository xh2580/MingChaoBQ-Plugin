import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { configPath } from './paths.js'

export const CONFIG_DEFAULT = {
  mcbq_enable: true,
  mcbq_whitelist_enable: false,
  mcbq_whitelist: [],
  mcbq_blacklist: [],
  mcbq_char_alias: [],
  mcbq_banner_bg: '',
  mcbq_help_bg: '',
  mcbq_image_max_width: '1200',
  mcbq_api_enable: false,
  mcbq_api_timeout: '3',
  mcbq_api_base: 'https://emoji.wuwa.games/apis/api.random-emoji.wuwa.games',
  mcbq_api_token: '',
  mcbq_api_random_path: '/v1alpha1/random',
  mcbq_api_character_param: 'character',
  mcbq_api_save_local: true,
  mcbq_builtin_auto_fetch: true,
  mcbq_builtin_pack_url: '',
  mcbq_site_enable: true,
  mcbq_site_fetch_max: '100',
  mcbq_site_random_fallback: true,
  mcbq_block_list: [],
  mcbq_poke_enable: true,
  mcbq_poke_group_roles: [],
  mcbq_poke_set_pm: '3',
  mcbq_burst_forward: true,
  mcbq_upload_pm: '0',
  mcbq_index_auto_update: true,
  mcbq_index_update_hour: '4',
  mcbq_index_update_minute: '0'
}

let cache = null

function normalize(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const merged = { ...CONFIG_DEFAULT }
  for (const key of Object.keys(CONFIG_DEFAULT)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) merged[key] = data[key]
  }
  return merged
}

function load() {
  if (cache) return cache
  if (!fs.existsSync(configPath)) {
    cache = { ...CONFIG_DEFAULT }
    save()
    return cache
  }
  try {
    const text = fs.readFileSync(configPath, 'utf8')
    cache = normalize(YAML.parse(text))
  } catch (err) {
    global.logger?.warn?.(`[鸣潮表情包] 配置读取失败，使用默认配置：${err.message}`)
    cache = { ...CONFIG_DEFAULT }
  }
  return cache
}

function save() {
  if (!cache) return
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  const tmp = `${configPath}.tmp`
  fs.writeFileSync(tmp, YAML.stringify(cache), 'utf8')
  fs.renameSync(tmp, configPath)
}

export function getRaw(key) {
  return load()[key]
}

export function getBool(key) {
  return load()[key] === true
}

export function getStr(key) {
  const value = load()[key]
  return typeof value === 'string' ? value : ''
}

export function getInt(key, fallback = 0) {
  const value = load()[key]
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  const text = String(value ?? '').trim()
  return /^\d+$/.test(text) ? Number(text) : fallback
}

export function getList(key) {
  const value = load()[key]
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

export function setConfig(key, value) {
  const data = load()
  if (!Object.prototype.hasOwnProperty.call(CONFIG_DEFAULT, key)) return false
  data[key] = value
  save()
  return true
}

export function reloadConfig() {
  cache = null
  return load()
}
