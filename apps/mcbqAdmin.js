import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import plugin from '../../../lib/plugins/plugin.js'
import { dataRoot } from '../model/paths.js'
import { getBool, getInt, getList, setConfig } from '../model/config.js'
import { commandArg } from '../model/command.js'
import { API_DIR_NAME, cleanTmpFiles, countPics, loadIndex, rebuildIndex } from '../model/indexer.js'
import { ensurePack, needInstall } from '../model/builtin.js'
import { fetchUnblocked, fetchByEmojis, findSitePack, formatRoleDetail, getEventImageBuffer, planAddPic, roleFileCounts, sendText, siteFetchMax, confirmLocalName, waitForImage, expandBlockWords, checkPm, isMaster } from '../model/core.js'
import * as siteApi from '../model/site.js'
import { detectImageSuffix, safeName, uniqueStem } from '../model/utils.js'

const DEFAULT_ARTIST = '自定义'
const DEFAULT_ROLE = '综合'

export class MingChaoBQAdmin extends plugin {
  constructor() {
    super({
      name: '鸣潮表情包管理',
      dsc: '鸣潮表情包管理命令',
      event: 'message',
      priority: 99,
      rule: [
        { reg: '^#?(bq|鸣潮)?(添加表情|导入表情|上传表情|传表情|加表情|添加鸣潮表情|上传鸣潮表情|传鸣潮表情)(\\s|$)', fnc: 'addPic' },
        { reg: '^#?(bq|鸣潮)?(更新索引|刷新图库|重扫表情)$', fnc: 'updateIndex' },
        { reg: '^#?(bq|鸣潮)?(下载表情包|下载内置表情|重装内置表情)$', fnc: 'downloadPack' },
        { reg: '^#?(bq|鸣潮)?(拉取角色|网站拉取|从网站拉取)(\\s|$)', fnc: 'fetchRole' },
        { reg: '^#?(bq|鸣潮)?(拉取画师|按画师拉取)(\\s|$)', fnc: 'fetchArtist' },
        { reg: '^#?(bq|鸣潮)?(拉取表情包|拉取包|小站拉包)(\\s|$)', fnc: 'fetchPack' },
        { reg: '^#?(bq|鸣潮)?(屏蔽表情|屏蔽词)(\\s|$)', fnc: 'blockAdd' },
        { reg: '^#?(bq|鸣潮)?(解除屏蔽|取消屏蔽)(\\s|$)', fnc: 'blockRemove' },
        { reg: '^#?(bq|鸣潮)?(查看屏蔽|屏蔽清单)$', fnc: 'blockShow' },
        { reg: '^#?(bq|鸣潮)?(开启戳一戳|打开戳一戳)$', fnc: 'enablePoke' },
        { reg: '^#?(bq|鸣潮)?(关闭戳一戳|关掉戳一戳)$', fnc: 'disablePoke' }
      ]
    })
  }

