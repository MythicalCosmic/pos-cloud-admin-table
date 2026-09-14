// Lucide artwork (ISC); semantic aliases keep existing page APIs stable.
// Only the icons used by the interface are shipped to the browser.
const fs = require('node:fs')
const { parse } = require('@vue/compiler-dom')
const { icons, aliases = {} } = require('@iconify-json/lucide/icons.json')
const names = {
  dashboard: 'panels-top-left', ai: 'sparkles', clock: 'clock-3', users: 'users-round', grid: 'layout-grid', box: 'box',
  receipt: 'receipt-text', table: 'table-2', tag: 'tag', register: 'calculator', gift: 'gift', employee: 'contact-round',
  building: 'building-2', coins: 'coins', chart: 'chart-no-axes-combined', search: 'search', bell: 'bell',
  chevdown: 'chevron-down', chevleft: 'chevron-left', chevright: 'chevron-right', plus: 'plus', edit: 'square-pen',
  trash: 'trash-2', pause: 'pause', play: 'play', dollar: 'banknote', close: 'x', check: 'check', checkcircle: 'circle-check',
  sortup: 'chevron-up', sortdown: 'chevron-down', sort: 'arrow-down-up', arrowup: 'arrow-up', arrowdown: 'arrow-down',
  calendar: 'calendar-days', filter: 'list-filter', refresh: 'refresh-cw', sun: 'sun', moon: 'moon', layout: 'panel-left',
  translate: 'languages', alert: 'triangle-alert', info: 'info', wallet: 'wallet', trend: 'trending-up', package: 'package',
  more: 'ellipsis', download: 'download', lock: 'lock-keyhole', mail: 'mail', eye: 'eye', eyeoff: 'eye-off', arrowright: 'arrow-right',
  user: 'user-round', userok: 'user-round-check', logout: 'log-out', sliders: 'sliders-horizontal', inbox: 'inbox',
  dept: 'network', store: 'store', flag: 'flag', star: 'star', target: 'goal', send: 'arrow-up', stop: 'square',
  sparkle: 'sparkles', copy: 'copy', belloff: 'bell-off', menu: 'menu', pencil: 'pencil', retry: 'rotate-ccw', gear: 'settings-2',
  list: 'list', bars: 'chart-column-increasing', hourglass: 'hourglass', share: 'share-2',
  file: 'file-text', upload: 'upload', link: 'link', key: 'key-round', save: 'save', shield: 'shield-check', history: 'history',
  'arrowleft': 'arrow-left', 'chevup': 'chevron-up', 'minus': 'minus', 'pin': 'pin', 'pinoff': 'pin-off', 'expand': 'maximize-2',
  'collapse': 'minimize-2', 'external': 'arrow-up-right', 'attachment': 'paperclip', 'card': 'credit-card', 'phone': 'phone',
  'image': 'image', 'check-square': 'square-check', 'square': 'square', 'circle': 'circle', 'circle-dot': 'circle-dot',
  document: 'file-text', group: 'users-round', folder: 'folder', warning: 'triangle-alert',
  'plus-circle': 'circle-plus', 'minus-circle': 'circle-minus', restore: 'history', camera: 'camera',
  settings: 'settings-2', barcode: 'barcode', unlock: 'lock-keyhole-open', unlink: 'unlink',
  weight: 'weight', loader: 'loader-circle', exchange: 'arrow-left-right',
  'ws-menu': 'notebook-tabs', 'ws-customers': 'handshake', 'ws-team': 'contact-round',
  'ws-calendar': 'calendar-range', 'ws-target': 'scan-eye', 'ws-payroll': 'badge-dollar-sign',
  'ws-shift': 'calendar-clock', 'ws-finance': 'vault', 'ws-analytics': 'chart-no-axes-combined',
  'ws-warehouse': 'warehouse', 'ws-delivery': 'truck', 'ws-inventory': 'clipboard-list',
  'ws-transfer': 'route', 'ws-recipe': 'cooking-pot', 'ws-catalog': 'boxes',
  'ws-notification': 'radio', 'ws-settings': 'panels-top-left', 'ws-license': 'badge-check',
  'ws-location': 'map-pinned', 'ws-dining': 'armchair', 'ws-product': 'utensils-crossed',
  'ws-qr': 'qr-code', 'ws-discount': 'badge-percent', 'ws-session': 'monitor-smartphone',
}
const legacy = {
  'bar-chart': 'bars', 'bar-chart-alt-2': 'bars', 'bar-chart-square': 'chart', 'bell': 'bell', 'bot': 'ai',
  'building-house': 'building', 'buildings': 'building', 'bulb': 'lightbulb', 'caret-down': 'chevdown', 'cart': 'shopping-cart',
  'category': 'grid', 'chair': 'armchair', 'check': 'check', 'check-circle': 'checkcircle', 'chevron-down': 'chevdown',
  'chevron-left': 'chevleft', 'chevron-right': 'chevright', 'chevron-up': 'chevup', 'circle': 'circle', 'cog': 'gear', 'copy': 'copy',
  'edit-alt': 'edit', 'error-circle': 'circle-alert', 'expand-vertical': 'chevrons-up-down', 'filter-alt': 'filter',
  'folder-open': 'folder-open', 'food-menu': 'notebook-tabs', 'gift': 'gift', 'git-compare': 'git-compare-arrows', 'grid': 'grid',
  'grid-alt': 'grid', 'group': 'users', 'history': 'history', 'home': 'house', 'inbox': 'inbox', 'info-circle': 'info',
  'key': 'key', 'line-chart': 'chart', 'link': 'link', 'list-check': 'list-checks', 'lock': 'lock', 'lock-alt': 'lock',
  'medal': 'medal', 'menu': 'menu', 'message-square-detail': 'message-square-text', 'minus': 'minus', 'package': 'package',
  'paperclip': 'attachment', 'pencil': 'pencil', 'pie-chart-alt-2': 'chart-pie', 'play': 'play', 'plus': 'plus',
  'purchase-tag': 'tag', 'receipt': 'receipt', 'refresh': 'refresh', 'reset': 'retry', 'restaurant': 'utensils', 'save': 'save',
  'search': 'search', 'search-alt': 'search', 'shield': 'shield', 'shield-quarter': 'shield', 'skip-next-circle': 'chevrons-right',
  'skip-previous-circle': 'chevrons-left', 'slider-alt': 'sliders', 'sort-down': 'arrow-down-wide-narrow', 'sort-up': 'arrow-up-narrow-wide',
  'star': 'star', 'star-half': 'star-half', 'store': 'store', 'test-tube': 'test-tube-diagonal', 'time-five': 'clock',
  'transfer': 'arrow-left-right', 'trash': 'trash', 'up-arrow-alt': 'arrowup', 'user': 'user', 'wallet': 'wallet',
  'wrench': 'wrench', 'x': 'close', 'x-circle': 'circle-x',
}
for (const [key, name] of Object.entries(legacy)) {
  names[`bx-${key}`] = names[name] || name
  names[`bxs-${key}`] = names[name] || name
}
Object.assign(names, {
  'custom-checked-checkbox': 'square-check', 'custom-unchecked-checkbox': 'square',
  'custom-indeterminate-checkbox': 'square-minus', 'custom-checked-radio': 'circle-dot', 'custom-unchecked-radio': 'circle',
})
const output = {}
for (const [key, name] of Object.entries(names)) {
  const icon = icons[name] || icons[aliases[name]?.parent]
  if (!icon) throw new Error(`Missing Lucide icon ${name} (${key})`)
  // The component owns all styling so the same glyph respects size and weight.
  const body = icon.body.replace(/<g\b[^>]*>/g, '').replace(/<\/g>/g, '')
  output[key] = parse(body).children.filter(node => node.type === 1).map(node => ({ tag: node.tag, attrs: Object.fromEntries(node.props.filter(prop => prop.type === 6).map(prop => [prop.name, prop.value?.content || ''])) }))
}
fs.mkdirSync('src/assets/icons', { recursive: true })
fs.writeFileSync('src/assets/icons/interface.json', `${JSON.stringify(output, null, 2)}\n`)
console.log(`Built ${Object.keys(output).length} local Lucide aliases.`)
