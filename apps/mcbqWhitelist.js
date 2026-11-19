import plugin from '../../../lib/plugins/plugin.js'
import { getBool, getList, setConfig } from '../model/config.js'
import { commandArg } from '../model/command.js'
import { isMaster, sendText } from '../model/core.js'

export class MingChaoBQWhitelist extends plugin {
  constructor() {
    super({
      name: '鸣潮表情包黑白名单',
      dsc: '鸣潮表情包群白名单与黑名单',
      event: 'message',
      priority: 99,
      rule: [
        { reg: '^#?(bq|鸣潮)?(开启白名单)$', fnc: 'enableWhitelist' },
        { reg: '^#?(bq|鸣潮)?(关闭白名单)$', fnc: 'disableWhitelist' },
        { reg: '^#?(bq|鸣潮)?(添加白名单)(\\s|$)', fnc: 'addWhitelist' },
        { reg: '^#?(bq|鸣潮)?(移除白名单)(\\s|$)', fnc: 'removeWhitelist' },
        { reg: '^#?(bq|鸣潮)?(查看白名单)$', fnc: 'listWhitelist' },
        { reg: '^#?(bq|鸣潮)?(添加黑名单)(\\s|$)', fnc: 'addBlacklist' },
        { reg: '^#?(bq|鸣潮)?(移除黑名单)(\\s|$)', fnc: 'removeBlacklist' },
        { reg: '^#?(bq|鸣潮)?(查看黑名单)$', fnc: 'listBlacklist' }
      ]
    })
  }

  async enableWhitelist() {
    if (!isMaster(this.e)) return
    setConfig('mcbq_whitelist_enable', true)
    await sendText(this.e, '鸣潮表情包群白名单已【开启】，只有白名单中的群可以使用本插件。')
  }

  async disableWhitelist() {
    if (!isMaster(this.e)) return
    setConfig('mcbq_whitelist_enable', false)
    await sendText(this.e, '鸣潮表情包群白名单已【关闭】，所有群均可使用本插件（黑名单除外）。')
  }

  async addWhitelist() {
    if (!isMaster(this.e)) return
    const groupId = commandArg(this.e, ['添加白名单'])
    if (!groupId) return sendText(this.e, '请输入要添加的群号，例如：bq添加白名单 123456789')
    const current = getList('mcbq_whitelist')
    if (current.includes(groupId)) return sendText(this.e, `群 ${groupId} 已经在白名单中了。`)
    current.push(groupId)
    setConfig('mcbq_whitelist', current)
    await sendText(this.e, `已添加群 ${groupId} 到白名单。`)
  }

  async removeWhitelist() {
    if (!isMaster(this.e)) return
    const groupId = commandArg(this.e, ['移除白名单'])
    if (!groupId) return sendText(this.e, '请输入要移除的群号，例如：bq移除白名单 123456789')
    const current = getList('mcbq_whitelist')
    if (!current.includes(groupId)) return sendText(this.e, `群 ${groupId} 不在白名单中。`)
    setConfig('mcbq_whitelist', current.filter(item => item !== groupId))
    await sendText(this.e, `已从白名单中移除群 ${groupId}。`)
  }

  async listWhitelist() {
    if (!isMaster(this.e)) return
    const enabled = getBool('mcbq_whitelist_enable')
    const current = getList('mcbq_whitelist')
    if (!enabled) return sendText(this.e, '群白名单当前【未启用】，所有群均可使用（黑名单除外）。')
    if (!current.length) return sendText(this.e, '群白名单已启用，但列表为空（没有任何群可以使用）。')
    await sendText(this.e, `当前白名单群号：\n${current.map(item => `  - ${item}`).join('\n')}`)
  }

  async addBlacklist() {
    if (!isMaster(this.e)) return
    const groupId = commandArg(this.e, ['添加黑名单'])
    if (!groupId) return sendText(this.e, '请输入要添加的群号，例如：bq添加黑名单 123456789')
    const current = getList('mcbq_blacklist')
    if (current.includes(groupId)) return sendText(this.e, `群 ${groupId} 已经在黑名单中了。`)
    current.push(groupId)
    setConfig('mcbq_blacklist', current)
    await sendText(this.e, `已添加群 ${groupId} 到黑名单，该群将无法使用本插件。`)
  }

  async removeBlacklist() {
    if (!isMaster(this.e)) return
    const groupId = commandArg(this.e, ['移除黑名单'])
    if (!groupId) return sendText(this.e, '请输入要移除的群号，例如：bq移除黑名单 123456789')
    const current = getList('mcbq_blacklist')
    if (!current.includes(groupId)) return sendText(this.e, `群 ${groupId} 不在黑名单中。`)
    setConfig('mcbq_blacklist', current.filter(item => item !== groupId))
    await sendText(this.e, `已从黑名单中移除群 ${groupId}。`)
  }

  async listBlacklist() {
    if (!isMaster(this.e)) return
    const current = getList('mcbq_blacklist')
    if (!current.length) return sendText(this.e, '黑名单为空，没有任何群被禁用。')
    await sendText(this.e, `当前黑名单群号：\n${current.map(item => `  - ${item}`).join('\n')}`)
  }
}
