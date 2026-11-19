export function baseText(e) {
  return String(e.msg ?? '')
    .replace(/^#/, '')
    .trim()
    .replace(/^(bq|鸣潮)/i, '')
    .trim()
}

export function commandArg(e, commands) {
  const text = baseText(e)
  for (const command of [...commands].sort((a, b) => b.length - a.length)) {
    if (text === command) return ''
    if (text.startsWith(command)) return text.slice(command.length).trim()
  }
  return null
}

export function suffixArg(e, suffix) {
  const text = baseText(e)
  return text.endsWith(suffix) ? text.slice(0, -suffix.length).trim() : null
}
