import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { cacheDir, dataIconsDir, iconsDir, dataRoot, pluginIcon } from './paths.js'
import { escapeHtml, truncate } from './utils.js'

let seq = 0

function fileUrl(file) {
  return pathToFileURL(file).href
}

function iconFile(name) {
  if (!name) return null
  const candidates = []
  if (path.isAbsolute(name)) candidates.push(name)
  candidates.push(path.join(dataIconsDir, name), path.join(iconsDir, name))
  for (const file of candidates) {
    if (fs.existsSync(file)) return file
  }
  const fallback = path.join(iconsDir, '通用.png')
  return fs.existsSync(fallback) ? fallback : null
}

function iconTag(name, cls = 'icon') {
  const file = iconFile(name)
  return file ? `<img class="${cls}" src="${fileUrl(file)}" />` : ''
}

function imageTag(file, cls = 'thumb') {
  const full = path.join(dataRoot, file)
  if (!fs.existsSync(full)) return `<div class="${cls} missing"></div>`
  return `<img class="${cls}" src="${fileUrl(full)}" />`
}

function pageHtml(title, body, width = 980) {
  return `<!DOCTYPE html>
<html lang="zh-cn">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${width}px;background:#eaf4fd}
body{font-family:"MiSans","HarmonyOS Sans SC","Microsoft YaHei","PingFang SC",sans-serif;color:#1b2f4a}
.page{width:${width}px;padding:28px;background:linear-gradient(180deg,#f4faff 0%,#e6f2fd 100%)}
.header{display:flex;align-items:center;gap:18px;background:rgba(255,255,255,.92);border:2px solid #c9e0f6;border-radius:18px;padding:20px 24px;margin-bottom:18px}
.header .bar{width:8px;height:52px;border-radius:4px;background:#4a90d9}
.header h1{font-size:30px;color:#184476;line-height:1.25}
.header p{font-size:15px;color:#7694b2;margin-top:6px}
.header .logo{width:56px;height:56px;border-radius:14px;object-fit:cover;background:#fff}
.footer{margin-top:18px;text-align:center;font-size:13px;color:#8aa6c2}
.missing{background:#e2ecf6;border-radius:10px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.card{background:#fff;border:2px solid #c9e0f6;border-radius:12px;padding:10px;display:flex;flex-direction:column;align-items:center;min-height:236px}
.card .thumb{width:100%;height:150px;object-fit:contain;border-radius:8px;background:#fff}
.card .num{font-size:18px;font-weight:700;color:#4a90d9;margin-top:10px}
.card .name{font-size:15px;color:#26405c;margin-top:4px;text-align:center;word-break:break-all}
.card .meta{font-size:12px;color:#7694b2;margin-top:3px;text-align:center;word-break:break-all}
.hidden{margin-top:12px;font-size:14px;color:#7694b2}
.artist-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.artist-card{background:#fff;border:2px solid #c9e0f6;border-radius:16px;padding:16px}
.artist-head{display:flex;align-items:center;gap:10px;border-bottom:2px solid #e2eefb;padding-bottom:10px;margin-bottom:10px}
.artist-head .icon{width:44px;height:44px;border-radius:10px;object-fit:cover;background:#f0f7ff}
.artist-head .name{font-size:19px;font-weight:700;color:#184476}
.artist-head .sub{font-size:12px;color:#7694b2;margin-top:2px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:flex;align-items:center;gap:6px;background:#f2f8ff;border:1px solid #d6e8fa;border-radius:999px;padding:4px 10px 4px 4px;font-size:13px;color:#2f4d6d}
.chip .icon{width:26px;height:26px;border-radius:50%;object-fit:cover;background:#fff}
.chip .count{color:#7694b2;font-size:12px}
.rank-list{display:flex;flex-direction:column;gap:8px}
.group-title{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700;color:#2c76ca;margin:10px 0 2px}
.group-title .bar{width:6px;height:20px;border-radius:3px;background:#2c76ca}
.row{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #96c2ec;border-radius:12px;padding:10px 14px;min-height:64px}
.row.zebra{background:#e2effc}
.row.dim{background:#e9f0f8;border-color:#ccdbea;color:#5c7694}
.row .idx{width:30px;font-size:15px;color:#2c76ca;text-align:right}
.row.dim .idx{color:#6a86a4}
.row .avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;background:#dce9f6}
.row .main{flex:1;min-width:0}
.row .main .title{font-size:18px;font-weight:600;color:#142a46;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row.dim .main .title{color:#5c7694}
.row .main .sub{font-size:13px;color:#5a7ca0;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .count{font-size:18px;font-weight:700;color:#2c76ca;white-space:nowrap}
.row.dim .count{color:#6a86a4}
.help-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.help-card{background:#fff;border:2px solid #c9e0f6;border-radius:16px;padding:16px}
.help-head{display:flex;align-items:center;gap:10px;border-bottom:2px solid #e2eefb;padding-bottom:10px;margin-bottom:10px}
.help-head .icon{width:44px;height:44px;border-radius:10px;object-fit:cover;background:#f0f7ff}
.help-head .name{font-size:19px;font-weight:700;color:#184476}
.help-head .sub{font-size:12px;color:#7694b2;margin-top:2px}
.help-item{display:flex;gap:10px;padding:7px 0;border-bottom:1px dashed #e4eef9}
.help-item:last-child{border-bottom:none}
.help-item .icon{width:30px;height:30px;border-radius:8px;object-fit:cover;background:#f0f7ff;flex:none}
.help-item .title{font-size:15px;font-weight:600;color:#26405c}
.help-item .desc{font-size:12px;color:#7694b2;margin-top:2px;line-height:1.5}
.empty{background:#fff;border:2px dashed #c9e0f6;border-radius:16px;padding:40px;text-align:center;color:#7694b2;font-size:16px}
</style>
</head>
<body><div class="page">${body}<div class="footer">MingChaoBQ · 鸣潮表情包 · Powered by Yunzai</div></div></body>
</html>`
}

