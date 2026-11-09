/**
 * Smoke test for the hand-written Client half.
 *
 * It does not render React: it loads client.js the way the Harness module
 * loader does, calls the factory with a stub `react`, applies the plugin with
 * stubbed Cordis services, and then exercises the store/transport the panel
 * uses. It also statically audits the module for the plugin invariants that
 * are cheap to check (no @deepseek-ai imports, no build artefacts, no literal
 * colors in CSS).
 *
 * Run: node client/__smoke__.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const file = join(here, '..', 'client.js')
const source = readFileSync(file, 'utf8')

let passed = 0
const failures = []

function check(name, condition, extra) {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name + (extra === undefined ? '' : ': ' + String(extra)))
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/* --------------------------------------------------------------------- *
 * Static audits
 * --------------------------------------------------------------------- */

const requires = [...source.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map(match => match[1])
check('only react is required', requires.length > 0 && requires.every(name => name === 'react'), requires.join(','))
check('no @deepseek-ai reference', !source.includes('@deepseek-ai'))
check('no JSX-style build output', !/react\/jsx-runtime/.test(source))
check('no document access', !/\bdocument\./.test(source))
const colorLiterals = [...source.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)].map(match => match[0])
check('no literal colors anywhere', colorLiterals.length === 0, colorLiterals.join(','))
const fixedWidths = [...source.matchAll(/(?:^|[;{\s])width:\s*([1-9][0-9]{2,})px/g)].map(match => match[0].trim())
check('no fixed pixel panel width', fixedWidths.length === 0, fixedWidths.join(','))
check('banner id matches package name', source.includes("id: 'dsh-asc-hub'"))
check('banner uses __ModuleLoader__.load', source.includes('window.__ModuleLoader__.load({'))

/* --------------------------------------------------------------------- *
 * Loader harness
 * --------------------------------------------------------------------- */

const effectCallbacks = []

const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  // Effects are recorded so the test can run them deliberately; nothing renders.
  useEffect: effect => { effectCallbacks.push(effect) },
  useState: init => [typeof init === 'function' ? init() : init, () => {}],
  useRef: init => ({ current: init }),
  useCallback: fn => fn,
  Fragment: 'fragment',
}

