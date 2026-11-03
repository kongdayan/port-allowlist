// Downloads follow the UI locale. Only fixed, reviewed strings are substituted.
export const scriptMessages = [
  ['粘贴设备密钥（不会显示）: ', 'Paste the device token (hidden): '],
  ['粘贴设备密钥（不会显示）', 'Paste the device token (hidden)'],
  ['设备密钥格式不正确。', 'Invalid device token format.'],
  [
    '已安装当前用户的五分钟更新任务；网络切换后也可手动运行此脚本。',
    'Installed a five-minute task for this user. Run the script manually after a network change if needed.',
  ],
  [
    '密钥已保存。Linux 请自行每五分钟运行此脚本：%s',
    'Token saved. On Linux, schedule this script every five minutes: %s',
  ],
  ['请先运行 --setup。', 'Run --setup first.'],
  [
    '已安装当前用户的五分钟更新任务。网络切换后也可手动运行。',
    'Installed a five-minute task for this user. You can also run it manually after changing networks.',
  ],
  ['请先运行 -Setup。', 'Run -Setup first.'],
  [
    '更新失败，请检查网络、设备状态和密钥。',
    'Update failed. Check the network, device status and token.',
  ],
] as const;
export function localizeScript(source: string, locale: string) {
  return locale === 'zh-CN'
    ? source
    : scriptMessages.reduce((text, [zh, en]) => text.replaceAll(zh, en), source);
}
