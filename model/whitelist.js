import { getBool, getList, setConfig } from './config.js'

/** 总开关 > 黑名单 > 白名单；私聊只受总开关约束 */
export function isGroupAllowed(groupId) {
  if (!getBool('mcbq_enable')) return false
  if (!groupId) return true

  const gid = String(groupId)
  if (getList('mcbq_blacklist').includes(gid)) return false
  if (!getBool('mcbq_whitelist_enable')) return true
  return getList('mcbq_whitelist').includes(gid)
}

export function getGroupRole(groupId) {
  if (!groupId) return ''
  const prefix = `${groupId}:`
  const line = getList('mcbq_poke_group_roles').find(item => item.startsWith(prefix))
  return line ? line.slice(prefix.length).trim() : ''
}

export function setGroupRole(groupId, role) {
  if (!groupId) return
  const prefix = `${groupId}:`
  const kept = getList('mcbq_poke_group_roles').filter(item => !item.startsWith(prefix))
  if (role) kept.push(`${groupId}:${role}`)
  setConfig('mcbq_poke_group_roles', kept)
}
