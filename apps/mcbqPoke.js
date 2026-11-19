import plugin from '../../../lib/plugins/plugin.js'
import { getBool } from '../model/config.js'
import { getGroupRole, isGroupAllowed } from '../model/whitelist.js'
import { recordPoke } from '../model/statistics.js'
import { loadIndex } from '../model/indexer.js'
import { collectAllPics, sendFromApi, sendPic, tryApi } from '../model/core.js'
import { log } from '../model/utils.js'

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)]
}

export class MingChaoBQPoke extends plugin {
  constructor() {
    super({
      name: '鸣潮表情包戳一戳',
      dsc: '戳一戳随机表情与统计',
      event: 'message',
      priority: 100,
      rule: []
    })
    this.install()
  }

  install() {
    const bot = global.Bot
    if (!bot?.on) return
    this.seen = new WeakSet()
    const handler = e => {
      this.handlePoke(e).catch(err => log('warn', `[鸣潮表情包·戳一戳] ${err.message}`))
    }
    for (const event of ['notice.group.poke', 'notice.friend.poke']) {
      bot.on(event, handler)
    }
  }

  isDuplicate(e) {
    if (!e || typeof e !== 'object') return true
    if (this.seen.has(e)) return true
    this.seen.add(e)
    return false
  }

  async handlePoke(e) {
    if (!e || this.isDuplicate(e)) return

    const selfId = String(e.self_id || global.Bot?.uin || '')
    const targetId = String(e.target_id ?? '')
    if (!targetId || targetId !== selfId) return
    if (!isGroupAllowed(e.group_id)) return

    const name = e.sender?.card || e.sender?.nickname || ''
    const avatar = e.user_id ? `https://q1.qlogo.cn/g?b=qq&nk=${e.user_id}&s=100` : ''
    await recordPoke(e.user_id, name, avatar)

    if (!getBool('mcbq_poke_enable')) return

    const role = getGroupRole(e.group_id)
    const data = await tryApi(role)
    if (data) return sendFromApi(e, data)

    const index = await loadIndex()
    let pics = role ? collectAllPics(index, null, role) : []
    if (!pics.length) pics = collectAllPics(index)
    if (!pics.length) {
      log('info', '[鸣潮表情包·戳一戳] 本地索引为空，未发送')
      return
    }
    await sendPic(e, randomOf(pics))
  }
}