  async addPic() {
    const e = this.e
    if (!checkPm(e, getInt('mcbq_upload_pm', 0))) return

    const index = await loadIndex()
    const raw = commandArg(e, ['添加表情', '导入表情', '上传表情', '传表情', '加表情', '添加鸣潮表情', '上传鸣潮表情', '传鸣潮表情'])
    const plan = planAddPic(raw || '', index)
    const artists = Object.keys(index).filter(name => name !== API_DIR_NAME).sort()
    const chars = [...new Set(Object.values(index).flatMap(item => Object.keys(item)))].filter(name => name !== '_default').sort()

    if (plan.artist_choices.length) {
      const picked = await confirmLocalName(e, '画师', plan.artist, plan.artist_choices)
      if (picked === null) return sendText(e, '已取消：没有选定画师。')
      const hit = artists.find(name => name.replace(/\s+/g, '').toLowerCase() === picked.replace(/\s+/g, '').toLowerCase())
      plan.artist = hit || picked
      plan.artist_local = Boolean(hit)
    }
    if (plan.role_choices.length) {
      const picked = await confirmLocalName(e, '角色', plan.role, plan.role_choices)
      if (picked === null) return sendText(e, '已取消：没有选定角色。')
      const hit = chars.find(name => name.replace(/\s+/g, '').toLowerCase() === picked.replace(/\s+/g, '').toLowerCase())
      plan.role = hit || picked
      plan.role_local = Boolean(hit)
    }

    const artistClean = plan.artist ? safeName(plan.artist) : ''
    const roleClean = plan.role ? safeName(plan.role) : ''
    let emotionClean = plan.emotion ? safeName(plan.emotion) : ''

    for (const [label, value, cleaned] of [['画师', plan.artist, artistClean], ['角色', plan.role, roleClean]]) {
      if (value && cleaned === '未命名') return sendText(e, `${label}名包含非法字符，请重新输入。`)
    }
    if (plan.emotion && emotionClean === '未命名') return sendText(e, '表情名包含非法字符，请重新输入。')

    let image = await getEventImageBuffer(e)
    if (!image) {
      await sendText(e, '请发送要添加的表情图片（30秒内有效）：')
      image = await waitForImage(e, 30000)
    }
    if (!image) return sendText(e, '未接收到有效的图片文件，添加取消。')

    let saveDir
    if (artistClean && roleClean) saveDir = path.join(dataRoot, artistClean, roleClean)
    else if (artistClean) saveDir = path.join(dataRoot, artistClean)
    else if (roleClean) saveDir = path.join(dataRoot, DEFAULT_ARTIST, roleClean)
    else saveDir = path.join(dataRoot, DEFAULT_ARTIST, DEFAULT_ROLE)

    const createdDir = !fs.existsSync(saveDir)
    await fsp.mkdir(saveDir, { recursive: true })

    const ext = detectImageSuffix(image)
    if (!emotionClean) emotionClean = uniqueStem(saveDir, `表情_${Math.floor(Date.now() / 1000) % 10000}`, ext)
    const target = path.join(saveDir, `${emotionClean}${ext}`)
    const overwrote = fs.existsSync(target)
    await fsp.writeFile(target, image)

    try {
      await rebuildIndex()
    } catch (err) {
      global.logger?.warn?.(`[鸣潮表情包·导入] 重建索引异常：${err.message}`)
    }

    const artistShow = plan.artist || DEFAULT_ARTIST
    const roleShow = plan.role || DEFAULT_ROLE
    const matched = []
    if (plan.artist && plan.artist_local) matched.push(`画师「${plan.artist}」用了本地已有目录`)
    if (plan.role && plan.role_local) matched.push(`角色「${plan.role}」用了本地已有目录`)
    const created = []
    if (createdDir && artistClean && !roleClean) created.push(`新建画师目录「${artistShow}」`)
    else if (createdDir && !artistClean && roleClean) created.push(`在「${DEFAULT_ARTIST}」下新建角色目录「${roleShow}」`)
    else if (createdDir && artistClean && roleClean) created.push(`新建目录「${artistShow}/${roleShow}」`)

    let tips = [...matched, ...created].join('；')
    if (overwrote) tips = tips ? `${tips}；覆盖了同名文件` : '覆盖了同名文件'

    await sendText(
      e,
      `已添加：【${artistShow}】${roleShow} · ${path.parse(target).name}\n` +
      `位置：${path.relative(dataRoot, target).split(path.sep).join('/')}` +
      (tips ? `\n${tips}` : '')
    )
  }

  async updateIndex() {
    const e = this.e
    if (!isMaster(e)) return

    if (needInstall() && getBool('mcbq_builtin_auto_fetch')) {
      await sendText(e, '正在下载内置表情包（约 143MB），首次使用会慢一些，请稍候…')
      const { note } = await ensurePack()
      if (note) await sendText(e, note)
    }

    const removed = await cleanTmpFiles(dataRoot)
    if (removed) global.logger?.info?.(`[鸣潮表情包·索引] 清理 ${removed} 个下载残留临时文件`)

    try {
      const index = await rebuildIndex()
      await sendText(e, `索引更新完成！共扫描到 ${countPics(index)} 张表情包。`)
    } catch (err) {
      await sendText(e, `索引生成失败：${err.message}`)
    }
  }

