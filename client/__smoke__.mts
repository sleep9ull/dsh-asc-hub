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
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))

/** The repo root, so this works from the source tree and from dist-test/. */
function repoRoot(start: string): string {
  let dir = start
  for (let step = 0; step < 6; step += 1) {
    if (existsSync(join(dir, 'package.json'))) return dir
    dir = dirname(dir)
  }
  return start
}

const file = join(repoRoot(here), 'dist', 'client.js')
const source = readFileSync(file, 'utf8')
const manifest = JSON.parse(readFileSync(join(repoRoot(here), 'package.json'), 'utf8')) as { name: string }

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name + (extra === undefined ? '' : ': ' + String(extra)))
}

function deepEqual(a: unknown, b: unknown): boolean {
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
// Exactly one literal is allowed: the product accent (App Store Connect blue),
// declared once as --asc-hub-accent and aliased onto the host brand token inside
// this subtree. Everything else must come from --dsw-alias-* tokens.
check('literal colors are confined to the one accent token', colorLiterals.length === 1 && colorLiterals[0] === '#0071e3', colorLiterals.join(','))
const onboardingCss = source.slice(source.indexOf('[data-asc-hub] .asc-hub-onboarding'), source.indexOf('[data-asc-hub] .asc-hub-card'))
// The rail column has to be as wide as the biggest node, or the node hangs outside
// the scrolling column and gets clipped flat on its left side.
const railCol = /grid-template-columns: (\d+)px minmax\(0, 1fr\); column-gap: 15px/.exec(source)
const currentNode = /\.asc-hub-phase\[data-state="current"\] \.asc-hub-phase-node \{[^}]*width: (\d+)px;/.exec(source)
const railLine = /\.asc-hub-phase-rail::after \{ content: ''; position: absolute; left: (\d+)px;/.exec(source)
check('the rail column fits the current node', Boolean(railCol && currentNode) && Number(railCol[1]) >= Number(currentNode[1]), { col: railCol && railCol[1], node: currentNode && currentNode[1] })
check('the spine runs down the middle of that column', Boolean(railCol && railLine) && Number(railLine[1]) === Number(railCol[1]) / 2, { line: railLine && railLine[1] })
// The numeral must sit on the optical centre of the title's first line, so the two
// read as one row. Derive it from the declared type metrics instead of trusting a
// number someone typed.
const titleRule = /\.asc-hub-step-title \{[^}]*font-size: (\d+(?:\.\d+)?)px;[^}]*line-height: ([\d.]+);/.exec(source)
const nodeTopRule = /\.asc-hub-phase-node \{[^}]*top: ([\d.]+)px;/.exec(source)
const expectedCentre = titleRule ? (Number(titleRule[1]) * Number(titleRule[2])) / 2 : NaN
check('the node is centred on the title line', Boolean(titleRule && nodeTopRule) && Math.abs(Number(nodeTopRule[1]) - expectedCentre) < 0.6, { expectedCentre, nodeTop: nodeTopRule && nodeTopRule[1] })
check('the divider is drawn out of flow so it cannot shift the title', source.includes('.asc-hub-phase + .asc-hub-phase .asc-hub-step::before') && !source.includes('.asc-hub-phase + .asc-hub-phase .asc-hub-step { border-top'))

// The divider and the spine are anchored to the row padding; change one without
// the others and the line stops meeting the next node.
const rowPad = /\.asc-hub-phase \{[^}]*padding: (\d+)px 0;/.exec(source)
const dividerTop = /\.asc-hub-phase \+ \.asc-hub-phase \.asc-hub-step::before \{[^}]*top: -(\d+)px;/.exec(source)
const railBefore = /\.asc-hub-phase-rail::before \{ top: -(\d+)px; height: ([\d.]+)px; \}/.exec(source)
const railAfter = /\.asc-hub-phase-rail::after \{ top: ([\d.]+)px; bottom: -(\d+)px; \}/.exec(source)
const centre = nodeTopRule ? Number(nodeTopRule[1]) : NaN
check('the divider sits on the midpoint of the step gap', Boolean(rowPad && dividerTop) && dividerTop[1] === rowPad[1], { rowPad: rowPad && rowPad[1], dividerTop: dividerTop && dividerTop[1] })
check('the spine reaches the neighbouring node across that gap', Boolean(rowPad && railBefore && railAfter) &&
  railBefore[1] === rowPad[1] && Math.abs(Number(railBefore[2]) - (Number(rowPad[1]) + centre)) < 0.6 &&
  railAfter[2] === rowPad[1] && Math.abs(Number(railAfter[1]) - centre) < 0.6,
  { railBefore: railBefore && railBefore.slice(1), railAfter: railAfter && railAfter.slice(1) })
check('onboarding progress uses the one accent, not the success token', !onboardingCss.includes('state-success-primary'))
check('the accent is aliased, never repeated', source.includes('--asc-hub-accent: #0071e3') && source.includes('--dsw-alias-brand-primary: var(--asc-hub-accent)'))
const fixedWidths = [...source.matchAll(/(?:^|[;{\s])width:\s*([1-9][0-9]{2,})px/g)].map(match => match[0].trim())
check('no fixed pixel panel width', fixedWidths.length === 0, fixedWidths.join(','))
// The registration id has to equal the package name, or the boot manifest's import
// finds no factory. Read the name from the manifest so a rename cannot rot this.
check('banner id matches package name', source.includes(`id: '${manifest.name}'`), source.match(/id: '[^']+'/)?.[0])
// The bundle registers through the loader once; a second evaluation is a no-op
// (the module system treats a repeat registration as fatal), so the assertion
// accepts the guarded form as well as the bare call.
check('bundle registers through the loader once, behind an idempotence guard',
  /window\.__ModuleLoader__/.test(source)
  && (source.match(/\.load\(\{/g) || []).length === 1
  && /\.__ascHubRegistered\s*===?\s*true/.test(source))

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
    onerror: (() => void) | undefined
    readAsText(this: any) { if (this.onerror) this.onerror() }
  },
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

check('module loader called once', loaded.length === 1, loaded.length)

// The module system treats a second registration of the same id as fatal
// ("bundle executed twice without invalidate?"), and that failure takes the
// whole window down. Re-evaluating the bundle has to be a no-op instead.
vm.runInContext(source, sandbox, { filename: 'client.js' })
check('a second evaluation of the bundle registers nothing', loaded.length === 1, loaded.length)

const entry = loaded[0]
check('module id equals package name', entry !== undefined && entry.id === manifest.name, entry && entry.id + ' vs ' + manifest.name)
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

let rpcHandler: (endpoint?: any, payload?: any) => any = () => ({ ok: true, value: {} })

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
const statusReg = slotRegistrations.find(item => item.options.id === 'asc-hub-status')
check('the pill sorts before the shipped Open in… control', Boolean(statusReg) && Number(statusReg.options.order) < -10, statusReg && statusReg.options.order)
check('trigger text is asc: <label>', collectText(statusTree).includes('asc: start'), collectText(statusTree).join('|'))
check('trigger has an aria-label', pill.length === 1 && typeof pill[0].props['aria-label'] === 'string' && pill[0].props['aria-label'].includes('start'))
check('trigger includes a style element', findByType(statusTree, node => node.type === 'style').length === 1)
const confirmSends = (source.match(/confirm: true/g) || []).length
// Four mutating actions now: build, distribute, submit for review, release.
check('every mutating panel call still carries confirm: true', confirmSends === 4, confirmSends)
check('each step picks its own build from a menu, and the list has no radio', source.includes('function BuildMenu(') && source.includes("className: 'asc-hub-form'") && source.includes("t('groupsTitle')") && source.includes("className: 'asc-hub-groups'") && source.includes("label: t('reviewBuild'), builds, buildId, onChange: setBuildId, optionLabel: menuLabel") && !source.includes("name: 'asc-hub-build'"))
check('it sends the chosen build with the confirmation flag', source.includes('const input = { appId, buildId: build.id, groupIds: selected, confirm: true }'))
check('Build and Distribute are the same length', (source.match(/className: 'asc-hub-actions-fill'/g) || []).length === 4 && source.includes('.asc-hub-actions-fill .asc-hub-btn { flex: 0 0 auto; min-width: 11em; justify-content: center; }'))
check('the review menu names each build\'s state', source.includes("t('buildReleased')") && source.includes("t('buildInReview')") && source.includes("t('buildNotSubmitted')") && source.includes('optionLabel: menuLabel') && ['buildReleased', 'buildInReview', 'buildNotSubmitted', 'versionShippedTag', 'versionShippedHint'].every(key => typeof en[key] === 'string' && typeof zh[key] === 'string'))
check('the audience is named (Internal / External), not badged TestFlight', source.includes('h(TestFlightMarks, { t, build })') && !source.includes("'testflightTag'") && source.includes('const tags = (build, pinnedRow)'))
check('only the pinned row is the release build, and only it says Release', /pinnedRow\s*\?\s*h\('span', \{ className: 'asc-hub-tf', 'data-audience': 'release' \}/.test(source) && !source.includes('isRelease(build)') && source.includes('tags(build, pinnedRow)'))
check('a successful send re-reads the list so its tags say so', /if \(typeof onSent === 'function'\)\s*onSent\(\);/.test(source) && /onSent: \(\) => \{ void store\.refreshAll\(\);/.test(source))
check('the workbench copy is localized', ['tfBuildLabel', 'tfSent', 'tfNoBuild', 'internalGroup', 'externalGroup', 'releaseTag', 'cannotNoProject', 'cannotNotIos', 'cannotNoXcode', 'cannotUnloadable', 'autoFix', 'autoFixCopied', 'autoFixHint'].every(key => typeof en[key] === 'string' && en[key].length > 2 && typeof zh[key] === 'string' && zh[key].length > 1) && en.latestBuild === undefined && en.justSent === undefined)
check('distributing is one deliberate action, not a second tick', !source.includes('confirmDistribute') && source.includes('disabled: busy || selected.length === 0') && source.includes('groupIds: selected, confirm: true'))
check('the beta review path is gone from the panel', !source.includes('submitBeta') && !source.includes('confirmBeta') && !source.includes('betaReview'))
check('the build step builds the working directory, never a chosen file', source.includes("store.perform('build.create', {") && source.includes('sessionId,') && source.includes('version: chosenVersion.trim()') && source.includes('buildNumber: chosenNumber.trim()') && !source.includes('ipaPath') && !source.includes("'ipaLabel'"))
// The panel header owns the refresh label (two uses: aria-label + title). The only
// other users are the parked Sales/Analytics cards, so the live console passes no
// per-card reload callback at all.
const refreshLabels = (source.match(/t\('refresh'\)/g) || []).length
const consoleRender = (source.match(/asc-hub-console[^\n]*/) || [''])[0]
check('one refresh button re-reads every section', source.includes('refreshAll,') && /const tick = React\.useSyncExternalStore\(store\.subscribe, \(\) => store\.getSnapshot\(\)\.reload\)/.test(source) && /onClick: \(\) => \{ void store\.refreshAll\(\);/.test(source) && refreshLabels === 4 && !consoleRender.includes('reload:'))
check('the section is three lines: title, path + git, build tag + reason', source.includes("className: 'asc-hub-workspace-build'") && source.includes("className: 'asc-hub-workspace-git'") && source.includes("'data-state': buildReady ? 'ok' : 'muted'") && source.includes('buildIos') && source.includes('copyPrompt') && !source.includes('asc-hub-workspace-fix'))
check('the auto-fix prompt is a real request, not a placeholder', source.includes('make this working directory into a codebase that is ready to build') && source.includes('Do not add features') && source.includes('AUTO_FIX_PROMPT'))
check('the directory says whether it can be built', source.includes("t('buildReady')") && source.includes("t('buildNotReady')") && source.includes("'data-state': buildReady ? 'ok' : 'muted'") && ['buildReady', 'buildNotReady', 'buildNoXcode', 'buildNoProject'].every(key => typeof en[key] === 'string' && typeof zh[key] === 'string'))
check('version and build number are two separate decisions', source.includes("t('versionLabel')") && source.includes("t('buildNumberLabel')") && source.includes('const chosenVersion = version !==') && source.includes('const chosenNumber = buildNumber !==') && source.includes('Math.max.apply(null, numbers) + 1'))
check('the build step comes before the list it fills, and distribution after it', source.indexOf('h(BuildCard, {') > 0 && source.indexOf('h(BuildCard, {') < source.indexOf('h(BuildsCard, {') && source.indexOf('h(BuildsCard, {') < source.indexOf('h(TestFlightCard, {'))
check('only processed builds are listed, so everything listed is ready', source.includes('distributableBuilds(normalizeBuilds(buildsQuery[0].data))') && /function distributableBuilds[\s\S]{0,400}?toUpperCase\(\) === 'VALID'/.test(source))
check('install and sign-in stay ungated', !/engine\.install[\s\S]{0,200}confirm/.test(source) && !/auth\.(?:login|importKey)[\s\S]{0,260}confirm: true/.test(source) && source.includes('disabled: engineReady || busy'))
// The mode pill is a switch; only it reacts to the mode, never the panel's actions.
check('only the mode pill reacts to the mode', source.includes("disabled: state.busyAction !== ''") && !source.includes("disabled: mode === 'write'"))

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
const statusCallsBefore = rpcCalls.filter(call => call.endpoint === 'asc-hub/status').length
const transportFailure = await store.probe('status')
check('transport throw becomes RPC_FAILED', transportFailure.ok === false && transportFailure.error.code === 'RPC_FAILED', JSON.stringify(transportFailure))
check('a dead transport is retried exactly once', rpcCalls.filter(call => call.endpoint === 'asc-hub/status').length === statusCallsBefore + 2, rpcCalls.filter(call => call.endpoint === 'asc-hub/status').length - statusCallsBefore)
check('a dead transport marks the page stale, not each card', store.getSnapshot().hostDown === true)
rpcHandler = (endpoint) => ({ ok: true, value: endpoint === 'asc-hub/status' ? { phase: 'ready', label: 'ready', engine: { installed: true, version: '6.5.3' }, auth: { configured: true }, app: null, operation: null, lastError: null } : {} })
const healed = await store.probe('status')
check('the first healthy call clears the stale flag', healed.ok === true && store.getSnapshot().hostDown === false)
check('the banner is one block with the way out, and per-card notes stand down', source.includes("className: 'asc-hub-recovery'") && source.includes("t('reloadPanel')") && /if \(code === 'RPC_FAILED'\)\s*return null/.test(source) && source.includes('location.reload'))
check('the recovery copy is localized in both locales', ['hostDownTitle', 'hostDownBody', 'reloadPanel'].every(key => typeof en[key] === 'string' && en[key].length > 3 && typeof zh[key] === 'string' && zh[key].length > 2 && en[key] !== zh[key]))

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
  mode: 'write',
  hub: { version: '0.1.0' },
  update: { available: false, scope: null, latest: null },
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
const headerNode = findByType(loginTree, node => node.props && String(node.props.className || '') === 'asc-hub-head')
const footerNode = findByType(loginTree, node => node.props && String(node.props.className || '') === 'asc-hub-foot')
check('the header carries the title and nothing else', headerNode.length === 1 && collectText(headerNode[0]).join(' ').includes('App Store Connect') && !collectText(headerNode[0]).join(' ').includes('asc 6.5.3') && !collectText(headerNode[0]).join(' ').includes('mode'), collectText(headerNode[0] || {}).join(' '))
const footerText = collectText(footerNode[0] || { props: {}, children: null }).join(' ')
check('the footer credits the hub, the author and the engine', footerText.includes('version') && footerText.includes('0.1.0') && footerText.includes('©sleep9ull') && footerText.includes('engine') && footerText.includes('asc 6.5.3'), footerText)
// The tag grows into the free space (the pill is flush right), so the slot must NOT
// reserve width — that reservation was the extra gap before the author.
check('the version slot adds no padding of its own', findByType(loginTree, node => node.props && String(node.props.className || '') === 'asc-hub-version-slot').length === 1 && !/\.asc-hub-version-slot \{[^}]*min-width:/.test(source))
check('the update tag asks the host to apply it', source.includes("store.perform('update.apply', { scope: update.scope })") && source.includes("update.available !== true"))
check('the footer reports the version and the mode', footerNode.length === 1 && footerText.includes('asc 6.5.3') && footerText.includes('write mode'), footerText)
check('the mode reads as a mode, not a badge', en.modeWrite === 'write mode' && zh.modeWrite === '可写模式' && en.modeReadOnly === 'read-only mode' && !source.includes('modePublish'))
check('the title names the product and the app it drives', en.title === 'ASC HUB (App Store Connect)' && zh.title === 'ASC HUB（App Store Connect）')
check('the title is the loudest type in the panel', /\.asc-hub-title \{[^}]*font-size: 18px;/.test(source) && /\.asc-hub-head \{[^}]*padding-bottom: 8px;/.test(source))
const footerLinks = findByType(footerNode[0], node => node.type === 'a')
check('both credits are links to their projects', footerLinks.length === 2 &&
  footerLinks.some(link => link.props.href === 'https://github.com/sleep9ull') &&
  footerLinks.some(link => link.props.href === 'https://github.com/rorkai/App-Store-Connect-CLI') &&
  footerLinks.every(link => link.props.target === '_blank' && /noopener/.test(String(link.props.rel))), footerLinks.map(link => link.props.href))
check('the author is credited with the copyright mark, not a handle', footerText.includes('©sleep9ull') && !footerText.includes('@sleep9ull'))
check('the engine credit is spelled out and localized', en.engineLabel === 'engine' && zh.engineLabel === '引擎' && !source.includes('powered by'))
check('the footer speaks with one voice', /\.asc-hub-foot \{[^}]*color: var\(--dsw-alias-label-secondary\);[^}]*font-size: 11px;/.test(source))
check('its links are plain grey, underlined only on hover', /\.asc-hub-foot-link \{[^}]*color: inherit;[^}]*text-decoration: none;/.test(source) && /\.asc-hub-foot-link:hover \{[^}]*text-decoration: underline;/.test(source))
// Whitespace inside an inline-flex child is trimmed, so the label/value pairs need a real gap.
check('labels are spaced from their values', /\.asc-hub-foot-part \{[^}]*gap: 0\.3em;/.test(source))
check('the footer reads as three dot-separated parts', findByType(loginTree, node => node.props && String(node.props.className || '') === 'asc-hub-foot-dot').length === 2)
check('the mode pill is flush right', /\.asc-hub-foot-actions \{[^}]*margin-left: auto;/.test(source) && (() => {
  const foot = findByType(loginTree, node => node.props && String(node.props.className || '') === 'asc-hub-foot')
  if (foot.length !== 1) return false
  const kids = (foot[0].children || []).filter(child => child && typeof child === 'object')
  const last = kids[kids.length - 1]
  return Boolean(last) && findByType(last, node => String(node.props && node.props.className || '').includes('asc-hub-mode-btn')).length === 1
})())
check('the footer holds its two ends apart', /\.asc-hub-foot \{[^}]*justify-content: space-between;/.test(source))
// Pinned, not trailing: the footer is a fixed band and the middle column scrolls.
check('the footer does not scroll with the content', /\.asc-hub-foot \{[^}]*flex: none;/.test(source) && !/\.asc-hub-foot \{[^}]*margin-top: auto;/.test(source))
check('a dedicated column does the scrolling', /\.asc-hub-scroll \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*overflow: auto;/.test(source) && /\.asc-hub-panel \{[^}]*overflow: hidden;/.test(source))
check('the panel claims the height the host tab gives it', /\[data-asc-hub\]\.asc-hub-root \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;/.test(source) && /\.asc-hub-panel \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;/.test(source))
// The root carries the data attribute itself; a descendant selector for it would be dead
// CSS (this is exactly why the footer used to travel with the content).
check('the root rule is a compound selector, not a dead descendant rule', !/\[data-asc-hub\] \.asc-hub-root \{/.test(source) && source.includes('[data-asc-hub].asc-hub-root {'))
check('the footer is a sibling of that column, not a child of it', (() => {
  const panel = findByType(loginTree, node => node.props && String(node.props.className || '') === 'asc-hub-panel')
  if (panel.length !== 1) return false
  const kids = (panel[0].children || []).filter(child => child && typeof child === 'object')
  const scroll = kids.find(child => String(child.props.className || '') === 'asc-hub-scroll')
  const foot = kids.find(child => String(child.props.className || '') === 'asc-hub-foot')
  return Boolean(scroll && foot) && !findByType(scroll, node => String(node.props.className || '') === 'asc-hub-foot').length
})())
check('the footer is the last child of the panel', (() => {
  const panel = findByType(loginTree, node => node.props && String(node.props.className || '') === 'asc-hub-panel')
  if (panel.length !== 1) return false
  const kids = (panel[0].children || []).filter(child => child && typeof child === 'object')
  const last = kids[kids.length - 1]
  return Boolean(last && String(last.props.className || '') === 'asc-hub-foot')
})())
check('panel header is localized', loginText.includes('App Store Connect'))
check('panel shows the detected engine version', loginText.includes('asc 6.5.3 ready'), loginText)
check('sign-in step states the API key and the Keychain in one line', loginText.includes('Sign in with an App Store Connect API key. asc stores it in the macOS Keychain.'), loginText)
check('sign-in step carries no security essay', !loginText.includes('never asks for an Apple ID password') && !loginText.includes('never leaves this Mac'), loginText)
check('sign-in step offers the API key page', findByType(loginTree, node => node.type === 'button' && collectText(node).includes('Get an API key')).length === 1)
const keyRow = findByType(loginTree, node => node.props && String(node.props.className || '').includes('asc-hub-key-row'))
check('the key is one drop row', keyRow.length === 1, keyRow.length)
check('the drop row carries the hidden .p8 input and a choose button', keyRow.length === 1 &&
  findByType(keyRow[0], n => n.type === 'input' && n.props.type === 'file').length === 1 &&
  findByType(keyRow[0], n => n.type === 'button' && collectText(n).includes('Choose file')).length === 1)
check('the panel never asks for a filesystem path', !source.includes('privateKeyPath') && !source.includes('keyPathHint'))
check('sign-in asks for two ids and a key file, with the optional name folded away', findByType(loginTree, node => node.type === 'input' && node.props.type === 'text').length === 2 && findByType(loginTree, node => node.type === 'input' && node.props.type === 'file').length === 1)
check('sign-in step labels every credential field', ['Key ID', 'Issuer ID', 'Private key (.p8)', 'Profile name (optional)'].every(text => collectText(loginTree).includes(text)))
const apiKeyButton = findByType(loginTree, node => node.type === 'button' && collectText(node).includes('Get an API key'))
const verifyButton = findByType(loginTree, node => node.type === 'button' && collectText(node).includes('Verify and sign in'))
check('getting a key is a white button with an accent edge', apiKeyButton.length === 1 && apiKeyButton[0].props.className.includes('asc-hub-btn-outline') && !apiKeyButton[0].props.className.includes('asc-hub-btn-primary'), apiKeyButton.length ? apiKeyButton[0].props.className : 'missing')
const outlineColour = [...source.matchAll(/\.asc-hub-btn-outline \{[^}]*\}/g)].map(match => match[0]).find(rule => rule.includes('background:'))
check('that button is a hairline edge with an accent label', Boolean(outlineColour) && outlineColour.includes('background: var(--dsw-alias-bg-base)') && /border: 1px solid var\(--dsw-alias-border-l2\)/.test(outlineColour) && outlineColour.includes('color: var(--dsw-alias-brand-primary)'), outlineColour)
// The base button sets the border shorthand, so the outline rule has to come after it;
// that ordering is what made an earlier version silently lose its edge colour.
check('the outline rule is declared after the rule that would override it', source.indexOf('.asc-hub-btn-outline { border:') > source.indexOf('.asc-hub-btn { display: inline-flex'), [source.indexOf('.asc-hub-btn-outline { border:'), source.indexOf('.asc-hub-btn { display: inline-flex')])
check('verifying is the primary button', verifyButton.length === 1 && verifyButton[0].props.className.includes('asc-hub-btn-primary'), verifyButton.length ? verifyButton[0].props.className : 'missing')
check('verify stays clickable while fields are empty so it can explain what is missing', verifyButton.length === 1 && verifyButton[0].props.disabled === false)
const sizeRule = /\.asc-hub-step-body \.asc-hub-btn-primary,\s*\n\[data-asc-hub\] \.asc-hub-step-body \.asc-hub-btn-outline \{[^}]*width: 11\.5em;[^}]*min-height: 30px;/.exec(source)
check('both actions share one size rule', Boolean(sizeRule), sizeRule && sizeRule[0].slice(0, 60))
check('no field is marked before the first click', findByType(loginTree, node => node.props && node.props['aria-invalid'] === 'true').length === 0 && findByType(loginTree, node => node.props && node.props['data-invalid'] === 'true').length === 0)
check('every text field is three buttons wide, not full bleed', /\.asc-hub-field > \.asc-hub-input,\s*\n\[data-asc-hub\] \.asc-hub-optional-body > \.asc-hub-input,\s*\n\[data-asc-hub\] \.asc-hub-key-row \{ width: calc\(3 \* 11\.5em \* 12\.5 \/ 12\); max-width: 100%; \}/.test(source))
const startButton = findByType(loginTree, node => node.type === 'button' && collectText(node).join('') === 'Start to build')
check('the last card is entered through Start to build', startButton.length === 1 && startButton[0].props.className.includes('asc-hub-btn-primary'), startButton.length)
const submitRow = findByType(loginTree, node => node.props && String(node.props.className || '').includes('asc-hub-actions-submit'))
check('no help card hangs off the key button', !source.includes('asc-hub-help') && !source.includes('KeyHelp') && !source.includes('helpAria'))
check('the verify row is spaced off the fields above it', submitRow.length === 1 && findByType(submitRow[0], node => node.type === 'button').length === 1 && /\.asc-hub-actions-submit \{ margin-top: 9px; \}/.test(source))
const loginRows = findByType(loginTree, node => node.props && String(node.props.className || '').includes('asc-hub-phase'))
const openSignIn = loginRows.find(row => collectText(row).join(' ').includes('Sign in to App Store Connect'))
check('once the engine is in, that card comes alive', Boolean(openSignIn) &&
  findByType(openSignIn, node => node.type === 'button').every(node => node.props.disabled !== true) &&
  findByType(openSignIn, node => node.type === 'input').every(node => node.props.disabled !== true),
  openSignIn ? findByType(openSignIn, n => n.type === 'button').filter(n => n.props.disabled === true).length : 'missing')
const messageSlots = findByType(loginTree, node => node.props && String(node.props.className || '').includes('asc-hub-field-msg'))
check('every credential field reserves a message line', messageSlots.length === 3, messageSlots.length)
check('the reserved lines are empty until the first click', messageSlots.every(slot => collectText(slot).join('') === ''), messageSlots.map(slot => collectText(slot).join('')))
check('the reserved line has a height in css so a sentence cannot reflow the card', /\.asc-hub-field-msg \{[^}]*min-height: 1\.4em;/.test(source))
check('the messages are localized in both languages', ['errKeyId', 'errIssuerId', 'errKeyFile'].every(name => typeof en[name] === 'string' && typeof zh[name] === 'string'))
check('sign-in step offers verify and sign in', findByType(loginTree, node => node.type === 'button' && collectText(node).includes('Verify and sign in')).length === 1)
const rows = findByType(loginTree, node => node.props && typeof node.props.className === 'string' && node.props.className.split(' ')[0] === 'asc-hub-phase')
check('onboarding rows do not reuse the console list-row class', !source.includes("className: 'asc-hub-row', 'data-state'"))
check('onboarding renders three spine rows in order', rows.length === 3, rows.length)
check('spine rows carry done, current, pending', rows.map(row => row.props['data-state']).join(',') === 'done,current,pending', rows.map(row => row.props['data-state']).join(','))
check('every row has exactly one card', findByType(loginTree, node => node.props && typeof node.props.className === 'string' && node.props.className.split(' ')[0] === 'asc-hub-step').length === 3)
const installedAt = loginText.indexOf('Installed')
const versionAt = loginText.indexOf('asc 6.5.3 ready')
check('the version line sits above the Install button', installedAt > 0 && versionAt > 0 && versionAt < installedAt, [versionAt, installedAt])
check('the version reads on the line under the button', findByType(loginTree, node => node.props && String(node.props.className || '').includes('asc-hub-step-caption')).length === 1 &&
  findByType(loginTree, node => node.props && String(node.props.className || '').includes('asc-hub-step-inline')).length === 0)
const installedButton = findByType(loginTree, node => node.type === 'button' && collectText(node).includes('Installed'))
check('installed engine keeps a greyed button in place', installedButton.length === 1 && installedButton[0].props.disabled === true, installedButton.length)
const toggle = findByType(loginTree, node => node.type === 'button' && String(node.props.className || '').includes('asc-hub-optional-toggle'))
check('the optional profile name starts folded', toggle.length === 1 && toggle[0].props['aria-expanded'] === 'false' && toggle[0].props['data-open'] === 'false', toggle.length)
const profileBody = findByType(loginTree, node => node.props && String(node.props.className || '').includes('asc-hub-optional-body'))
check('the folded field takes no space at all', profileBody.length === 0)
check('opening the triangle is what adds the field and its height', source.includes('showProfile ? h(\'div\', { className: \'asc-hub-optional-body\' }') && !source.includes('visibility: hidden'))
check('sign-in does not ask for a password field', findByType(loginTree, node => node.type === 'input' && node.props.type === 'password').length === 0)
const loginCleanups = runEffects()
const modeButton = findByType(loginTree, node => node.type === 'button' && String(node.props.className || '').includes('asc-hub-mode-btn'))
check('the mode pill is a button', modeButton.length === 1 && modeButton[0].props['data-mode'] === 'write' && modeButton[0].props.disabled === false, modeButton.length)
const readOnlyTree = await renderPanel(Object.assign({}, loginState, { mode: 'read-only' }))
const readButton = findByType(readOnlyTree, node => node.type === 'button' && String(node.props.className || '').includes('asc-hub-mode-btn'))
check('read-only is the neutral state of that pill', readButton.length === 1 && readButton[0].props['data-mode'] === 'read-only' && collectText(readButton[0]).join('') === 'read-only mode')
check('write mode paints the pill with the host warn token', /\.asc-hub-mode-btn\[data-mode="write"\] \{[^}]*background: var\(--dsw-alias-state-warn-primary\);/.test(source))
check('clicking it asks the host to switch', source.includes("store.perform('mode.set', { mode: next })") && source.includes("const next = mode === 'write' ? 'read-only' : 'write'"))
const withUpdate = await renderPanel(Object.assign({}, loginState, { update: { available: true, scope: 'core', latest: '6.6.0' } }))
const updateTag = findByType(withUpdate, node => node.type === 'button' && String(node.props.className || '').includes('asc-hub-update-tag'))
check('an available update turns the version into a tag', updateTag.length === 1 && collectText(updateTag[0]).join('') === '0.1.0 ↑' && updateTag[0].props.title === 'update' && updateTag[0].props.disabled === false, updateTag.length ? collectText(updateTag[0]).join('') : updateTag.length)
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
// Signed in: the card reports the state and offers one word to take it back.
// phase stays 'login' so the panel keeps the onboarding view (a 'ready' phase jumps
// straight to the console); the sign-in itself is what this fixture is about.
const verifiedStateValue = Object.assign({}, loginState, {
  auth: { configured: true, profiles: ['default'], activeProfile: 'default', storage: 'System Keychain' },
})
const verifiedTree = await renderPanel(verifiedStateValue)
const verifiedText = collectText(verifiedTree).join(' | ')
check('a verified sign-in keeps the whole form in place', verifiedText.includes('Get an API key') && verifiedText.includes('Key ID') && verifiedText.includes('Private key (.p8)') && !verifiedText.includes('Verify and sign in'), verifiedText)
check('a verified sign-in says so in the button slot', findByType(verifiedTree, node => node.type === 'button' && collectText(node).join('') === 'Verified').length === 1)
const verifiedButton = findByType(verifiedTree, node => node.type === 'button' && collectText(node).join('') === 'Verified')
check('verified is a state, not something to press', verifiedButton.length === 1 && verifiedButton[0].props.disabled === true)
const resetButton = findByType(verifiedTree, node => node.type === 'button' && collectText(node).join('') === 'Reset')
check('one word beside it resets the sign-in', resetButton.length === 1 && resetButton[0].props.className.includes('asc-hub-link') && resetButton[0].props.disabled === false)
check('a verified sign-in locks its three fields', (() => {
  const rows = findByType(verifiedTree, node => node.props && String(node.props.className || '').includes('asc-hub-phase'))
  const card = rows.find(row => collectText(row).join(' ').includes('Sign in to App Store Connect'))
  if (!card) return false
  const inputs = findByType(card, node => node.type === 'input')
  const choose = findByType(card, node => node.type === 'button' && collectText(node).join('') === 'Choose file')
  const apiKey = findByType(card, node => node.type === 'button' && collectText(node).join('') === 'Get an API key')
  return inputs.length >= 2 && inputs.every(node => node.props.disabled === true) &&
    choose.every(node => node.props.disabled === true) &&
    apiKey.every(node => node.props.disabled === true)
})())
check('the verified fields keep their values', source.includes('const locked = verified || !enabled'))
check('verified and reset share the action line', (() => {
  const row = findByType(verifiedTree, node => node.props && String(node.props.className || '').includes('asc-hub-actions-submit'))
  return row.length === 1 && findByType(row[0], node => node.type === 'button').length === 2
})())
check('the reset word is localized', en.resetSignIn === 'Reset' && zh.resetSignIn === '重置' && !('undoSignIn' in en))
check('that word really signs out', source.includes("store.perform('auth.logout'") && source.includes("t('signOutDone')"))
check('the subtitle stops nagging once signed in', verifiedText.includes('Signed in. asc keeps the key in the macOS Keychain.'))

const engineTree = await renderPanel(engineStateValue)
const engineText = collectText(engineTree).join(' | ')
check('install step explains the engine under its title', engineText.includes('A required core engine the plugin drives to reach App Store Connect.'), engineText)
const subtitles = findByType(loginTree, node => node.props && typeof node.props.className === 'string' && node.props.className.includes('asc-hub-step-sub'))
check('every card explains itself under its title', subtitles.length === 3, subtitles.length)
check('the engine card explains why the engine is needed', collectText(subtitles[0]).join('').includes('A required core engine'), collectText(subtitles[0] || {}).join(''))
check('the last card says what the console is for', loginText.includes('Opens the console in this panel: builds, TestFlight, review and sales.'))
check('install step carries no installer-mechanism detail', !engineText.includes('Homebrew') && !engineText.includes('curl'), engineText)
const flowTitles = ['Install the asc engine', 'Sign in to App Store Connect', 'Finish setup']
const flowOrder = flowTitles.map(title => engineText.indexOf(title))
check('the single-page flow renders 1-2-3 in order', flowOrder.every((at, index) => at > 0 && (index === 0 || at > flowOrder[index - 1])), flowOrder)
check('every card names its ordinal to assistive tech', ['Step 1 of 3', 'Step 2 of 3', 'Step 3 of 3'].every(text => engineText.includes(text)))
check('a locked secondary action greys its label too', /\.asc-hub-btn-outline:disabled \{[^}]*color: var\(--dsw-alias-label-secondary\);/.test(source) && /\.asc-hub-btn-primary:disabled \{[^}]*color: var\(--dsw-alias-label-secondary\);/.test(source))
check('the status slot is declared before the button', (() => {
  const slotAt = source.indexOf("className: 'asc-hub-engine-slot'")
  const buttonAt = source.indexOf("}, engineReady ? t('installedLabel') : t('installAsc'))")
  return slotAt !== -1 && buttonAt !== -1 && slotAt < buttonAt
})())
const engineSlot = findByType(engineTree, node => node.props && String(node.props.className || '') === 'asc-hub-engine-slot')
check('the install slot is in the layout before any click', engineSlot.length === 1 && collectText(engineSlot[0]).join('') === '', engineSlot.length)
check('the slot is exactly one text line tall', /\.asc-hub-engine-slot \{[^}]*height: 1\.6em;/.test(source) && !source.includes('asc-hub-step-output'))
check('only the last line of installer output is kept', source.includes('.slice(-1)') && source.includes("className: 'asc-hub-engine-log'"))
const installedSlot = findByType(loginTree, node => node.props && String(node.props.className || '') === 'asc-hub-engine-slot')
check('the installed card fills the same slot', installedSlot.length === 1 && collectText(installedSlot[0]).join(' ').includes('(asc 6.5.3 ready)'))
check('one line of output is the whole budget', source.includes('slice(-1)') && !source.includes('slice(-3)'))
// Step 2 waits for step 1: in the engine-missing render every control in the sign-in
// card is disabled — buttons, text inputs and the file picker alike.
const engineRows = findByType(engineTree, node => node.props && String(node.props.className || '').includes('asc-hub-phase'))
const signInCard = engineRows.find(row => collectText(row).join(' ').includes('Sign in to App Store Connect'))
check('during step 1 the sign-in card is fully locked', Boolean(signInCard) &&
  findByType(signInCard, node => node.type === 'button').every(node => node.props.disabled === true) &&
  findByType(signInCard, node => node.type === 'input').every(node => node.props.disabled === true),
  signInCard ? { buttons: findByType(signInCard, n => n.type === 'button').length, enabled: findByType(signInCard, n => n.type === 'button').filter(n => n.props.disabled !== true).length } : 'missing card')
check('and it says so with a locked drop row', Boolean(signInCard) && findByType(signInCard, node => node.props && node.props['data-locked'] === 'true').length === 1)
const installButton = findByType(engineTree, node => node.type === 'button' && collectText(node).includes('Install'))
check('install step offers a primary install button', installButton.length === 1 && installButton[0].props.className.includes('asc-hub-btn-primary'), installButton.length)
check('installing is reported under the button, not in the header', /busy\s*\?\s*h\('span', \{ className: 'asc-hub-step-caption' \}, t\('installing'\)\)/.test(source) && !source.includes("className: 'asc-hub-live'"))
check('the header keeps the busy announcement for assistive tech only', /className: 'asc-hub-sr', role: 'status'/.test(source))
check('the button keeps saying Install while it works', !/@engineReady \? t\('installedLabel'\) : busy/.test(source) && source.includes("engineReady ? t('installedLabel') : t('installAsc')"))
check('install button is a real button with aria-busy', installButton.length === 1 && installButton[0].props.type === 'button')
runEffects().forEach(cleanup => cleanup())

const readyStateValue = {
  phase: 'ready',
  skills: { installed: true, count: 25, ref: 'f52c4f04323bb2dfb21ca8be82e6494e9cd0b4d8', installedAt: '2026-10-25T03:27:06.737725Z', root: '/Users/x/.agents/skills', checkedAt: '2026-11-09T00:00:00.000Z' },
  label: 'ready',
  engine: { installed: true, path: '/opt/homebrew/bin/asc', version: '6.5.3', source: 'path', brew: { installed: true } },
  auth: { configured: true, profiles: [{ name: 'Work', keyId: 'ABCD1234' }], activeProfile: 'Work', storage: 'System Keychain' },
  app: null,
  operation: null,
  lastError: null,
}
// A signed-in panel still stops at step three: signing in is not the same as finishing.
// The panel remembers the click itself, so the next render is the one that shows the console.
const notDoneTree = await renderPanel(readyStateValue)
const notDoneText = collectText(notDoneTree).join(' ')
const finishButton = findByType(notDoneTree, node => node.type === 'button' && collectText(node).join('') === 'Start to build')
check('a signed-in panel waits for that click', notDoneText.includes('Start to build') && !notDoneText.includes('Choose an app'), notDoneText.slice(0, 120))
check('that click is the last thing asked of the user', finishButton.length === 1 && finishButton[0].props.disabled === false)
finishButton[0].props.onClick()
// The click is the completion: the next render is the console, exactly as a refresh after
// the click would be.
const consoleTree = await renderPanel(readyStateValue)
check('that click is what opens the console', !collectText(consoleTree).join(' ').includes('Start to build'))
check('onboarding state is claimed from the browser', source.includes('const [onboarded, setOnboarded] = React.useState(readOnboarded)') && source.includes("const ONBOARDED_KEY = 'dsh-asc-hub:onboarded'"))
const consoleText = collectText(consoleTree).join(' | ')
const skillsToggle = findByType(consoleTree, node => node.type === 'button' && String(node.props.className || '') === 'asc-hub-optional-toggle' && collectText(node).join('').includes('Skills pack'))
check('the console reports the inherited skill pack', skillsToggle.length === 1 && collectText(skillsToggle[0]).join('').includes('25 skills') && collectText(skillsToggle[0]).join('').includes('f52c4f0'), skillsToggle.length ? collectText(skillsToggle[0]).join('') : 'missing')
check('the pack row starts open, with its examples in reach', skillsToggle.length === 1 && skillsToggle[0].props['aria-expanded'] === 'true' && findByType(consoleTree, node => node.props && String(node.props.className || '') === 'asc-hub-skills-uses').length === 1)
const exampleKeys = ['skillsUse1', 'skillsUse2', 'skillsUse3', 'skillsUse4', 'skillsUse5', 'skillsUse6', 'skillsUse7']
check('the pack explains itself as seven concrete asks, in both locales', exampleKeys.every(key => typeof en[key] === 'string' && en[key].length > 10 && typeof zh[key] === 'string' && zh[key].length > 5) && en.skillsHint === undefined && zh.skillsHint === undefined && exampleKeys.every(key => Object.prototype.hasOwnProperty.call(en, key)))
const skillUses = findByType(consoleTree, node => node.props && String(node.props.className || '') === 'asc-hub-skills-uses')[0]
check('seven asks render, one per line', Boolean(skillUses) && (skillUses.children || []).flat(Infinity).filter(child => child && child.type === 'li').length === 7, skillUses && JSON.stringify(skillUses.children || []).slice(0, 80))
check('the asks are a list, not a paragraph', source.includes("SKILL_EXAMPLES.map(key => h('li', { key }, t(key)))") && /\[data-asc-hub\] \.asc-hub-skills-uses li \{[^}]*padding-left: 10px/.test(source))
// The disclosure body is rendered only while open; the stub keeps no state across
// renders, so the toggle's own contract is checked in source.
check('the pack action sits at the end of the summary line', /className: 'asc-hub-skills-head'/.test(source) && source.includes("className: 'asc-hub-skills-action'"))
check('it appears only when there is something to do', source.includes("!installed ? t('skillsInstall') : pending ? t('skillsUpdate') : ''") && source.includes('const pending = installed && skills.update === true'))
const skillsSource = source.slice(source.indexOf('function SkillsRow'), source.indexOf('function Console'))
check('the body no longer carries a second button', !skillsSource.includes('asc-hub-btn-outline') && /\? t\('skillsInstalling'\) : action\)/.test(skillsSource), skillsSource.length)
check('installing goes through the host action', source.includes("store.perform('skills.install', {})") && source.includes('asc install-skills'))
check('console renders the app picker', consoleText.includes('App') && consoleText.includes('Choose an app to enable the build'), consoleText.slice(-600))
check('the directory section is titled and always present', consoleText.includes('Working directory') && en.workspaceLabel === 'Working directory' && typeof zh.workspaceLabel === 'string')
check('the first section is labelled for both the name and the bundle id', consoleText.includes('App & Bundle') && en.appTitle === 'App & Bundle' && typeof zh.appTitle === 'string' && zh.appTitle.includes('Bundle'))
check('empty-list copy is localized', typeof en.noApps === 'string' && typeof en.noGroups === 'string' && typeof en.noAnalytics === 'string')
check('a build reads the way Xcode names it', source.includes("return version + ' (' + number + ')'") && source.includes('buildLabel(build)'))
check('processing states are said in words where a card still shows one', ['buildReady', 'buildProcessing', 'buildInvalid', 'buildExpired'].every(name => typeof en[name] === 'string' && typeof zh[name] === 'string') && !source.includes('processingLabel(t, build.processingState)'))
const workspaceSource = source.slice(source.indexOf('function WorkspaceCard'), source.indexOf('function BuildsCard'))
check('the directory is a section of its own, with the standard card chrome', (source.match(/h\(WorkspaceCard, \{ t, store, sessionId \}\)/g) || []).length === 1 && workspaceSource.includes("className: 'asc-hub-card'") && workspaceSource.includes("className: 'asc-hub-card-head'") && workspaceSource.includes("asc-hub-card-title' }, t('workspaceLabel')"), workspaceSource.length)
check('one spacing rhythm: 14px between sections, no hairline inside one', /\[data-asc-hub\] \.asc-hub-console \{ display: flex; flex-direction: column; gap: 14px;/.test(source) && !/\.asc-hub-workspace \{[^}]*border-top/.test(source) && !source.includes('asc-hub-workspace-label'))
check('the directory comes from the host, keyed by the session', source.includes("useQuery(store, 'workspace.info', sessionId ? { sessionId } : {}, true)") && source.includes('sessionId: props.sessionId'))
check('the directory section also states the checkout', ['gitClean', 'gitUncommitted', 'gitUntracked', 'gitAheadTitle', 'gitBehindTitle'].every(key => typeof en[key] === 'string' && en[key].length > 3 && typeof zh[key] === 'string' && zh[key].length > 1) && source.includes('asc-hub-workspace-git') && source.includes("t('gitUncommitted', { count: changed })") && source.includes("t('gitBehindTitle', { count: behind, upstream })"))
check('an uncommitted tree is counted, not guessed', source.includes("if (changed !== null && changed > 0)") && source.includes("if (untracked !== null && untracked > 0)") && source.includes('const clean = !!(data && data.clean === true)'))
check('a linked worktree is named as one', source.includes("className: 'asc-hub-workspace-path'") && source.includes('data.worktree === true') && typeof en.worktreeTag === 'string' && typeof zh.worktreeTag === 'string' && source.includes("'workspaceLabel'"))
check('console renders the builds card', consoleText.includes('Builds'))
check('the app card is one row, so the picker and its label share a line', /\[data-asc-hub\] \.asc-hub-inline \{ display: flex; align-items: center;/.test(source) && source.includes("h('span', { className: 'asc-hub-inline-label' }, t('appTitle'))"))
check('the redundant app label is gone', !source.includes('App and bundle id') && !source.includes("'appChoose'"))
check('builds are three columns, with the state a short step right of the build id', /\[data-asc-hub\] \.asc-hub-row-build \{ display: grid; grid-template-columns: minmax\(9\.5em, max-content\) max-content minmax\(0, 1fr\);/.test(source) && source.includes('.asc-hub-row-build > .asc-hub-chip { justify-self: start; }') && source.includes('.asc-hub-row-date { justify-self: end; }'))
check('a build names the TestFlight audience it reached', source.includes("'data-audience': 'internal'") && source.includes("'data-audience': 'external'") && source.includes('build.internal === true') && source.includes('build.external === true'))
check('the TestFlight group list no longer repeats the audience', !source.includes("group.internal === true ? t('internalGroup')"))
check('audience tags are localized in both locales', typeof en.internalGroup === 'string' && typeof zh.internalGroup === 'string' && typeof en.tfExternalTitle === 'string' && typeof zh.tfExternalTitle === 'string')
check('console renders the TestFlight card', consoleText.includes('TestFlight'))
// Parked, not deleted: the cards still exist in the file but are not rendered.
check('the console shows builds, TestFlight and release, and nothing parked', consoleText.includes('Release') && !consoleText.includes('Sales') && !consoleText.includes('Analytics reports'), consoleText.slice(-400))
check('the release section states readiness, blockers and the one action', source.includes("useQuery(store, 'release.readiness'") && source.includes("t('blockersTitle')") && source.includes("t('confirmSubmit')") && source.includes('disabled: busy || !confirm || !ready') && source.includes("store.perform('release.submit', input)") && source.includes('void store.refreshAll()'))
check('review shows the review state, the blockers and their remediation', source.includes("t('reviewTitle')") && source.includes('blocker.detail') && source.includes("t('readinessWarnings'") && source.includes('!reviewed && !blockedByShippedVersion && ready ? h(\'label\''))
check('a build that already passed review says Reviewed and offers no button', source.includes("t('reviewedTag')") && source.includes("t('reviewedHint'") && source.includes("useQuery(store, 'release.versions'") && source.includes('const carriedBy = build ? versionsData && versionsData.find(entry => entry.buildId === build.id) : null') && source.includes('!reviewed && !blockedByShippedVersion && appId ? h(ActionRow') && source.includes("t('versionShippedTag')") && source.includes("t('versionShippedHint', { version })"))
check('release only acts on a version awaiting developer release', source.includes("const pending = versionState === 'PENDING_DEVELOPER_RELEASE'") && source.includes("store.perform('release.publish', { appId, versionId, confirm: true })") && source.includes("t('confirmRelease')") && source.includes("t('releaseNotReady')") && source.includes("t('attachedBuild')"))
check('review and release are two sections, in that order, and the rest stays parked', source.includes('function ReviewCard') && source.includes('function ReleaseCard') && source.includes('function SalesCard') && source.includes('function AnalyticsCard') && source.includes("store.perform('release.submit'") && source.includes("store.perform('release.publish'") && source.indexOf('h(TestFlightCard, {') < source.indexOf('h(ReviewCard, {') && source.indexOf('h(ReviewCard, {') < source.indexOf('h(ReleaseCard, {'))
check('the release row carries no tint, and the pager has its own row', !source.includes('color-mix(') && source.includes('.asc-hub-rows-more {') && source.includes("className: 'asc-hub-rows-more'"))
check('the setup steps stay reachable from the console', source.includes("t('setupLink')") && source.includes('onClick: keepOnboarding') && source.includes("t('setupHint')") && ['setupLink', 'setupHint'].every(key => typeof en[key] === 'string' && typeof zh[key] === 'string'))
check('a disabled primary action reads as disabled', source.includes('[data-asc-hub] .asc-hub-btn-primary:disabled {') && source.includes('cursor: default; }'))
check('the submission date is scoped to the selected build\'s version', source.includes("String(releaseData.version || '') === version"))
check('the shared shell pieces are all still defined', ['LogArea', 'SkillsRow', 'SalesCard', 'AnalyticsCard'].every(name => source.includes('function ' + name + '(')))
check('the list starts at three builds and grows by three, as grey underlined text', source.includes('const BUILD_PAGE = 3') && source.includes('const PICK_LIMIT = 12') && source.includes('const shown = builds.slice(0, visible)') && source.includes('setVisible(current => current + BUILD_PAGE)') && source.includes('onClick: () => setVisible(BUILD_PAGE)') && source.includes("t('loadMore')") && source.includes("t('showLess')") && (source.match(/asc-hub-link asc-hub-link-quiet/g) || []).length === 3 && source.includes('.asc-hub-link-quiet { color: var(--dsw-alias-label-secondary); }'))
check('app-scoped cards ask for an app when none is chosen', consoleText.includes('Choose an app above'), consoleText)
check('console keeps the operation log collapsed', findByType(consoleTree, node => node.type === 'details' && node.props.className === 'asc-hub-log').length === 1)
check('console has a close control', findByType(consoleTree, node => node.type === 'button' && node.props['aria-label'] === 'Close').length === 1)
const closeButton = findByType(consoleTree, node => node.type === 'button' && node.props['aria-label'] === 'Close')[0]
closeButton.props.onClick()
check('close control calls tab.actions.close', panelClosed === 1, panelClosed)
runEffects().forEach(cleanup => cleanup())

/* The first paint happens with no status at all; a null dereference there takes the
   whole slot entry down, which is what a white panel looks like. Run last, because a
   render here bumps the bind/close counters the checks above assert on. */
let firstPaint = null
let firstPaintError = null
try {
  firstPaint = await renderPanel(null)
} catch (error) {
  firstPaintError = error
}
check('the first paint, before any status arrives, renders instead of crashing', firstPaintError === null && firstPaint !== null && collectText(firstPaint).join(' ').length > 0, firstPaintError && firstPaintError.message)

/* Panel title registration */
const titleRegistration = slotRegistrations.find(item => item.options.key === 'dsh-asc-hub' && item.options.name === 'sidebar.right.pane.tab.title')
const titleTree = titleRegistration.component({ t, locale: ctx.locale })
check('panel tab title is localized', collectText(titleTree).join('') === 'ASC Hub', collectText(titleTree).join(''))
check('trigger aria label interpolates the label', String(t('statusAria', { label: t('label.ready', {}) })).includes('ready'))
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
