/**
 * Runtime smoke tests for the card, driven against a real browser.
 *
 * These cover the things that cannot be checked by typechecking: that Tailwind
 * compiles in the browser, that the compiled CSS actually applies inside the
 * shadow root, and that template subscriptions are not leaked.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const server = createServer(async (req, res) => {
  // Chrome requests this unprompted; answering it keeps the console clean so
  // any remaining error is genuinely the card's.
  if (req.url === '/favicon.ico') return res.writeHead(204).end()
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]))
    const body = await readFile(join(root, path))
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})

await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

// Use the locally installed Chrome when present (no browser download needed);
// fall back to Playwright's bundled Chromium, which is what CI installs.
const browser = await chromium
  .launch({ channel: 'chrome' })
  .catch(() => chromium.launch())
const page = await browser.newPage()

const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(String(e)))
page.on('requestfailed', (r) => {
  if (!r.url().includes('favicon')) consoleErrors.push(`request failed: ${r.url()}`)
})

await page.goto(`${base}/test/fixture.html`)
await page.waitForFunction(() => window.__ready && customElements.get('tailwind-template-card'))

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail && !pass ? ` — ${detail}` : ''}`)
}

// --- Tailwind utilities compile and apply inside the shadow root -----------
const styles = await page.evaluate(async () => {
  const card = document.createElement('tailwind-template-card')
  document.getElementById('host').appendChild(card)
  card.hass = window.__makeHass()
  card.setConfig({
    parse_jinja: true,
    ignore_line_breaks: true,
    content:
      '<div id="probe" class="flex rounded-3xl bg-white/60 p-5 text-4xl font-semibold backdrop-blur-xl">hi</div>' +
      '<div id="daisy" class="btn btn-primary">go</div>'
  })

  // Allow the async template push + style compilation to settle.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 50))
    if (card.shadowRoot.querySelector('#probe')) break
  }
  await new Promise((r) => setTimeout(r, 300))

  const probe = card.shadowRoot.querySelector('#probe')
  const daisy = card.shadowRoot.querySelector('#daisy')
  if (!probe) return { error: 'probe element never rendered' }

  const cs = getComputedStyle(probe)
  return {
    display: cs.display,
    borderRadius: cs.borderTopLeftRadius,
    background: cs.backgroundColor,
    fontSize: cs.fontSize,
    padding: cs.paddingTop,
    backdrop: cs.backdropFilter,
    daisyDisplay: daisy ? getComputedStyle(daisy).display : null,
    daisyBg: daisy ? getComputedStyle(daisy).backgroundColor : null,
    sheetCount: card.shadowRoot.adoptedStyleSheets.length
  }
})

if (styles.error) {
  check('card renders content into shadow root', false, styles.error)
} else {
  check('card renders content into shadow root', true)
  check('utility `flex` applies', styles.display === 'flex', `display=${styles.display}`)
  check('utility `rounded-3xl` applies', styles.borderRadius === '24px', `radius=${styles.borderRadius}`)
  check('utility `text-4xl` applies', styles.fontSize === '36px', `size=${styles.fontSize}`)
  check('utility `p-5` applies', styles.padding === '20px', `padding=${styles.padding}`)
  check(
    'opacity modifier `bg-white/60` applies',
    styles.background !== 'rgba(0, 0, 0, 0)' && /0\.6\s*\)?$/.test(styles.background),
    `bg=${styles.background}`
  )
  check('`backdrop-blur-xl` applies', /blur/.test(styles.backdrop || ''), `backdrop=${styles.backdrop}`)
  check('daisyUI `btn` component applies', styles.daisyDisplay && styles.daisyDisplay !== 'block', `display=${styles.daisyDisplay}`)
  check('shadow root has adopted stylesheets', styles.sheetCount >= 2, `count=${styles.sheetCount}`)
}

// --- Subscriptions are not leaked on repeated state updates ---------------
const subs = await page.evaluate(async () => {
  window.__subscriptions = { opened: 0, closed: 0 }
  const card = document.createElement('tailwind-template-card')
  document.getElementById('host').appendChild(card)
  card.setConfig({ parse_jinja: true, ignore_line_breaks: true, content: '<div class="flex">x</div>' })

  for (let i = 0; i < 25; i++) {
    const hass = window.__makeHass()
    // Mutate a watched entity so the card sees a genuine change each time.
    hass.states['sensor.living_room_temperature'] = {
      entity_id: 'sensor.living_room_temperature',
      state: String(20 + i),
      attributes: {}
    }
    card.hass = hass
    await new Promise((r) => setTimeout(r, 10))
  }
  await new Promise((r) => setTimeout(r, 200))

  const before = { ...window.__subscriptions }
  card.remove()
  await new Promise((r) => setTimeout(r, 100))

  return { ...before, closedAfterRemove: window.__subscriptions.closed }
})

check(
  'one template subscription survives 25 state updates',
  subs.opened - subs.closed <= 1,
  `opened=${subs.opened} closed=${subs.closed}`
)
check(
  'subscription is closed when card is removed',
  subs.closedAfterRemove >= subs.opened,
  `opened=${subs.opened} closedAfterRemove=${subs.closedAfterRemove}`
)

// --- Actions: service calls, nested targets, hold and more-info ------------
const actions = await page.evaluate(async () => {
  const card = document.createElement('tailwind-template-card')
  document.getElementById('host').appendChild(card)

  const moreInfoEvents = []
  card.addEventListener('hass-more-info', (e) => moreInfoEvents.push(e.detail.entityId))

  card.hass = window.__makeHass()
  card.setConfig({
    parse_jinja: true,
    ignore_line_breaks: true,
    entity: 'light.living_room',
    content:
      '<div id="tile" class="flex"><span id="label">Living</span></div>' +
      '<div id="held" class="flex">hold me</div>',
    actions: [
      { selector: '#tile', type: 'click', call: "hass.callService('light','toggle',{entity_id:'light.living_room'})" },
      { selector: '#held', type: 'hold', call: "moreInfo('light.living_room')" }
    ]
  })

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 50))
    if (card.shadowRoot.querySelector('#label')) break
  }

  // Click the inner span: the action is bound to the outer tile.
  card.shadowRoot.querySelector('#label').click()
  await new Promise((r) => setTimeout(r, 50))
  const serviceCall = window.__lastServiceCall

  // Press and hold the second element.
  const held = card.shadowRoot.querySelector('#held')
  const rect = held.getBoundingClientRect()
  const opts = { bubbles: true, composed: true, clientX: rect.x + 2, clientY: rect.y + 2 }
  held.dispatchEvent(new PointerEvent('pointerdown', opts))
  await new Promise((r) => setTimeout(r, 700))
  held.dispatchEvent(new PointerEvent('pointerup', opts))
  await new Promise((r) => setTimeout(r, 50))

  return { serviceCall, moreInfoEvents }
})

check(
  'action fires when a nested child is clicked',
  actions.serviceCall?.domain === 'light' && actions.serviceCall?.service === 'toggle',
  JSON.stringify(actions.serviceCall)
)
check(
  'hold action fires after a long press',
  actions.moreInfoEvents.length === 1,
  `moreInfo events=${actions.moreInfoEvents.length}`
)
check(
  'moreInfo() emits hass-more-info for the right entity',
  actions.moreInfoEvents[0] === 'light.living_room',
  `entity=${actions.moreInfoEvents[0]}`
)

// --- Classes introduced by bindings must also get compiled ---------------
const bound = await page.evaluate(async () => {
  const card = document.createElement('tailwind-template-card')
  document.getElementById('host').appendChild(card)
  card.hass = window.__makeHass()
  card.setConfig({
    parse_jinja: true,
    ignore_line_breaks: true,
    entity: 'light.living_room',
    // `bg-orange-400` appears nowhere in the HTML — only a binding adds it.
    content: '<div id="dot" class="rounded-full"></div>',
    bindings: [{ selector: '#dot', type: 'class', bind: "return 'bg-orange-400'" }]
  })

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 50))
    if (card.shadowRoot.querySelector('#dot')) break
  }
  await new Promise((r) => setTimeout(r, 400))

  const dot = card.shadowRoot.querySelector('#dot')
  return {
    classes: dot?.className ?? '',
    background: dot ? getComputedStyle(dot).backgroundColor : null
  }
})

check(
  'binding actually adds the class',
  bound.classes.includes('bg-orange-400'),
  `classes=${bound.classes}`
)
check(
  'class added by a binding is compiled and styled',
  bound.background !== 'rgba(0, 0, 0, 0)' && bound.background !== null,
  `background=${bound.background}`
)

// --- Config editor: fallback, upgrade, and change propagation -------------
const editor = await page.evaluate(async () => {
  const el = document.createElement('tailwind-template-card-config')
  document.getElementById('host').appendChild(el)
  el.hass = window.__makeHass()
  el.setConfig({ content: '<div class="flex">x</div>' })
  await new Promise((r) => setTimeout(r, 600))

  // `ha-code-editor` is not defined yet, so a plain textarea stands in.
  const fallback = Boolean(el.shadowRoot.querySelector('textarea'))

  // Register a stand-in for Home Assistant's editor and let it upgrade.
  let lastAssignedValue = null
  class FakeHaCodeEditor extends HTMLElement {
    set value(v) { lastAssignedValue = v; this._value = v }
    get value() { return this._value ?? '' }
  }
  customElements.define('ha-code-editor', FakeHaCodeEditor)
  window.__lastAssignedValue = () => lastAssignedValue

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50))
    if (el.shadowRoot.querySelector('ha-code-editor')) break
  }

  const node = el.shadowRoot.querySelector('ha-code-editor')
  const upgraded = Boolean(node)
  const seeded = lastAssignedValue

  // A value-changed event from the editor should reach the card config.
  let changed = null
  document.addEventListener('tailwind-template-card-config-changed', (e) => {
    changed = e.detail.config.content
  })
  if (node) {
    node._value = '<div class="grid">edited</div>'
    node.dispatchEvent(
      new CustomEvent('value-changed', {
        bubbles: true,
        composed: true,
        detail: { value: '<div class="grid">edited</div>' }
      })
    )
  }
  await new Promise((r) => setTimeout(r, 400))

  return { fallback, upgraded, seeded, changed, mode: node?.mode ?? null }
})

check('config editor falls back to a textarea when HA editor is absent', editor.fallback)
check('config editor upgrades once ha-code-editor is defined', editor.upgraded)
check('editor is seeded with the current content', typeof editor.seeded === 'string', `seeded=${JSON.stringify(editor.seeded)}`)
check('editor uses jinja2 mode', editor.mode === 'jinja2', `mode=${editor.mode}`)
check('value-changed propagates to the card config', editor.changed === '<div class="grid">edited</div>', `changed=${JSON.stringify(editor.changed)}`)

// --- Upstream card type keeps working ------------------------------------
const legacy = await page.evaluate(async () => {
  const defined = Boolean(customElements.get('tailwindcss-template-card'))
  if (!defined) return { defined, rendered: false, styled: null }

  const card = document.createElement('tailwindcss-template-card')
  document.getElementById('host').appendChild(card)
  card.hass = window.__makeHass()
  card.setConfig({
    parse_jinja: true,
    ignore_line_breaks: true,
    content: '<div id="legacy" class="flex rounded-3xl">old config</div>'
  })

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 50))
    if (card.shadowRoot.querySelector('#legacy')) break
  }
  await new Promise((r) => setTimeout(r, 300))

  const node = card.shadowRoot.querySelector('#legacy')
  return {
    defined,
    rendered: Boolean(node),
    styled: node ? getComputedStyle(node).display : null
  }
})

check('legacy card type is still registered', legacy.defined)
check('a config written for the upstream card still renders', legacy.rendered)
check('legacy card is styled by the new engine', legacy.styled === 'flex', `display=${legacy.styled}`)

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await browser.close()
server.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