const loaded = []
const sandbox = {
  window: {
    __ModuleLoader__: { load: options => loaded.push(options) },
    localStorage: {
      store: new Map(),
      getItem(key) { return this.store.has(key) ? this.store.get(key) : null },
      setItem(key, value) { this.store.set(key, value) },
      removeItem(key) { this.store.delete(key) },
    },
    open: (...args) => sandbox.opened.push(args),
  },
  opened: [],
  require: name => {
    if (name !== 'react') throw new Error('unexpected require: ' + name)
    return React
  },
  console,
  FileReader: class {
    readAsText() { this.onerror && this.onerror() }
  },
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

check('module loader called once', loaded.length === 1, loaded.length)
const entry = loaded[0]
check('module id equals package name', entry && entry.id === 'dsh-asc-hub', entry && entry.id)
check('factory is a function', !!entry && typeof entry.factory === 'function')

const plugin = entry.factory(sandbox.require)
check('factory returns apply', plugin && typeof plugin.apply === 'function')
check('factory returns inject', plugin && Array.isArray(plugin.inject))
check('inject list is exact', deepEqual(plugin.inject, ['slots', 'sidebarRight', 'sidebarRightTabs', 'connection', 'locale']), JSON.stringify(plugin.inject))
check('factory is side-effect free (no registration before apply)', loaded.length === 1)

/* --------------------------------------------------------------------- *
 * Cordis stubs
 * --------------------------------------------------------------------- */

const localeRegistrations = []
const slotRegistrations = []
const tabDefinitions = []
const injections = []
const effects = []
const rpcCalls = []
let openedTabs = []
let expandedToggles = 0

function interpolate(dict, key, params) {
  const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
}

function dictionariesFor(namespace) {
  const entryRegistration = localeRegistrations.find(item => item.ns === namespace)
  return entryRegistration ? entryRegistration.dicts.en : {}
}

let rpcHandler = () => ({ ok: true, value: {} })

const ctx = {
  locale: {
    register(ns, dicts) {
      localeRegistrations.push({ ns, dicts })
      return () => {}
    },
    bind(ns) {
      return (key, params) => interpolate(dictionariesFor(ns), key, params)
    },
    subscribe: () => () => {},
    getLocale: () => ({ active: 'en', locales: [], revision: 1 }),
  },
  slots: {
    inject(key, callback, label) {
      const registration = { key, label }
      injections.push(registration)
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    register(options, component) {
      slotRegistrations.push({ options, component })
      return () => {}
    },
  },
  sidebarRight: {
    openTab(kind) { openedTabs.push(kind) },
    isExpanded() { return false },
    toggleExpanded() { expandedToggles += 1 },
  },
  sidebarRightTabs: {
    register(definition) {
      tabDefinitions.push(definition)
      return () => {}
    },
  },
  connection: {
    rpc: {
      call(channel, endpoint, payload, signal) {
        rpcCalls.push({ channel, endpoint, payload, signal })
        return Promise.resolve(rpcHandler(endpoint, payload))
      },
    },
    generation: { subscribe: () => () => {} },
  },
  effect(callback, label) {
    const dispose = callback()
    effects.push({ label, dispose })
    return () => {}
  },
}

let applyError = null
try {
  plugin.apply(ctx)
} catch (error) {
  applyError = error
}
check('apply registers without throwing', applyError === null, applyError && applyError.stack)

/* --------------------------------------------------------------------- *
 * Registrations
 * --------------------------------------------------------------------- */

check('locale dictionaries registered once', localeRegistrations.length === 1, localeRegistrations.length)
const localeRegistration = localeRegistrations[0]
check('locale namespace is asc-hub', localeRegistration && localeRegistration.ns === 'asc-hub')
const en = localeRegistration ? localeRegistration.dicts.en : {}
const zh = localeRegistration ? localeRegistration.dicts.zh : {}
const enKeys = Object.keys(en).sort()
const zhKeys = Object.keys(zh).sort()
check('both baseline dictionaries present', enKeys.length > 0 && zhKeys.length > 0, enKeys.length + '/' + zhKeys.length)
check('dictionaries have identical key sets', deepEqual(enKeys, zhKeys), JSON.stringify(enKeys.filter(key => !zhKeys.includes(key))))
check('required translation keys exist', ['tabTitle', 'title', 'statusAria', 'logTitle', 'openConsole'].every(key => typeof en[key] === 'string'))
check('error vocabulary is localized', ['error.KEY_FILE_UNSAFE', 'error.ASC_AUTH_FAILED', 'error.INSTALL_FAILED', 'error.VENDOR_REQUIRED'].every(key => typeof en[key] === 'string' && typeof zh[key] === 'string'))
check('next-step vocabulary is localized', ['next.KEY_FILE_UNSAFE', 'next.ASC_AUTH_FAILED', 'next.INSTALL_FAILED'].every(key => typeof en[key] === 'string' && typeof zh[key] === 'string'))

check('tab type registered once', tabDefinitions.length === 1, tabDefinitions.length)
const tabDefinition = tabDefinitions[0] || {}
check('tab id matches package name', tabDefinition.id === 'dsh-asc-hub', tabDefinition.id)
check('tab kind is asc-hub', tabDefinition.kind === 'asc-hub', tabDefinition.kind)
check('tab title is a thunk', typeof tabDefinition.title === 'function' && tabDefinition.title() === 'ASC Hub', typeof tabDefinition.title === 'function' ? tabDefinition.title() : '')
check('tab declares keepMounted', tabDefinition.keepMounted === true)
check('tab declares a guide entry', Array.isArray(tabDefinition.guide) && tabDefinition.guide.length === 1 && typeof tabDefinition.guide[0].title === 'function')

const names = slotRegistrations.map(item => item.options.name + ':' + (item.options.id || item.options.key))
check('status button slot registered', names.includes('conversation.session.header.utilities:asc-hub-status'), names.join(','))
check('panel body slot registered', names.includes('sidebar.right.pane.tab:dsh-asc-hub'))
check('panel title slot registered', names.includes('sidebar.right.pane.tab.title:dsh-asc-hub'))
check('every slot registration declares the locale', slotRegistrations.every(item => item.options.locale === 'asc-hub'))
check('every slot registration has a component', slotRegistrations.every(item => typeof item.component === 'function'))
check('slot injections use the declared keys', deepEqual(injections.map(item => item.key).sort(), ['conversation.session.header.utilities', 'sidebar.right.pane.tab', 'sidebar.right.pane.tab.title']))

/* --------------------------------------------------------------------- *
 * Trigger behaviour
 * --------------------------------------------------------------------- */

const statusRegistration = slotRegistrations.find(item => item.options.id === 'asc-hub-status')
const face = statusRegistration.options.inject()
check('status inject face exposes store', face && face.store && typeof face.store.getSnapshot === 'function')
check('status inject face exposes locale', face && face.locale && typeof face.locale.bind === 'function')

check('open() opens the asc-hub tab', (() => {
  face.open()
  return openedTabs.includes('asc-hub')
})(), openedTabs.join(','))
check('open() expands a collapsed column', expandedToggles === 1, expandedToggles)

const t = ctx.locale.bind('asc-hub')
const store = face.store

function collectText(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { for (const child of node) collectText(child, out); return out }
  if (typeof node === 'object' && node.children) {
    collectText(node.props && node.props.children, out)
    for (const child of node.children) collectText(child, out)
  }
  return out
}

function findByType(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) findByType(child, predicate, out); return out }
  if (predicate(node)) out.push(node)
  if (node.props && node.props.children) findByType(node.props.children, predicate, out)
  for (const child of node.children || []) findByType(child, predicate, out)
  return out
}

