import fs from 'node:fs'
import { statisticsPath } from './paths.js'
import { log, readJson, writeJsonAtomic } from './utils.js'

let lock = Promise.resolve()

function emptyStats() {
  return { poke_users: {}, roles: {} }
}

function readPokeUsers(raw) {
  const users = {}
  if (!raw || typeof raw !== 'object') return users
  for (const [key, value] of Object.entries(raw)) {
    if (Number.isInteger(value) && value >= 0) {
      users[key] = { count: value, name: key, avatar: '' }
      continue
    }
    if (!value || typeof value !== 'object') continue
    const count = Number.isInteger(value.count) ? value.count : 0
    const name = typeof value.name === 'string' ? value.name : key
    const avatar = typeof value.avatar === 'string' ? value.avatar : ''
    if (count >= 0) users[key] = { count, name, avatar }
  }
  return users
}

function readRoles(raw) {
  const roles = {}
  if (!raw || typeof raw !== 'object') return roles
  for (const [key, value] of Object.entries(raw)) {
    if (Number.isInteger(value) && value >= 0) roles[key] = value
  }
  return roles
}

async function load() {
  if (!fs.existsSync(statisticsPath)) return emptyStats()
  const raw = await readJson(statisticsPath, null)
  if (!raw || typeof raw !== 'object') return emptyStats()
  return { poke_users: readPokeUsers(raw.poke_users), roles: readRoles(raw.roles) }
}

async function save(data) {
  await writeJsonAtomic(statisticsPath, data)
}

function withLock(task) {
  const next = lock.then(task, task)
  lock = next.catch(err => log('warn', `[鸣潮表情包·统计] 写入失败：${err.message}`))
  return next
}

export function recordPoke(userId, name, avatar) {
  const key = String(userId ?? '').trim()
  if (!key) return Promise.resolve()
  return withLock(async () => {
    const data = await load()
    const user = data.poke_users[key] || { count: 0, name: key, avatar: '' }
    user.count += 1
    if (name && String(name).trim()) user.name = String(name).trim()
    if (avatar && String(avatar).trim()) user.avatar = String(avatar).trim()
    data.poke_users[key] = user
    await save(data)
  })
}

export function recordRole(role) {
  const key = String(role ?? '').trim()
  if (!key) return Promise.resolve()
  return withLock(async () => {
    const data = await load()
    data.roles[key] = (data.roles[key] || 0) + 1
    await save(data)
  })
}

export async function getStatistics() {
  await lock
  return load()
}