  async downloadPack() {
    const e = this.e
    if (!isMaster(e)) return

    await sendText(e, '开始下载内置表情包（约 143MB），请稍候…')
    const { installed, note } = await ensurePack(true)
    await sendText(e, note || '内置表情包已是最新。')
    if (!installed) return

    try {
      const index = await rebuildIndex()
      await sendText(e, `索引已更新，共 ${countPics(index)} 张表情包。`)
    } catch (err) {
      await sendText(e, `索引生成失败：${err.message}`)
    }
  }

  async fetchRole() {
    const e = this.e
    if (!isMaster(e)) return

    const args = (commandArg(e, ['拉取角色', '网站拉取', '从网站拉取']) || '').split(/\s+/).filter(Boolean)
    if (!args.length) return sendText(e, '请提供角色名，例如：bq拉取角色 今汐 30')

    const role = args[0]
    let want = 20
    if (args[1] && /^\d+$/.test(args[1])) want = Math.min(Math.max(Number(args[1]), 1), siteFetchMax())

    const chars = await siteApi.searchCharacters(role, 5)
    const hit = chars.find(item => item.name === role) || chars[0]
    if (!hit) return sendText(e, `小站上没有找到「${role}」，可先用 bq网站搜索 ${role} 看看。`)

    await sendText(e, `开始拉取「${hit.name}」：目标 ${want} 张，小站共 ${hit.count} 张（已经下过的会自动跳过），请稍候…`)
    await fetchByEmojis(e, hit.name, { character: hit.name, want, totalHint: hit.count })
  }

  async fetchArtist() {
    const e = this.e
    if (!isMaster(e)) return

    const args = (commandArg(e, ['拉取画师', '按画师拉取']) || '').split(/\s+/).filter(Boolean)
    if (!args.length) return sendText(e, '请提供画师名（可用 bq画师列表 查看），例如：bq拉取画师 腐朽的书 30')

    const artist = args[0]
    let want = 20
    let character = ''
    if (args[1]) {
      if (/^\d+$/.test(args[1])) want = Math.min(Math.max(Number(args[1]), 1), siteFetchMax())
      else {
        character = args[1]
        if (args[2] && /^\d+$/.test(args[2])) want = Math.min(Math.max(Number(args[2]), 1), siteFetchMax())
      }
    }

    const artists = await siteApi.listArtists(100)
    const hit = artists.find(item => item.name === artist)
    if (!hit) {
      const near = artists.slice(0, 10).map(item => item.name).join('、')
      return sendText(e, `小站上没有叫「${artist}」的画师。部分画师：${near}（可用 bq画师列表 看全部）`)
    }

    if (character) {
      const label = `${hit.name} 画的 ${character}`
      await sendText(e, `开始拉取「${label}」：目标 ${want} 张（已经下过的会自动跳过），请稍候…`)
      await fetchByEmojis(e, label, { character, artist: hit.name, want })
      return
    }

    await sendText(e, `开始按画师拉取「${hit.name}」：目标 ${want} 张，小站共 ${hit.count} 张（已经下过的会自动跳过），请稍候…`)
    await fetchByEmojis(e, hit.name, { artist: hit.name, want, totalHint: hit.count })
  }

  async fetchPack() {
    const e = this.e
    if (!isMaster(e)) return

    const args = (commandArg(e, ['拉取表情包', '拉取包', '小站拉包']) || '').split(/\s+/).filter(Boolean)
    if (!args.length) return sendText(e, '请提供包名或 slug，例如：bq拉取表情包 wuwa-1-jinhsi')

    const key = args[0]
    let want = 20
    if (args[1] && /^\d+$/.test(args[1])) want = Math.min(Math.max(Number(args[1]), 1), siteFetchMax())

    const hit = await findSitePack(key)
    if (!hit) return sendText(e, `没有找到表情包「${key}」，可先用 bq网站搜索 ${key} 看看包名。`)

    const roleHint = hit.characters.slice(0, 3).join('/') || '各角色'
    await sendText(e, `开始拉取表情包「${hit.title}」（小站共 ${hit.count} 张，涉及 ${roleHint}），请稍候…`)

    const apiRoot = path.join(dataRoot, API_DIR_NAME)
    const before = await roleFileCounts(apiRoot)
    const seen = new Set()
    const targetCount = hit.count ? Math.min(want, hit.count) : want
    let rounds = 0
    while (seen.size < targetCount && rounds < want * 3) {
      rounds++
      const data = await fetchUnblocked('', '', hit.slug)
      if (!data) break
      seen.add(data.name)
    }

    const after = await roleFileCounts(apiRoot)
    const addedMap = {}
    for (const [role, count] of Object.entries(after)) {
      if (count > (before[role] || 0)) addedMap[role] = count - (before[role] || 0)
    }
    const added = Object.values(addedMap).reduce((sum, count) => sum + count, 0)
    if (!added) return sendText(e, '没有拉到新表情（可能都已在本地，或接口暂时不可用）。')

    const index = await rebuildIndex()
    global.logger?.info?.(`[鸣潮表情包·小站] 拉取表情包「${hit.title}」新增 ${added} 张：${JSON.stringify(addedMap)}`)
    await sendText(
      e,
      `已拉取表情包「${hit.title}」${added} 张\n` +
      `各角色：${formatRoleDetail(addedMap)}\n` +
      `所有图按各自角色存入 API/<角色>/，当前索引共 ${countPics(index)} 张。`
    )
  }