const statusTree = statusRegistration.component({ t, store, locale: ctx.locale, open: face.open, sessionId: 's1' })
const pill = findByType(statusTree, node => node.props && node.props.className === 'asc-hub-pill')
check('trigger renders a real button', pill.length === 1 && pill[0].type === 'button', pill.length)
check('trigger button has type=button', pill.length === 1 && pill[0].props.type === 'button')
check('trigger text is asc: <label>', collectText(statusTree).includes('asc: start'), collectText(statusTree).join('|'))
check('trigger has an aria-label', pill.length === 1 && typeof pill[0].props['aria-label'] === 'string' && pill[0].props['aria-label'].includes('start'))
check('trigger includes a style element', findByType(statusTree, node => node.type === 'style').length === 1)
const confirmSends = (source.match(/confirm: true/g) || []).length
check('only the four publishing actions send confirm: true', confirmSends === 4, confirmSends)
check('install and sign-in stay ungated (no confirm, no mode check)', !/engine\.install[\s\S]{0,200}confirm/.test(source) && !/auth\.(?:login|importKey)[\s\S]{0,260}confirm: true/.test(source) && !/mode\s*===\s*['"]write['"][\s\S]{0,120}disabled/.test(source))

/* --------------------------------------------------------------------- *
 * Transport
 * --------------------------------------------------------------------- */

rpcHandler = (endpoint, payload) => {
  if (endpoint === 'asc-hub/status') {
    return {
      ok: true,
      value: {
        phase: 'ready',
        label: 'ready',
        engine: { installed: true, path: '/opt/homebrew/bin/asc', version: '6.5.3', source: 'path', brew: { installed: true } },
        auth: { configured: true, profiles: [{ name: 'Work', keyId: 'ABCD1234' }], activeProfile: 'Work', storage: 'System Keychain' },
        app: null,
        operation: null,
        lastError: null,
      },
    }
  }
  if (endpoint === 'asc-hub/engine.install') {
    return { ok: true, value: { log: 'brew install asc' } }
  }
  return { ok: true, value: {} }
}

const refreshed = await store.refresh()
check('status refresh returns Hub state', refreshed && refreshed.phase === 'ready', JSON.stringify(refreshed))
const statusCall = rpcCalls.find(call => call.endpoint === 'asc-hub/status')
check('rpc channel is /api', statusCall && statusCall.channel === '/api', statusCall && statusCall.channel)
check('rpc status payload is bare action', statusCall && deepEqual(statusCall.payload, { action: 'status' }), statusCall && JSON.stringify(statusCall.payload))

const readyTree = statusRegistration.component({ t, store, locale: ctx.locale, open: face.open, sessionId: 's1' })
check('trigger reflects live state after refresh', collectText(readyTree).includes('asc: ready'), collectText(readyTree).join('|'))

const installResult = await store.perform('engine.install', { method: 'brew' })
check('perform returns the action data', installResult.ok && installResult.data && installResult.data.log === 'brew install asc', JSON.stringify(installResult))
const installCall = rpcCalls.find(call => call.endpoint === 'asc-hub/engine.install')
check('rpc action payload carries action + input', installCall && deepEqual(installCall.payload, { action: 'engine.install', input: { method: 'brew' } }), installCall && JSON.stringify(installCall.payload))
check('perform refreshes status afterwards', rpcCalls.filter(call => call.endpoint === 'asc-hub/status').length >= 2)
const log = store.getSnapshot().log
check('operation log records the Host log text', Array.isArray(log) && log.length === 1 && log[0].text === 'brew install asc', JSON.stringify(log))

const previousLabel = store.getSnapshot().label
rpcHandler = () => ({ ok: false, error: { code: 'READ_ONLY_MODE', message: 'read-only', details: { detail: 'mode: read-only' } } })
const denied = await store.perform('builds.upload', { appId: 'app1', ipaPath: '/tmp/a.ipa', confirm: true })
check('error envelope surfaces as state, not a throw', denied.ok === false && denied.error.code === 'READ_ONLY_MODE')
const deniedSnapshot = store.getSnapshot()
check('action error is stored for the panel', deniedSnapshot.actionError && deniedSnapshot.actionError.code === 'READ_ONLY_MODE')
check('error detail is preserved for the redacted log', deniedSnapshot.actionError.detail === 'mode: read-only')
check('status label survives a failed action', deniedSnapshot.label === previousLabel || deniedSnapshot.label === 'error', deniedSnapshot.label)
check('failed action does not throw inside perform', typeof deniedSnapshot.busyAction === 'string' && deniedSnapshot.busyAction === '')

rpcHandler = () => { throw new Error('transport down') }
const transportFailure = await store.probe('status')
check('transport throw becomes RPC_FAILED', transportFailure.ok === false && transportFailure.error.code === 'RPC_FAILED', JSON.stringify(transportFailure))

/* --------------------------------------------------------------------- *
 * Panel render paths. Hooks are stateless here, so expanding function
 * components is safe and gives the real element tree to inspect.
 * --------------------------------------------------------------------- */

// Earlier trigger renders recorded their own effects; the panel section runs its
// own deliberately, one phase at a time.
effectCallbacks.length = 0

let panelClosed = 0
let commandsBound = 0
const useTabInfo = () => ({
  sidebar: { expanded: true, fullscreen: false },
  panel: { id: 'pane-1', isFloating: false },
  tab: {
    id: 'tab-1',
    kind: 'asc-hub',
    visible: true,
    actions: {
      close() { panelClosed += 1 },
      bindCommands() { commandsBound += 1; return () => {} },
      openTab() {},
      openResource() {},
    },
  },
})

function renderDeep(node) {
  if (node === null || node === undefined || node === false) return null
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(renderDeep)
  if (typeof node === 'object' && typeof node.type === 'function') {
    const children = node.children && node.children.length > 0 ? node.children : node.props.children
    return renderDeep(node.type(Object.assign({}, node.props, { children })))
  }
  if (typeof node === 'object') {
    return { type: node.type, props: node.props, children: (node.children || []).map(renderDeep) }
  }
  return node
}

function runEffects() {
  const pending = effectCallbacks.splice(0)
  const cleanups = []
  for (const effect of pending) {
    const cleanup = effect()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  }
  return cleanups
}

function renderPanel(statusValue) {
  rpcHandler = (endpoint) => endpoint === 'asc-hub/status'
    ? { ok: true, value: statusValue }
    : { ok: true, value: {} }
  return store.refresh().then(() => renderDeep(panelRegistration.component({
    t, store, locale: ctx.locale, useTabInfo, sessionId: 's1',
  })))
}

const panelRegistration = slotRegistrations.find(item => item.options.key === 'dsh-asc-hub' && item.options.name === 'sidebar.right.pane.tab')

const loginState = {
  phase: 'login',
  label: 'login',
  engine: { installed: true, path: '/opt/homebrew/bin/asc', version: '6.5.3', source: 'path', brew: { installed: true } },
  auth: { configured: false, profiles: [], activeProfile: null, storage: 'System Keychain' },
  app: null,
  operation: null,
  lastError: null,
}

let loginTree = null
let loginError = null
try {
  loginTree = await renderPanel(loginState)
} catch (error) {
  loginError = error
}
check('panel renders the sign-in onboarding path without throwing', loginError === null, loginError && loginError.stack)
const loginText = collectText(loginTree).join(' | ')
check('panel header is localized', loginText.includes('App Store Connect'))
check('panel shows the detected engine version', loginText.includes('asc 6.5.3 at /opt/homebrew/bin/asc'), loginText)
check('sign-in step explains no password is requested', loginText.includes('never asks for an Apple ID password'), loginText)
check('sign-in step explains the Keychain hand-off', loginText.includes('stores it in the macOS Keychain'))
check('sign-in step explains the key never leaves the Mac', loginText.includes('never leaves this Mac'))
check('sign-in step offers the API key page', findByType(loginTree, node => node.type === 'button' && collectText(node).includes('Open App Store Connect API keys')).length === 1)
check('sign-in step renders the .p8 drop zone', findByType(loginTree, node => node.type === 'button' && node.props['aria-label'] === 'Private key file drop zone').length === 1)
check('sign-in step renders the credential fields plus an optional profile name', findByType(loginTree, node => node.type === 'input' && node.props.type === 'text').length === 4)
check('sign-in step labels every credential field', ['Key ID', 'Issuer ID', 'Private key path (.p8, absolute)', 'Profile name (optional)'].every(text => collectText(loginTree).includes(text)))
check('sign-in step offers verify and sign in', findByType(loginTree, node => node.type === 'button' && collectText(node).includes('Verify and sign in')).length === 1)
check('sign-in does not ask for a password field', findByType(loginTree, node => node.type === 'input' && node.props.type === 'password').length === 0)
const loginCleanups = runEffects()
check('panel binds the tab refresh command', commandsBound === 1, commandsBound)
for (const cleanup of loginCleanups) cleanup()

const engineStateValue = {
  phase: 'engine',
  label: 'engine',
  engine: { installed: false, version: null, path: null, source: 'missing', brew: { installed: false } },
  auth: { configured: false, profiles: [], activeProfile: null, storage: null },
  app: null,
  operation: null,
  lastError: null,
}
const engineTree = await renderPanel(engineStateValue)
const engineText = collectText(engineTree).join(' | ')
check('install step explains Homebrew and curl', engineText.includes('Homebrew') && engineText.includes('curl'), engineText)
const installButton = findByType(engineTree, node => node.type === 'button' && collectText(node).includes('Install asc'))
check('install step offers a primary install button', installButton.length === 1 && installButton[0].props.className.includes('asc-hub-btn-primary'), installButton.length)
check('install button is a real button with aria-busy', installButton.length === 1 && installButton[0].props.type === 'button')
runEffects().forEach(cleanup => cleanup())

const readyStateValue = {
  phase: 'ready',
  label: 'ready',
  engine: { installed: true, path: '/opt/homebrew/bin/asc', version: '6.5.3', source: 'path', brew: { installed: true } },
  auth: { configured: true, profiles: [{ name: 'Work', keyId: 'ABCD1234' }], activeProfile: 'Work', storage: 'System Keychain' },
  app: null,
  operation: null,
  lastError: null,
}
const consoleTree = await renderPanel(readyStateValue)
const consoleText = collectText(consoleTree).join(' | ')
check('console renders the app picker', consoleText.includes('App') && consoleText.includes('Choose an app to enable the build'), consoleText.slice(-600))
check('empty-list copy is localized', typeof en.noApps === 'string' && typeof en.noGroups === 'string' && typeof en.noAnalytics === 'string')
check('console renders the builds card', consoleText.includes('Builds'))
check('console renders the TestFlight card', consoleText.includes('TestFlight'))
check('console renders the release card', consoleText.includes('Release'))
check('console renders the sales card', consoleText.includes('Sales'))
check('console renders the analytics card', consoleText.includes('Analytics reports'))
check('app-scoped cards ask for an app when none is chosen', consoleText.includes('Choose an app above'), consoleText)
check('console keeps the operation log collapsed', findByType(consoleTree, node => node.type === 'details' && node.props.className === 'asc-hub-log').length === 1)
check('console has a close control', findByType(consoleTree, node => node.type === 'button' && node.props['aria-label'] === 'Close').length === 1)
const closeButton = findByType(consoleTree, node => node.type === 'button' && node.props['aria-label'] === 'Close')[0]
closeButton.props.onClick()
check('close control calls tab.actions.close', panelClosed === 1, panelClosed)
runEffects().forEach(cleanup => cleanup())

/* Panel title registration */
const titleRegistration = slotRegistrations.find(item => item.options.key === 'dsh-asc-hub' && item.options.name === 'sidebar.right.pane.tab.title')
const titleTree = titleRegistration.component({ t, locale: ctx.locale })
check('panel tab title is localized', collectText(titleTree).join('') === 'ASC Hub', collectText(titleTree).join(''))
check('trigger aria label interpolates the label', t('statusAria', { label: t('label.ready') }).includes('ready'))
check('guide entry carries localized copy', tabDefinition.guide[0].description() === 'Install the asc engine, sign in with an API key, and ship builds, releases and sales.')

/* --------------------------------------------------------------------- *
 * Disposal
 * --------------------------------------------------------------------- */

let disposeError = null
try {
  for (const effect of effects.slice().reverse()) {
    if (typeof effect.dispose === 'function') effect.dispose()
  }
} catch (error) {
  disposeError = error
}
check('every effect returns a disposer', effects.every(effect => typeof effect.dispose === 'function'), effects.map(effect => effect.label).join(','))
check('disposal does not throw', disposeError === null, disposeError && disposeError.message)

/* --------------------------------------------------------------------- *
 * Report
 * --------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error('\nFAILED ' + failures.length + ' check(s):')
  for (const failure of failures) console.error('  - ' + failure)
  console.error('\npassed: ' + passed)
  process.exit(1)
}
console.log('asc-hub client smoke: ' + passed + ' checks passed')
for (const line of [
  'transport -> ctx.connection.rpc.call("/api", "asc-hub/<action>", { action, input })',
  'registrations -> trigger, panel body, panel title, tab type + guide entry',
  'locale -> asc-hub en + zh with identical key sets',
  'state -> status refresh, action perform, error envelope, RPC_FAILED fallback',
  'render paths -> onboarding and console component calls without throwing',
]) {
  console.log('  - ' + line)
}