async function shot(html, name) {
  const file = path.join(cacheDir, `${name}-${Date.now()}-${seq++}.html`)
  fs.writeFileSync(file, html, 'utf8')
  return puppeteer.screenshot(`mcbq-${name}-${Date.now()}-${seq++}`, { tplFile: file })
}

export async function renderEmotionList(items, keyword, note = '', hint = '', total = null) {
  const shown = items.slice(0, 50)
  const totalCount = total ?? items.length
  const hidden = totalCount - shown.length

  const cards = shown.map((pic, index) => {
    const artist = pic._artist || ''
    const char = pic._char || ''
    const meta = pic.source === 'api' || artist === 'API' ? `API · ${char}` : `${artist} · ${char}`
    return `<div class="card">
      ${imageTag(pic.file)}
      <div class="num">表情${index + 1}</div>
      <div class="name">${escapeHtml(truncate(pic.emotion, 14))}</div>
      <div class="meta">${escapeHtml(truncate(meta, 18))}</div>
    </div>`
  }).join('')

  const parts = [`共 ${totalCount} 个`]
  if (note) parts.push(note)
  if (hint) parts.push(hint)

  const body = `<div class="header"><div class="bar"></div><div><h1>表情「${escapeHtml(truncate(keyword, 24))}」</h1><p>${escapeHtml(parts.join(' · '))}</p></div></div>
  <div class="grid">${cards || '<div class="empty">没有可显示的表情</div>'}</div>
  ${hidden > 0 ? `<div class="hidden">另有 ${hidden} 个未显示，请用更精确的关键词缩小范围</div>` : ''}`

  return shot(pageHtml(`表情「${keyword}」`, body), 'emotion-list')
}

