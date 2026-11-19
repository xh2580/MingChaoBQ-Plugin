import plugin from '../../../lib/plugins/plugin.js'
import { isGroupAllowed, getGroupRole, setGroupRole } from '../model/whitelist.js'
import { getStatistics } from '../model/statistics.js'
import { loadIndex } from '../model/indexer.js'
import { getBool, getInt } from '../model/config.js'
import { commandArg, suffixArg } from '../model/command.js'
import * as siteApi from '../model/site.js'
import { renderArtistOverview, renderHelp, renderRank } from '../model/render.js'
import { HELP_CATEGORIES } from '../model/helpData.js'
import { startScheduler } from '../model/scheduler.js'
import {
  allCharNames,
  charOf,
  collectAllPics,
  localArtistCounts,
  matchArtistChar,
  matchArtists,
  matchChars,
  matchCharsFuzzy,
  matchEmotions,
  matchLocalArtist,
  parseBurstArgs,
  resolveCharName,
  sendBurstItems,
  sendFromApi,
  sendPic,
  sendText,
  sendWithPicker,
  siteHint,
  tryApi,
  trySiteRandom,
  userPm
} from '../model/core.js'

const ARTIST_LIST_KEYS = new Set(['画师', '画师榜', '画师列表', '小站画师'])

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)]
}

export class MingChaoBQ extends plugin {
  constructor() {
    super({
      name: '鸣潮表情包',
      dsc: '鸣潮表情包随机、列表、上传与小站拉取',
      event: 'message',
      priority: 100,
      rule: [
        { reg: '^#?(bq|鸣潮)?(随机表情|来一张|随便来)(\\s|$)', fnc: 'random' },
        { reg: '^#?(bq|鸣潮)?(本地表情|本地来一张)(\\s|$)', fnc: 'local' },
        { reg: '^#?(bq|鸣潮)?(列表|图库|全部表情)$', fnc: 'allList' },
        { reg: '^#?(bq|鸣潮)?.*列表$', fnc: 'subList' },
        { reg: '^#?(bq|鸣潮)?(连发|连发表情|三连|五连|来三张|来五张)(\\s|$)', fnc: 'burst' },
        { reg: '^#?(bq|鸣潮)?(帮助|表情包帮助)$', fnc: 'help' },
        { reg: '^#?(bq|鸣潮)?(网站搜索|小站搜索)(\\s|$)', fnc: 'siteSearch' },
        { reg: '^#?(bq|鸣潮)?(画师榜|小站画师)$', fnc: 'artistRank' },
        { reg: '^#?(bq|鸣潮)?(戳一戳统计|被戳排行|被戳统计)$', fnc: 'pokeStats' },
        { reg: '^#?(bq|鸣潮)?(表情统计|表情发送统计|表情排行|发送排行)$', fnc: 'roleStats' },
        { reg: '^#?(bq|鸣潮)?(设置戳一戳角色|戳一戳角色)(\\s|$)', fnc: 'setPokeRole' }
      ]
    })
    startScheduler()
  }

  async random() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return

    const keyword = commandArg(e, ['随机表情', '来一张', '随便来'])
    if (keyword === null || keyword.endsWith('列表')) return

    const index = await loadIndex()

    if (!keyword) {
      const data = await tryApi()
      if (data) return sendFromApi(e, data)
      const pics = collectAllPics(index)
      if (!pics.length) return sendText(e, '表情包库是空的，请先运行 bq更新索引。')
      return sendPic(e, randomOf(pics))
    }

    const matchedChars = matchChars(index, keyword)
    const matchedArtists = matchArtists(index, keyword)
    const matchedEmotions = matchEmotions(index, keyword, false)
    const matchedEmotionsFuzzy = matchedEmotions.length ? matchedEmotions : matchEmotions(index, keyword, true)
    const pair = matchArtistChar(index, keyword)

    if (matchedChars.length || (!matchedArtists.length && !pair && !matchedEmotionsFuzzy.length)) {
      const roleParam = matchedChars[0] || keyword
      const data = await tryApi(roleParam)
      if (data) return sendFromApi(e, data)
    }

    const groups = [
      pair ? pair[2] : [],
      matchedChars.flatMap(name => collectAllPics(index, null, name)),
      matchedArtists.flatMap(name => collectAllPics(index, name, null)),
      matchedEmotions,
      matchedEmotionsFuzzy
    ]
    for (const pics of groups) {
      if (pics.length) return sendPic(e, randomOf(pics))
    }

    const data = await trySiteRandom(keyword)
    if (data) return sendFromApi(e, data)

