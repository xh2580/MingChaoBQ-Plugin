const pending = new Map()
const seen = new WeakSet()
let installed = false

function keyOf(e) {
  return `${e.group_id || 'private'}:${e.user_id || ''}`
}

export function ensureListener() {
  if (installed) return
  const bot = global.Bot
  if (!bot?.on) return
  installed = true

  const handler = e => {
    if (!e || typeof e !== 'object') return
    if (seen.has(e)) return
    seen.add(e)
    const item = pending.get(keyOf(e))
    if (!item) return
    let matched = false
    try {
      matched = item.predicate(e)
    } catch {
      matched = false
    }
    if (!matched) return
    pending.delete(keyOf(e))
    clearTimeout(item.timer)
    item.resolve(e)
  }

  for (const event of ['message.group', 'message.private', 'message']) {
    bot.on(event, handler)
  }
}

export function waitFor(e, predicate, timeout = 30000) {
  ensureListener()
  const key = keyOf(e)
  return new Promise(resolve => {
    const old = pending.get(key)
    if (old) {
      clearTimeout(old.timer)
      old.resolve(null)
    }
    const item = {
      predicate,
      resolve,
      timer: setTimeout(() => {
        if (pending.get(key) === item) pending.delete(key)
        resolve(null)
      }, timeout)
    }
    pending.set(key, item)
  })
}

export function eventText(e) {
  if (typeof e.msg === 'string') return e.msg
  if (typeof e.raw_message === 'string') return e.raw_message
  if (Array.isArray(e.message)) {
    return e.message.filter(seg => seg.type === 'text').map(seg => seg.data?.text || '').join('')
  }
  return ''
}

export function imageSources(e) {
  if (Array.isArray(e.img) && e.img.length) return e.img
  const sources = []
  if (Array.isArray(e.message)) {
    for (const seg of e.message) {
      if (seg.type !== 'image') continue
      const src = seg.data?.url || seg.data?.file
      if (src) sources.push(src)
    }
  }
  return sources
}

export function hasImage(e) {
  return imageSources(e).length > 0
}

export function parseChoice(text, total) {
  const match = String(text ?? '').match(/\d+/)
  if (!match) return null
  const value = Number(match[0])
  return value >= 1 && value <= total ? value - 1 : null
}

export function isSameUser(e, target) {
  return String(e.user_id) === String(target.user_id) && String(e.group_id || '') === String(target.group_id || '')
}