export async function renderArtistOverview(index) {
  const artists = Object.entries(index)
  const cards = artists.map(([artist, chars]) => {
    const charNames = Object.keys(chars).filter(name => name !== '_default')
    let chips = ''
    let sub = ''
    if (charNames.length) {
      chips = charNames.map(name => {
        const count = Object.values(chars[name]).reduce((sum, pics) => sum + pics.length, 0)
        return `<span class="chip">${iconTag(`${name}.png`)}${escapeHtml(name)}<span class="count">${count} 张</span></span>`
      }).join('')
      sub = `共 ${charNames.length} 个角色`
    } else {
      const total = Object.values(chars).reduce((sum, subs) => sum + Object.values(subs).reduce((s, p) => s + p.length, 0), 0)
      chips = `<span class="chip">${iconTag(`${artist}.png`)}（散图）<span class="count">${total} 张未分类</span></span>`
      sub = `${total} 张散图`
    }
    return `<div class="artist-card">
      <div class="artist-head">${iconTag(`${artist}.png`)}<div><div class="name">${escapeHtml(artist)}</div><div class="sub">${escapeHtml(sub)}</div></div></div>
      <div class="chips">${chips}</div>
    </div>`
  }).join('')

  const body = `<div class="header"><img class="logo" src="${fileUrl(pluginIcon)}" /><div><h1>鸣潮表情包 · 画师一览</h1><p>共 ${artists.length} 位画师</p></div></div>
  ${cards ? `<div class="artist-grid">${cards}</div>` : '<div class="empty">图库是空的，请先发送 bq更新索引</div>'}`

  return shot(pageHtml('鸣潮表情包 · 画师一览', body), 'artist-overview')
}

export async function renderRank(title, rows, unit = '次', options = {}) {
  const { labels = {}, avatars = {}, dim = new Set(), summaryExtra = '', keepOrder = false, groupOf = {} } = options
  let shown = keepOrder ? rows.slice(0, 30) : [...rows].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, 30)

  const total = rows.reduce((sum, [, count]) => sum + count, 0)
  let summary = shown.length ? `共 ${total} ${unit} · 显示前 ${shown.length} 项` : '暂无数据'
  if (summaryExtra) summary = `${summary} · ${summaryExtra}`

  let html = ''
  let currentGroup = ''
  shown.forEach(([name, count], index) => {
    const group = groupOf[name] || ''
    if (group && group !== currentGroup) {
      const isDimGroup = dim.has(name)
      html += `<div class="group-title"><span class="bar" style="background:${isDimGroup ? '#6a86a4' : '#2c76ca'}"></span>${escapeHtml(group)}</div>`
      currentGroup = group
    }
    const isDim = dim.has(name)
    const label = labels[name] || [name, '']
    const sub = label[1] && label[1] !== label[0] ? label[1] : ''
    const avatar = avatars[name]
      ? `<img class="avatar" src="${escapeHtml(avatars[name])}" />`
      : ''
    html += `<div class="row ${isDim ? 'dim' : (index % 2 ? 'zebra' : '')}">
      <div class="idx">${index + 1}</div>
      ${avatar}
      <div class="main"><div class="title">${escapeHtml(truncate(label[0], 40))}</div>${sub ? `<div class="sub">${escapeHtml(truncate(sub, 48))}</div>` : ''}</div>
      <div class="count">${count} ${escapeHtml(unit)}</div>
    </div>`
  })

  const body = `<div class="header"><div class="bar"></div><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p></div></div>
  <div class="rank-list">${html || '<div class="empty">暂无数据</div>'}</div>`

  return shot(pageHtml(title, body), 'rank')
}

export async function renderHelp(categories, userPm = 6, version = '1.0.0') {
  const visible = categories.filter(cat => cat.pm === undefined || userPm <= cat.pm)
  const cards = visible.map(cat => {
    const items = (cat.data || []).map(item => `<div class="help-item">${iconTag(item.icon || cat.icon)}<div><div class="title">${escapeHtml(item.name)}</div><div class="desc">${escapeHtml(item.eg || '')}</div></div></div>`).join('')
    return `<div class="help-card" style="border-color:${escapeHtml(cat.color || '#c9e0f6')}33">
      <div class="help-head">${iconTag(cat.icon)}<div><div class="name">${escapeHtml(cat.name)}</div><div class="sub">${escapeHtml(cat.help || cat.desc || '')}</div></div></div>
      ${items}
    </div>`
  }).join('')

  const body = `<div class="header"><img class="logo" src="${fileUrl(pluginIcon)}" /><div><h1>鸣潮表情包 · 使用帮助</h1><p>v${escapeHtml(version)} · 回复 bq帮助 可再次查看</p></div></div>
  ${cards ? `<div class="help-grid">${cards}</div>` : '<div class="empty">没有可显示的命令</div>'}`

  return shot(pageHtml('鸣潮表情包 · 使用帮助', body, 1000), 'help')
}

export function dataFileUrl(file) {
  return fileUrl(path.join(dataRoot, file))
}
