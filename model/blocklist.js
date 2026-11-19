import { getList } from './config.js'

export function blockedKeywords() {
  const words = []
  for (const item of getList('mcbq_block_list')) {
    const word = item.trim().toLowerCase()
    if (word && !words.includes(word)) words.push(word)
  }
  return words
}

export function isBlocked(...texts) {
  const words = blockedKeywords()
  if (!words.length) return false
  const joined = texts.filter(Boolean).join(' ').toLowerCase()
  if (!joined) return false
  return words.some(word => joined.includes(word))
}