  async blockAdd() {
    const e = this.e
    if (!isMaster(e)) return

    const word = commandArg(e, ['屏蔽表情', '屏蔽词'])
    if (!word) return sendText(e, '请提供要屏蔽的关键词，例如：bq屏蔽表情 加载中')

    const words = getList('mcbq_block_list')
    const slugs = await expandBlockWords(word)
    const known = new Set(words.map(item => item.trim().toLowerCase()))
    const missing = slugs.filter(slug => !known.has(slug.toLowerCase()))
    const already = known.has(word.toLowerCase())
    if (already && !missing.length) return sendText(e, `「${word}」已经在屏蔽列表里了。`)

    const merged = [...words]
    if (!already) {
      merged.push(word)
      known.add(word.toLowerCase())
    }
    merged.push(...missing)
    if (!setConfig('mcbq_block_list', merged)) return sendText(e, '写入配置失败，请稍后再试。')

    if (already) return sendText(e, `「${word}」此前只按文字匹配，已补上 ${missing.length} 个表情包 slug，随机也会跳过了。`)
    const note = slugs.length ? `\n命中 ${slugs.length} 个表情包，已一并按 slug 屏蔽（随机接口只认 slug）。` : ''
    await sendText(e, `已屏蔽含「${word}」的网站表情。${note}\n本地已有的不受影响。`)
  }

  async blockRemove() {
    const e = this.e
    if (!isMaster(e)) return

    const word = commandArg(e, ['解除屏蔽', '取消屏蔽'])
    if (!word) return sendText(e, '请提供要解除的关键词，例如：bq解除屏蔽 加载中')

    const words = getList('mcbq_block_list')
    const slugs = await expandBlockWords(word)
    const drop = new Set([word.trim().toLowerCase(), ...slugs.map(slug => slug.toLowerCase())])
    const kept = words.filter(item => !drop.has(item.trim().toLowerCase()))
    if (kept.length === words.length) return sendText(e, `屏蔽列表里没有「${word}」。`)
    if (!setConfig('mcbq_block_list', kept)) return sendText(e, '写入配置失败，请稍后再试。')
    await sendText(e, `已解除对「${word}」的屏蔽。`)
  }

  async blockShow() {
    if (!isMaster(this.e)) return
    const words = getList('mcbq_block_list')
    if (!words.length) return sendText(this.e, '还没有屏蔽任何网站表情。用 bq屏蔽表情 <关键词> 添加。')
    const lines = [`已屏蔽 ${words.length} 个关键词：`, ...words.map(item => `  ${item}`), '\n解除：bq解除屏蔽 <关键词>']
    await sendText(this.e, lines.join('\n'))
  }

  async enablePoke() {
    if (!isMaster(this.e)) return
    setConfig('mcbq_poke_enable', true)
    await sendText(this.e, '戳一戳随机表情功能已【开启】。')
  }

  async disablePoke() {
    if (!isMaster(this.e)) return
    setConfig('mcbq_poke_enable', false)
    await sendText(this.e, '戳一戳随机表情功能已【关闭】。')
  }
}