    const hint = await siteHint(keyword)
    await sendText(e, `没有找到「${keyword}」相关的画师、角色或表情。发送 bq列表 查看全部。${hint}`)
  }

  async local() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return

    const keyword = commandArg(e, ['本地表情', '本地来一张'])
    if (keyword === null || keyword.endsWith('列表')) return

    const index = await loadIndex()
    if (!keyword) {
      const pics = collectAllPics(index)
      if (!pics.length) return sendText(e, '本地表情包库是空的，请先运行 bq更新索引。')
      return sendPic(e, randomOf(pics))
    }

    const matchedChars = matchChars(index, keyword)
    const matchedArtists = matchArtists(index, keyword)
    const matchedEmotions = matchEmotions(index, keyword, false)
    const matchedEmotionsFuzzy = matchedEmotions.length ? matchedEmotions : matchEmotions(index, keyword, true)
    const pair = matchArtistChar(index, keyword)

    const groups = [
      pair ? pair[2] : [],
      matchedChars.flatMap(name => collectAllPics(index, null, name)),
      matchedArtists.flatMap(name => collectAllPics(index, name, null)),
      matchedEmotions,
      matchedEmotionsFuzzy
    ]
    for (const pics of groups) {
      if (pics.length) return sendPic(e, randomOf(pics))
    }

    await sendText(e, `本地没有找到「${keyword}」相关的画师、角色或表情。`)
  }

  async allList() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return
    const index = await loadIndex()
    await sendText(e, await renderArtistOverview(index))
  }

  async subList() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return

    const keyword = suffixArg(e, '列表')
    if (keyword === null) return
    if (!keyword) return this.allList()
    if (ARTIST_LIST_KEYS.has(keyword)) return this.artistRank()

    const index = await loadIndex()

    const pair = matchArtistChar(index, keyword)
    if (pair) {
      const [artist, char, combo] = pair
      return sendWithPicker(e, combo, `${artist} ${char}`, `画师「${artist}」角色「${char}」`)
    }

    const matchedChars = matchChars(index, keyword)
    if (matchedChars.length) {
      const pics = matchedChars.flatMap(name => collectAllPics(index, null, name))
      if (pics.length) return sendWithPicker(e, pics, matchedChars[0], `角色「${matchedChars.slice(0, 3).join('/')}」`)
    }

    const matchedArtists = matchArtists(index, keyword)
    if (matchedArtists.length) {
      const pics = matchedArtists.flatMap(name => collectAllPics(index, name, null))
      if (pics.length) {
        return sendWithPicker(e, pics, matchedArtists[0], `画师「${matchedArtists.slice(0, 3).join('/')}」`, true)
      }
    }

    await sendText(e, `没有找到「${keyword}」相关的画师或角色。发送 bq列表 查看全部。`)
  }

  async burst() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return

    const raw = commandArg(e, ['连发', '连发表情', '三连', '五连', '来三张', '来五张'])
    if (raw === null) return
    const command = String(e.msg).replace(/^#/, '').replace(/^(bq|鸣潮)/i, '').trim().split(/\s+/)[0]
    const [count, keyword] = parseBurstArgs(command, raw)

    const index = await loadIndex()
    let matchedChars = []
    let candidates = []

    if (!keyword) {
      candidates = collectAllPics(index)
    } else {
      matchedChars = matchChars(index, keyword)
      const matchedArtists = matchArtists(index, keyword)
      const matchedEmotions = matchEmotions(index, keyword, false)
      const matchedEmotionsFuzzy = matchedEmotions.length ? matchedEmotions : matchEmotions(index, keyword, true)

      for (const pics of [
        matchedChars.flatMap(name => collectAllPics(index, null, name)),
        matchedArtists.flatMap(name => collectAllPics(index, name, null)),
        matchedEmotions,
        matchedEmotionsFuzzy
      ]) {
        if (pics.length) {
          candidates = pics
          break
        }
      }

      if (!candidates.length) {
        const fuzzyChars = matchCharsFuzzy(index, keyword)
        if (fuzzyChars.length) candidates = fuzzyChars.flatMap(name => collectAllPics(index, null, name))
      }
    }

    const roleParam = matchedChars[0] || keyword
    const items = []
    if (getBool('mcbq_api_enable')) {
      for (let i = 0; i < count; i++) {
        const data = await tryApi(roleParam)
        if (!data) break
        items.push(data)
      }
    }

    if (items.length < count && candidates.length) {
      const need = count - items.length
      const pool = [...candidates]
      for (let i = 0; i < need && pool.length; i++) {
        const index = Math.floor(Math.random() * pool.length)
        items.push(pool.splice(index, 1)[0])
      }
    }

    if (!items.length) {
      return sendText(e, keyword ? `没有找到「${keyword}」相关的画师、角色或表情。发送 bq列表 查看全部。` : '表情包库是空的，请先运行 bq更新索引。')
    }

    await sendBurstItems(e, items)
  }

  async help() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return
    await sendText(e, await renderHelp(HELP_CATEGORIES, userPm(e)))
  }

  async siteSearch() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return

    const keyword = commandArg(e, ['网站搜索', '小站搜索'])
    if (!keyword) return sendText(e, '请提供关键词，例如：bq网站搜索 今汐')

    const chars = await siteApi.searchCharacters(keyword, 10)
    const packs = await siteApi.listPacksByCharacter(keyword, 15)
    if (!chars.length && !packs.length) return sendText(e, `小站上没有找到与「${keyword}」相关的角色或表情包。`)

    const lines = [`[搜索] 呜哇小站 · 搜索「${keyword}」`]
    if (chars.length) {
      lines.push(`\n【角色】匹配到 ${chars.length} 个`)
      for (const item of chars.slice(0, 8)) lines.push(`  ${item.name}：${item.count} 张 · ${item.packCount} 个包`)
    }
    if (packs.length) {
      const total = packs.reduce((sum, item) => sum + item.count, 0)
      lines.push(`\n【表情包】${packs.length} 个，合计 ${total} 张`)
      for (const pack of packs.slice(0, 10)) {
        const artist = pack.artists.slice(0, 2).join('/') || '官方转发'
        lines.push(`  ${pack.title}（${pack.count} 张 · ${artist}）`)
      }
    }
    lines.push(`\n拉到本地：bq拉取角色 ${keyword} 30`)
    lines.push('按画师拉取：bq拉取画师 <画师名> 30')
    await sendText(e, lines.join('\n'))

    const rows = []
    const labels = {}
    for (const char of chars) {
      const key = `角色 · ${char.name}`
      rows.push([key, char.count])
      labels[key] = [char.name, `${char.packCount} 个包`]
    }
    for (const pack of packs.slice(0, 12)) {
      const artist = pack.artists.slice(0, 2).join('/') || '官方转发'
      const key = `${pack.title.trim()} · ${artist}`
      rows.push([key, pack.count])
      labels[key] = [key, '表情包']
    }
    await sendText(e, await renderRank(`呜哇小站 · 搜索「${keyword}」`, rows, '张', { labels }))
  }

  async artistRank() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return

    const artists = await siteApi.listArtists(100)
    if (!artists.length) return sendText(e, '暂时取不到小站画师列表，稍后再试。')

    const index = await loadIndex()
    const local = localArtistCounts(index)
    const counts = {}
    for (const item of artists) counts[item.name] = matchLocalArtist(item.name, local)

    const ordered = [...artists].sort((a, b) => {
      const aLocal = counts[a.name] > 0 ? 0 : 1
      const bLocal = counts[b.name] > 0 ? 0 : 1
      return aLocal - bLocal || b.count - a.count || a.name.localeCompare(b.name)
    }).slice(0, 30)

    const rows = []
    const labels = {}
    const dim = new Set()
    const groupOf = {}
    let have = 0
    for (const item of ordered) {
      rows.push([item.name, item.count])
      const mine = counts[item.name] || 0
      if (mine > 0) {
        have++
        labels[item.name] = [item.name, `${item.packCount} 个包 · 本地已有 ${mine} 张`]
        groupOf[item.name] = '本地已有（无需拉取）'
      } else {
        dim.add(item.name)
        labels[item.name] = [item.name, `${item.packCount} 个包 · 需拉取`]
        groupOf[item.name] = '小站还有 · 可拉取'
      }
    }

    const extra = `本地已有 ${have} 位 · 需拉取 ${rows.length - have} 位`
    await sendText(e, await renderRank('呜哇小站 · 画师榜', rows, '张', {
      labels,
      dim,
      groupOf,
      summaryExtra: extra,
      keepOrder: true
    }))
  }

  async pokeStats() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return
    if (!e.group_id) return sendText(e, '该命令只能在群聊中使用。')

    const data = await getStatistics()
    const rows = Object.entries(data.poke_users).map(([qq, user]) => [qq, user.count])
    const labels = {}
    const avatars = {}
    for (const [qq, user] of Object.entries(data.poke_users)) {
      labels[qq] = [user.name || qq, qq]
      avatars[qq] = user.avatar || `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=100`
    }
    await sendText(e, await renderRank('戳一戳统计', rows, '次', { labels, avatars }))
  }

  async roleStats() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return
    const data = await getStatistics()
    await sendText(e, await renderRank('角色表情发送统计', Object.entries(data.roles), '次'))
  }

  async setPokeRole() {
    const e = this.e
    if (!isGroupAllowed(e.group_id)) return
    if (!e.group_id) return sendText(e, '该命令只能在群聊里使用。')

    const minPm = getInt('mcbq_poke_set_pm', 3)
    if (userPm(e) > minPm) return sendText(e, `权限不足，本命令需要权限等级 ≤ ${minPm}。`)

    const role = commandArg(e, ['设置戳一戳角色', '戳一戳角色'])
    if (!role) return sendText(e, '用法：bq设置戳一戳角色 角色名\n随机：bq设置戳一戳角色 随机')
    if (role === '随机') {
      setGroupRole(e.group_id, '')
      return sendText(e, '已恢复本群的戳一戳为随机表情。')
    }

    const resolved = resolveCharName(role)
    if (!allCharNames(await loadIndex()).has(resolved)) {
      return sendText(e, `本地没有角色「${role}」，请确认角色名是否正确。`)
    }
    setGroupRole(e.group_id, resolved)
    await sendText(e, `已设置本群戳一戳表情为「${resolved}」。`)
  }
}
