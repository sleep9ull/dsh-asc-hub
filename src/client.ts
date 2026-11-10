/* ------------------------------------------------------------------ *
 * Types
 * The Client half is a browser script, not a module: the Harness module
 * loader calls the factory with a `require` table that holds react and
 * nothing else, so there is no import or export anywhere below. The
 * declarations here describe exactly what that table provides, what the
 * Fetch bridge answers, and what each card reads out of it.
 * ------------------------------------------------------------------ */

/** Anything React can render. Every node in this file comes from h(). */
type Child = unknown

/** The props h() accepts: the DOM-ish attribute set this panel actually uses. */
type ElementProps = {
  [key: string]: unknown
  children?: Child
  className?: string
  key?: string | number
  ref?: { current: unknown }
  id?: string
  role?: string
  title?: string
  href?: string
  target?: string
  rel?: string
  type?: string
  value?: string
  checked?: boolean
  disabled?: boolean
  placeholder?: string
  accept?: string
  autoComplete?: string
  spellCheck?: boolean
  tabIndex?: number
  inputMode?: string
  onClick?: () => void
  onChange?: (event: ChangeEvent) => void
  onDragOver?: (event: DragEventLike) => void
  onDragLeave?: (event: DragEventLike) => void
  onDrop?: (event: DragEventLike) => void
}

/** The part of a change event the panel reads: the field it landed on. */
type ChangeEvent = { target: { value: string; checked: boolean; files: FileList } }

/** The part of a drag event the panel reads: stop the browser, take the file. */
type DragEventLike = { preventDefault(): void; dataTransfer: { files: FileList } | null }

/** What h() returns. React keeps children in props; the type keeps both. */
type VNode = { type: unknown; props: ElementProps; children: Child[] }

/** A renderable component: props in, a child out. */
type Component<P extends object> = (props: P) => Child

/** React.createElement, in the two call shapes this file uses. */
interface CreateElement {
  (type: string, props?: ElementProps | null, ...children: Child[]): VNode
  <P extends object>(type: Component<P>, props?: P | null, ...children: Child[]): VNode
}

type SetState<T> = (next: T | ((prev: T) => T)) => void

/** The react module behind the loader's require table: five hooks and a factory. */
type ReactModule = {
  createElement: CreateElement
  useState<T>(initial: T | (() => T)): [T, SetState<T>]
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  useRef<T>(initial: T): { current: T }
  useCallback<T>(fn: T, deps?: readonly unknown[]): T
  useSyncExternalStore<T>(subscribe: (onStoreChange: () => void) => () => void, getSnapshot: () => T): T
}

/** One translated string. `t` is ctx.locale.bind('asc-hub'). */
type Translate = (key: string, params?: Record<string, unknown>) => string

/* ---- the wire ---------------------------------------------------- */

/** The Host answers with JSON objects; each card narrows the fields it needs. */
type JsonData = { [key: string]: unknown }

/** The error half of the wire, before it is normalised. */
type WireErrorLike = { code?: unknown; message?: unknown; detail?: unknown; details?: { text?: unknown; detail?: unknown } | null }

/** What ctx.connection.rpc.call resolves to. */
type WireReply = { ok?: unknown; value?: unknown; error?: WireErrorLike | null } | null | undefined

/** A normalised failure: the code, its message and the redacted detail. */
type HubError = { code: string; message: string; detail: string }

/** A failed call, with the unwrapping already done. */
type ProbeFailure = { ok: false; error: HubError }
/** A successful call whose payload has been unwrapped. */
type ProbeSuccess = { ok: true; data: JsonData | null }
/** The result envelope every read travels in. */
type ProbeResult = ProbeSuccess | ProbeFailure
/** A raw call: the payload is still wrapped in the Host's envelope. */
type CallResult = { ok: true; value: JsonData | null } | { ok: false; error: HubError }
/** One read, as the store exposes it. */
type Probe = (action: string, input?: unknown, signal?: AbortSignal) => Promise<ProbeResult>

/* ---- the inputs the panel sends ----------------------------------- */

/** `sales.summary`: the app, the period, and the two optional scopes. */
type SalesInput = { appId: string; period: string; date?: string; vendorNumber?: string }
/** `testflight.distribute`: the build and the groups it is sent to. */
type DistributeInput = { appId: string; buildId: string; groupIds: string[]; confirm: boolean; whatsNew?: string }
/** `release.submit`: the build under review, and the version it belongs to. */
type SubmitInput = { appId: string; buildId: string; confirm: boolean; version?: string }

/* ---- what the Host reports --------------------------------------- */

type EngineInfo = { installed?: boolean; path?: string; version?: string; source?: string; brew?: { installed?: boolean } | null }
type AuthInfo = { configured?: boolean; profiles?: Array<{ name?: string; keyId?: string }>; activeProfile?: string | null; storage?: string }
type HubInfo = { version?: string }
type UpdateInfo = { available?: boolean; scope?: unknown; latest?: unknown }
type SkillsInfo = { installed?: boolean; update?: boolean; count?: number; ref?: string; installedAt?: string; root?: string }
type HubState = {
  phase?: string
  label?: string
  mode?: string
  config?: { mode?: string }
  engine?: EngineInfo | null
  auth?: AuthInfo | null
  hub?: HubInfo | null
  update?: UpdateInfo | null
  skills?: SkillsInfo | null
  operation?: { kind?: string } | null
  lastError?: unknown
  app?: unknown
}

type AppInfo = { id: string; name?: unknown; bundleId?: unknown }
type BuildInfo = {
  id: string
  version?: string
  buildNumber?: string
  processingState?: string
  expired?: boolean
  internal?: boolean
  external?: boolean
  uploadedDate?: string
}
type GroupInfo = { id: string; name?: unknown; testerCount?: number }
type WorkspaceBuild = { ready?: boolean; ios?: boolean; reason?: string; name?: unknown }
type WorkspaceInfo = {
  display?: string
  cwd?: string
  branch?: string
  upstream?: string
  worktree?: boolean
  ahead?: number
  behind?: number
  changed?: number
  untracked?: number
  clean?: boolean
  build?: WorkspaceBuild | null
}
type SalesRow = { date?: unknown; day?: unknown; units?: unknown; proceeds?: unknown; currency?: unknown }
type SalesTotals = { units?: unknown; proceeds?: unknown }
type BlockerInfo = { code?: unknown; message?: unknown; detail?: unknown }
type VersionEntry = { buildId?: unknown; version?: unknown; state?: unknown }

/* ---- store and query --------------------------------------------- */

type LogEntry = { id: number; action: string; text: string }
type StoreState = {
  status: HubState | null
  statusError: HubError | null
  hostDown: boolean
  loading: boolean
  label: string
  busyAction: string
  actionError: HubError | null
  log: LogEntry[]
  reload: number
}

type Store = {
  subscribe(listener: () => void): () => void
  getSnapshot(): StoreState
  refresh(): Promise<HubState | null>
  refreshAll(): Promise<HubState | null>
  probe: Probe
  perform(action: string, input?: unknown): Promise<ProbeResult>
}

/** The .p8 the person dropped on the key row: the name to show, the PEM to send. */
type KeyFile = { name: string; text: string }

/** One read, and the way to run it again. */
type QueryState = { loading: boolean; data: JsonData | null; error: HubError | null }
type QueryResult = [QueryState, () => void]

/* ---- the tab the panel is rendered in ---------------------------- */

type TabActions = {
  close?: () => void
  bindCommands?: (commands: Record<string, () => void>) => void | (() => void)
}
type TabInfo = {
  tab?: { id?: string; kind?: string; visible?: boolean; actions?: TabActions | null } | null
} | null

/* ---- the Cordis services the plugin is applied to ---------------- */

type LocaleService = {
  bind(namespace: string): Translate
  register(namespace: string, dicts: { en: Record<string, string>; zh: Record<string, string> }): () => void
  subscribe(listener: () => void): () => void
  getLocale(): unknown
}

type TabGuideEntry = { id: string; order: number; title(): string; description(): string }
type TabDefinition = { id: string; kind: string; title(): string; keepMounted?: boolean; guide?: TabGuideEntry[] }

type SlotOptions = {
  [key: string]: unknown
  name?: string
  key?: string
  id?: string
  order?: number
  locale?: string
  inject?: () => unknown
}

type ClientContext = {
  connection: {
    rpc: { call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<WireReply> }
    generation?: { subscribe(callback: () => void): unknown }
  }
  locale: LocaleService
  slots: {
    inject(key: string, callback: () => unknown, label: string): unknown
    register(options: SlotOptions, component: (props: never) => unknown): unknown
  }
  sidebarRight: { openTab(kind: string): void; isExpanded?(): boolean; toggleExpanded(): void }
  sidebarRightTabs: { register(definition: TabDefinition): unknown }
  effect(callback: () => unknown, label: string): unknown
}

/** The definition window.__ModuleLoader__.load takes. */
type ModuleDefinition = {
  id: string
  factory(require: (id: 'react') => ReactModule): { inject: readonly string[]; apply(ctx: ClientContext): void }
}

/** The loader hangs one table off the page: it is not part of Window. */
interface Window {
  __ModuleLoader__: { load(definition: ModuleDefinition): void }
}

window.__ModuleLoader__.load({
  id: 'dsh-asc-hub',
  factory(require) {
    const React = require('react')
    const h: CreateElement = React.createElement

    /* ------------------------------------------------------------------ *
     * Constants
     * ------------------------------------------------------------------ */

    const NS = 'asc-hub'
    const KIND = 'asc-hub'
    const TAB_ID = 'dsh-asc-hub'
    const APP_KEY = 'dsh.asc-hub.v1.app'
    const VENDOR_KEY = 'dsh.asc-hub.v1.vendor'
    const APPLE_KEYS_URL = 'https://appstoreconnect.apple.com/access/integrations/api'
    const AUTHOR = 'sleep9ull'
    const AUTHOR_URL = 'https://github.com/sleep9ull'
    // The engine this console inherits; the footer links to the upstream project.
    const ASC_REPO_URL = 'https://github.com/rorkai/App-Store-Connect-CLI'
    // Onboarding is finished by the person, not by the state machine: the flag is set
    // only when `Start to build` is pressed, so a refresh after signing in still lands
    // on step three.
    const ONBOARDED_KEY = 'dsh-asc-hub:onboarded'
    // Storage is best-effort: the browser keeps it across refreshes, and a process that
    // forbids storage still remembers the click for as long as it runs.
    const onboardingMemory = new Map<string, string>()
    function readOnboarded(): boolean {
      try {
        const stored = globalThis.localStorage?.getItem(ONBOARDED_KEY)
        if (typeof stored === 'string') return stored === '1'
      } catch {
        // Storage can be unavailable; fall through to the in-memory flag.
      }
      return onboardingMemory.get(ONBOARDED_KEY) === '1'
    }
    function markOnboarded(): void {
      onboardingMemory.set(ONBOARDED_KEY, '1')
      try {
        globalThis.localStorage?.setItem(ONBOARDED_KEY, '1')
      } catch {
        // Storage can be unavailable; the in-memory flag still carries this session.
      }
    }
    const LABELS: Set<string> = new Set(['start', 'engine', 'login', 'ready', 'build', 'review', 'error'])

    /* ------------------------------------------------------------------ *
     * Locale dictionaries (both baseline locales are required)
     * ------------------------------------------------------------------ */

    // One bilingual table keeps both baseline locales in lockstep: one line per
    // key, English first. The locale service still receives two dictionaries.
    const TEXT: Record<string, [string, string]> = {
      'tabTitle': ['ASC Hub', 'ASC 控制台'],
      'tabDescription': ['Install the asc engine, sign in with an API key, and ship builds, releases and sales.', '安装 asc 引擎、用 API 密钥登录，并发布构建、版本与销售数据。'],
      'title': ['ASC HUB (App Store Connect)', 'ASC HUB（App Store Connect）'],
      'statusAria': ['ASC Hub status: {label}. Open the ASC Hub console.', 'ASC 控制台状态：{label}。打开 ASC 控制台面板。'],
      'refresh': ['Refresh', '刷新'],
      'hostDownTitle': ['The panel lost its Host connection.', '面板与 Host 的连接已断开。'],
      'hostDownBody': ['This happens when the plugin is reinstalled, or the Host restarts, while the page stays open. Reload the panel to reconnect; nothing was lost.', '插件被重装或 Host 重启时，已经打开的页面会这样。重新加载面板即可恢复，不会丢数据。'],
      'reloadPanel': ['Reload panel', '重新加载面板'],
      'close': ['Close', '关闭'],
      'working': ['Working…', '处理中…'],
      'loading': ['Loading…', '加载中…'],
      'unknown': ['unknown', '未知'],
      'none': ['none', '无'],
      'errorUnknown': ['Something went wrong. Check the log and retry.', '出错了，请查看日志后重试。'],
      'hubVersion': ['{version}', '{version}'],
      'versionPrefix': ['version', '版本'],
      'hubVersionUnknown': ['unknown', '未知'],
      'updateRunning': ['Updating…', '更新中…'],
      'updateTitle': ['update', '更新'],
      'error.MANUAL_UPDATE_REQUIRED': ['Update dsh-asc-hub from the Plugin Manager.', '请在 Plugin Manager 中更新 dsh-asc-hub。'],
      'versionUnknown': ['asc unknown', 'asc 未知'],
      'modeReadOnly': ['read-only mode', '只读模式'],
      'modeWrite': ['write mode', '可写模式'],
      'modeUnknown': ['mode unknown', '模式未知'],
      'modeToWrite': ['Click to switch to write mode', '点击切换到可写模式'],
      'modeToReadOnly': ['Click to switch to read-only mode', '点击切换到只读模式'],
      'label.start': ['start', 'start'],
      'label.engine': ['engine', 'engine'],
      'label.login': ['login', 'login'],
      'label.ready': ['ready', 'ready'],
      'label.build': ['build', 'build'],
      'label.review': ['review', 'review'],
      'label.error': ['error', 'error'],
      'step.done': ['Done', '已完成'],
      'step.current': ['Current', '当前'],
      'step.pending': ['Pending', '待进行'],
      'stepEngine': ['Install the asc engine', '安装 asc 引擎'],
      'stepLogin': ['Sign in to App Store Connect', '登录 App Store Connect'],
      'stepReady': ['Finish setup', '完成接入'],
      'stepOf': ['Step {current} of {total}', '第 {current} 步，共 {total} 步'],
      'engineDetected': ['asc {version} at {path}', '在 {path} 检测到 asc {version}'],
      'engineCaption': ['(asc {version} ready)', '（asc {version} 已就绪）'],
      'installAsc': ['Install', '安装'],
      'installedLabel': ['Installed', '已安装'],
      'engineSub': ['A required core engine the plugin drives to reach App Store Connect.', '插件必需的配套内核引擎，用来连接 App Store Connect。'],
      'installing': ['Installing…', '安装中…'],
      'installLogTitle': ['Install log', '安装日志'],
      'loginIntro1': ['Sign in with an App Store Connect API key. asc stores it in the macOS Keychain.', '用 App Store Connect API key 登录。asc 会把密钥存进 macOS 钥匙串。'],
      'readySub': ['Opens the console in this panel: builds, TestFlight, review and sales.', '在这个面板里打开控制台：构建、TestFlight、审核与销售。'],
      'openAppleKeys': ['Get an API key', '获取 API 密钥'],
      'keyId': ['Key ID', 'Key ID'],
      'issuerId': ['Issuer ID', 'Issuer ID'],
      'keyPath': ['Private key (.p8)', '私钥（.p8）'],
      'keyDropZone': ['Drag the .p8 file here, or choose it', '把 .p8 文件拖到这里，或点击选择'],
      'profileNameOptional': ['Profile name (optional)', '配置名称（可选）'],
      'profileNameHint': ['Required when asc already has profiles.', 'asc 已有配置时必须填写。'],
      'chooseKeyFile': ['Choose file', '选择文件'],
      'keyFileLabel': ['Key file', '密钥文件'],
      'clearKeyFile': ['Remove the chosen key file', '移除已选密钥文件'],
      'keyFileWrong': ['Drop the AuthKey_*.p8 file downloaded from App Store Connect.', '请拖入从 App Store Connect 下载的 AuthKey_*.p8 文件。'],
      'importDone': ['The key was imported into the Keychain.', '密钥已导入钥匙串。'],
      'verifySignIn': ['Verify and sign in', '验证并登录'],
      'verifiedLabel': ['Verified', '已验证'],
      'resetSignIn': ['Reset', '重置'],
      'undoing': ['Resetting…', '重置中…'],
      'signOutDone': ['Reset. The key left the Keychain.', '已重置，密钥已从钥匙串移除。'],
      'loginSubDone': ['Signed in. asc keeps the key in the macOS Keychain.', '已登录。asc 把密钥存放在 macOS 钥匙串。'],
      'verifying': ['Verifying…', '验证中…'],
      'errKeyId': ['Enter the Key ID.', '请填写 Key ID。'],
      'errIssuerId': ['Enter the Issuer ID.', '请填写 Issuer ID。'],
      'errKeyFile': ['Add the .p8 file.', '请加入 .p8 文件。'],
      'signedIn': ['Signed in.', '已登录。'],
      'loginPending': ['Waiting for the engine.', '等待引擎安装完成。'],
      'readyPending': ['Complete the steps above.', '请先完成上面的步骤。'],
      'profileLabel': ['Profile', '配置'],
      'storageLabel': ['Key storage', '密钥存储'],
      'engineLabel': ['engine', '引擎'],
      'skillsTitle': ['Skills pack', '技能包'],
      'skillsInstalled': ['inherited from asc · {count} skills · {ref}', '继承自 asc · {count} 个技能 · {ref}'],
      'skillsMissing': ['not installed', '未安装'],
      // What the inherited pack is for, said as seven things a person would actually
      // ask for. Each line maps to one upstream asc-* skill, so the row doubles as an
      // index of the long tail without naming a single command.
      'skillsUse1': ['Fill in the 1.2.5 description and keywords in every locale', '把 1.2.5 的描述和关键词补齐到所有语言'],
      'skillsUse2': ['Resize these screenshots to the sizes App Store Connect accepts', '把这些截图裁成 App Store Connect 要的尺寸'],
      'skillsUse3': ['Set up certificates and provisioning profiles for a new app', '给新应用配好证书和描述文件'],
      'skillsUse4': ['Send 1.2.5 (3) to the external testers with a What to Test note', '把 1.2.5（3）发给外部测试人员，并写测试说明'],
      'skillsUse5': ['Summarize this week\'s TestFlight crashes', '汇总这周的 TestFlight 崩溃'],
      'skillsUse6': ['Price the subscriptions by purchasing power in each country', '按各国购买力给订阅定价'],
      'skillsUse7': ['Stage a release, validate it, then submit for review', '准备一个版本、校验通过后提交审核'],
      'skillsInstall': ['install', '安装'],
      'skillsUpdate': ['update', '更新'],
      'skillsInstalling': ['Installing…', '安装中…'],
      'skillsFailed': ['The installer did not finish; see the log below.', '安装器未完成，详情见下方日志。'],
      'readySummary': ['The engine and the account are ready.', '引擎和账号都已就绪。'],
      'openConsole': ['Start to build', '开始构建'],
      'error.RPC_FAILED': ['The Harness connection is not available.', 'Harness 连接不可用。'],
      'error.ASC_NOT_INSTALLED': ['asc was not found on this Mac.', '本机未找到 asc。'],
      'error.ASC_VERSION_UNPARSED': ['asc ran, but its version is unreadable.', 'asc 已运行，但无法解析版本。'],
      'error.BREW_MISSING': ['Homebrew is not installed.', '未安装 Homebrew。'],
      'error.INSTALL_FAILED': ['Installing asc failed.', '安装 asc 失败。'],
      'error.ASC_AUTH_MISSING': ['No App Store Connect credentials are configured.', '尚未配置 App Store Connect 凭据。'],
      'error.ASC_AUTH_FAILED': ['asc rejected the API key.', 'asc 拒绝了该 API 密钥。'],
      'error.KEY_FILE_UNSAFE': ['The .p8 file permissions are unsafe.', '.p8 文件权限不安全。'],
      'error.APP_NOT_SELECTED': ['Choose an app first.', '请先选择一个应用。'],
      'error.APP_NOT_FOUND': ['That app could not be found.', '找不到该应用。'],
      'error.PROCESSING_PENDING': ['The build is still processing.', '构建仍在处理中。'],
      'error.READINESS_BLOCKED': ['Release readiness reported blockers.', '发布准备检查报告了阻塞项。'],
      'error.READ_ONLY_MODE': ['The plugin is in read-only mode.', '插件当前为只读模式。'],
      'error.CONFIRM_REQUIRED': ['This action needs explicit confirmation.', '此操作需要明确确认。'],
      'error.APPROVAL_DENIED': ['The approval was declined.', '审批被拒绝。'],
      'error.TIMEOUT': ['The operation timed out.', '操作超时。'],
      'error.ASC_FAILED': ['asc exited with an error.', 'asc 以错误退出。'],
      'error.UNSUPPORTED_ACTION': ['That action is not supported.', '不支持该操作。'],
      'error.INVALID_INPUT': ['The input was rejected.', '输入未通过校验。'],
      'error.VENDOR_REQUIRED': ['A vendor number is required for sales reports.', '销售报表需要 Vendor 编号。'],
      'next.KEY_FILE_UNSAFE': ['Run chmod 600 on the .p8 file, then import it again.', '对该 .p8 文件执行 chmod 600，然后重新导入。'],
      'next.ASC_AUTH_FAILED': ['Check the Key ID, the Issuer ID and the key, then sign in again.', '检查 Key ID、Issuer ID 与密钥后重新登录。'],
      'next.INSTALL_FAILED': ['Read the log above, then retry the install.', '查看上方日志后重试安装。'],
      'next.BREW_MISSING': ['Retry with the curl method.', '改用 curl 方式重试。'],
      'next.ASC_NOT_INSTALLED': ['Install asc to continue.', '安装 asc 后继续。'],
      'next.ASC_AUTH_MISSING': ['Add an API key to continue.', '添加 API 密钥后继续。'],
      'next.PROCESSING_PENDING': ['Wait until App Store Connect reports the build as VALID, then retry.', '等 App Store Connect 将构建报告为 VALID 后重试。'],
      'next.READINESS_BLOCKED': ['Resolve the blockers above, then recheck.', '处理上方阻塞项后重新检查。'],
      'next.READ_ONLY_MODE': ['Switch the plugin mode to write in its configuration.', '在插件配置中把 mode 改为 write。'],
      'next.CONFIRM_REQUIRED': ['Tick the confirmation above and try again.', '勾选上方的确认后重试。'],
      'next.APPROVAL_DENIED': ['Nothing changed. Try again and approve the request.', '未做任何修改。重试并批准该请求。'],
      'next.VENDOR_REQUIRED': ['Enter the vendor number from the Sales and Trends URL.', '填写 Sales and Trends 链接中的 Vendor 编号。'],
      'next.APP_NOT_SELECTED': ['Choose an app in the picker above.', '在上方选择应用。'],
      'next.TIMEOUT': ['Retry, or raise timeoutMs in the plugin configuration.', '重试，或在插件配置中调大 timeoutMs。'],
      'appTitle': ['App & Bundle', '应用与 Bundle'],
      'workspaceLabel': ['Working directory', '工作目录'],
      'gitClean': ['clean', '干净'],
      'gitUncommitted': ['{count} uncommitted', '{count} 处未提交'],
      'gitUntracked': ['{count} untracked', '{count} 个未跟踪'],
      'gitAheadTitle': ['{count} commits ahead of {upstream}', '比 {upstream} 多 {count} 个提交'],
      'gitBehindTitle': ['{count} commits behind {upstream}', '比 {upstream} 少 {count} 个提交'],
      'worktreeTag': ['worktree', '工作树'],
      'workspacePending': ['Locating this session\u2019s directory\u2026', '正在定位本会话的目录…'],
      'appNone': ['Select an app', '请选择应用'],
      'appHint': ['Choose an app to enable the build, TestFlight and review cards.', '选择应用后才能使用构建、TestFlight 与发布卡片。'],
      'noApps': ['No apps were returned for this account.', '该账号没有返回任何应用。'],
      'appRequired': ['Choose an app above to use this card.', '请先在上方选择应用。'],
      'loadMore': ['Load more', '加载更多'],
      'showLess': ['Show less', '收起'],
      'buildsTitle': ['Builds', '构建'],
      'buildProcessing': ['Processing', '处理中'],
      'buildInvalid': ['Failed', '失败'],
      'buildExpired': ['Expired', '已过期'],
      'noBuilds': ['No builds yet.', '暂无构建。'],
      'testflightTitle': ['TestFlight', 'TestFlight'],
      'groupsTitle': ['Groups', '分组'],
      'noGroups': ['No TestFlight groups were returned.', '没有返回 TestFlight 分组。'],
      'internalGroup': ['Internal', '内部'],
      'externalGroup': ['External', '外部'],
      'tfInternalTitle': ['Distributed to internal TestFlight testers', '已分发给内部 TestFlight 测试人员'],
      'tfExternalTitle': ['Distributed to external TestFlight testers', '已分发给外部 TestFlight 测试人员'],
      'whatsNew': ['What to test', '测试说明'],
      'whatsNewHint': ['Notes shown to testers for this build.', '测试人员在此构建上看到的说明。'],
      'buildTitle': ['Build', '构建'],
      'buildNumberLabel': ['Build number', '构建号'],
      'versionPlaceholder': ['e.g. 1.2.5', '例如 1.2.5'],
      'buildAction': ['Build', '开始构建'],
      'building': ['Building…', '构建中…'],
      'buildHint': ['Archives the code in this working directory, exports an .ipa and uploads it with this version and build number. Takes a few minutes.', '把当前工作目录里的代码打包归档、导出 .ipa，并用这里的版本号和构建号上传。需要几分钟。'],
      'buildNeedsInput': ['A version and a build number are required.', '需要版本号和构建号。'],
      'builtNote': ['Uploaded. App Store Connect is processing it — it turns into a ready build below when that finishes.', '已上传。App Store Connect 正在处理，处理完成后会出现在下方并成为 ready 构建。'],
      'buildReady': ['ready to build', '可以构建'],
      'buildNotReady': ['cannot build', '无法构建'],
      'buildNoXcode': ['Xcode not found on this machine', '本机未找到 Xcode'],
      'buildNoProject': ['No Xcode project in this directory', '此目录下没有 Xcode 工程'],
      'tfBuildLabel': ['Build to send', '要分发的构建'],

      'tfSent': ['Sent {build} to {groups}', '已把 {build} 发到 {groups}'],
      'releaseTag': ['Release', '发布版本'],
      'cannotNoProject': ['Not an iOS project', '不是 iOS 项目'],
      'cannotNotIos': ['This Xcode project is not an iOS app', '这个 Xcode 工程不是 iOS 应用'],
      'cannotNoXcode': ['Xcode is not installed on this machine', '本机没有安装 Xcode'],
      'cannotUnloadable': ['The project does not load — it has build errors', '工程加载不起来 —— 有构建错误'],
      'autoFix': ['Auto-fix', '自动修复'],
      'autoFixCopied': ['Prompt copied', '已复制提示词'],
      'autoFixHint': ['Copies a repair prompt to paste into the chat', '复制一段修复提示词，粘贴到对话里'],
      'tfNoBuild': ['Pick a build above', '请在上方选择构建'],
      'noValidBuild': ['No processed (VALID) build is available yet.', '目前没有已处理（VALID）的构建。'],
      'distribute': ['Distribute build', '分发构建'],
      'distributing': ['Distributing…', '分发中…'],
      'reviewTitle': ['Review', '审核'],
      'releaseSectionTitle': ['Release', '发布'],
      'versionState': ['Version state', '版本状态'],
      'setupLink': ['Setup', '设置'],
      'setupHint': ['Open the setup steps again (engine, sign-in)', '重新打开设置步骤（引擎、登录）'],
      'reviewBuild': ['Build to submit', '要提交的构建'],
      'reviewedTag': ['Reviewed', '已审核'],
      'buildReleased': ['released', '已发布'],
      'buildInReview': ['in review', '审核中'],
      'buildNotSubmitted': ['not submitted', '未提交审核'],
      'versionShippedTag': ['version released', '版本已发布'],
      'versionShippedHint': ['Version {version} is already released, so no build can be submitted under it. Build a new version to submit.', '版本 {version} 已发布，该版本下无法再提交任何构建。请构建新版本后再提交。'],
      'reviewedHint': ['This build already passed App Review as part of {version} ({state}). Pick a build that has not been reviewed to submit a new version.', '该构建已作为 {version}（{state}）通过审核。要提交新版本，请选择一个尚未审核的构建。'],
      'attachedBuild': ['Attached build', '关联构建'],
      'pendingDeveloperRelease': ['Approved — waiting for you to release it.', '已通过审核 —— 等待你手动发布。'],
      'releaseNotReady': ['Nothing to release: this version is not waiting for a developer release.', '暂无可发布内容：该版本当前不在等待开发者发布状态。'],
      'releaseAction': ['Release to App Store', '发布到 App Store'],
      'releasing': ['Releasing…', '发布中…'],
      'confirmRelease': ['I confirm this version goes live to every App Store user.', '我确认该版本将对所有 App Store 用户上线。'],
      'releasedNote': ['Released. The App Store shows it once Apple finishes distributing it.', '已发布。Apple 完成分发后 App Store 就会显示。'],
      'readiness': ['Readiness', '发布准备'],
      'checkingReadiness': ['Validating the version…', '正在校验版本…'],
      'readinessWarnings': ['{count} warnings that do not block submission', '{count} 条不阻塞提交的警告'],
      'releaseState': ['Release state', '发布状态'],
      'versionLabel': ['Version', '版本'],
      'readyYes': ['Ready', '已就绪'],
      'readyNo': ['Blocked', '被阻塞'],
      'blockersTitle': ['Blockers', '阻塞项'],
      'noBlockers': ['No blockers reported.', '没有报告阻塞项。'],
      'submittedOn': ['Submitted {date}', '提交于 {date}'],
      'submitReview': ['Submit for review', '提交审核'],
      'submittingReview': ['Submitting…', '提交中…'],
      'confirmSubmit': ['I confirm the version, metadata and attached build are final.', '我确认版本、元数据与关联构建均为最终状态。'],
      'salesTitle': ['Sales', '销售'],
      'period': ['Period', '周期'],
      'periodDay': ['Day', '按日'],
      'periodWeek': ['Week', '按周'],
      'salesDate': ['Date', '日期'],
      'salesUnits': ['Units', '销量'],
      'salesProceeds': ['Proceeds', '收入'],
      'salesTotal': ['Total', '合计'],
      'noReport': ['No report for that date.', '该日期没有报表。'],
      'vendorNumber': ['Vendor number', 'Vendor 编号'],
      'vendorHint': ['It is the number in the App Store Connect Sales and Trends URL.', '就是 App Store Connect 的 Sales and Trends 链接中的编号。'],
      'setVendor': ['Set vendor number', '设置 Vendor 编号'],
      'applyVendor': ['Apply', '应用'],
      'vendorCurrent': ['Vendor {number}', 'Vendor {number}'],
      'analyticsTitle': ['Analytics reports', '分析报表'],
      'noAnalytics': ['No analytics report requests were returned.', '没有返回分析报表请求。'],
      'logTitle': ['Last operation log', '最近操作日志'],
      'logEmpty': ['No operations yet.', '暂无操作。'],
    }
    const en: Record<string, string> = {}
    const zh: Record<string, string> = {}
    for (const [key, pair] of Object.entries(TEXT)) { en[key] = pair[0]; zh[key] = pair[1] }

    /* ------------------------------------------------------------------ *
     * Styles: theme tokens only. Rendered inside each component tree.
     * ------------------------------------------------------------------ */

    const STYLES = `
/* Product accent. App Store Connect's blue, declared once and aliased onto the
   host brand token inside this subtree only, so no literal colour appears in any
   rule below and the host UI is untouched. */
/* The host renders this tab inside a flex column of definite height. Without the
   three rules below the panel never fills it, so the middle cannot scroll and the
   footer travels with the content. */
/* Compound selector: this element carries the data attribute itself, so the usual
   descendant form would never match and the rule above would be dead. */
[data-asc-hub].asc-hub-root { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; height: 100%; }
[data-asc-hub] { color: var(--dsw-alias-label-primary); font: inherit; --asc-hub-accent: #0071e3; --dsw-alias-brand-primary: var(--asc-hub-accent); }
[data-asc-hub], [data-asc-hub] * { box-sizing: border-box; }
[data-asc-hub] button { font: inherit; color: inherit; cursor: pointer; }
[data-asc-hub] button:disabled { cursor: default; opacity: .5; }
[data-asc-hub] :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
[data-asc-hub] h2, [data-asc-hub] h3, [data-asc-hub] p, [data-asc-hub] ol, [data-asc-hub] ul, [data-asc-hub] dl, [data-asc-hub] dd, [data-asc-hub] dt { margin: 0; }
[data-asc-hub] .asc-hub-pill { display: inline-flex; align-items: center; gap: 6px; max-width: 180px; min-height: 26px; padding: 2px 8px; border: 1px solid transparent; border-radius: var(--dsw-radius-md, 6px); background: transparent; font-size: 12px; line-height: 20px; white-space: nowrap; -webkit-app-region: no-drag; }
[data-asc-hub] .asc-hub-pill:hover { background: var(--dsw-alias-interactive-bg-hover); }
[data-asc-hub] .asc-hub-pill-text { overflow: hidden; text-overflow: ellipsis; }
[data-asc-hub] .asc-hub-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
[data-asc-hub] .asc-hub-pill[data-label="ready"] .asc-hub-dot { background: var(--dsw-alias-state-success-primary); }
[data-asc-hub] .asc-hub-pill[data-label="build"] .asc-hub-dot, [data-asc-hub] .asc-hub-pill[data-label="review"] .asc-hub-dot { background: var(--dsw-alias-state-warn-primary); }
[data-asc-hub] .asc-hub-pill[data-label="error"] .asc-hub-dot { background: var(--dsw-alias-state-error-primary); }
[data-asc-hub] .asc-hub-panel { display: flex; flex-direction: column; flex: 1 1 auto; width: 100%; min-width: 0; min-height: 0; padding: 12px; overflow: hidden; background: var(--dsw-alias-bg-base); font-size: var(--dsw-font-s-font-size, 13px); line-height: 1.5; }
[data-asc-hub] .asc-hub-scroll { display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-height: 0; overflow: auto; }
[data-asc-hub] .asc-hub-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-width: 0; padding-bottom: 8px; }
[data-asc-hub] .asc-hub-head-main { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
[data-asc-hub] .asc-hub-title { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-sub { color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
/* The engine version reports from the foot of the panel, not under its title. */
/* The footer reports both halves and keeps a slot for the update button, so a
   release that arrives later cannot change the panel's height. */
[data-asc-hub] .asc-hub-foot { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
[data-asc-hub] .asc-hub-foot-meta { display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; }
[data-asc-hub] .asc-hub-foot-actions { display: flex; align-items: center; gap: 8px; flex: none; margin-left: auto; }
/* The hub version keeps the width of its update tag, so gaining one never reflows. */
[data-asc-hub] .asc-hub-version-slot { display: inline-flex; align-items: center; min-height: 18px; color: inherit; font-size: inherit; }
[data-asc-hub] .asc-hub-version-line { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: inherit; font-size: inherit; }
[data-asc-hub] .asc-hub-foot-part { display: inline-flex; align-items: center; gap: 0.3em; min-width: 0; }
[data-asc-hub] .asc-hub-foot-link { color: inherit; text-decoration: none; }
[data-asc-hub] .asc-hub-foot-link:hover { color: var(--dsw-alias-label-primary); text-decoration: underline; text-underline-offset: 2px; }
[data-asc-hub] .asc-hub-foot-dot { color: inherit; }
[data-asc-hub] .asc-hub-update-tag { display: inline-flex; align-items: center; gap: 2px; padding: 0 6px; min-height: 18px; border: 1px solid var(--dsw-alias-brand-primary); border-radius: 999px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); font: inherit; font-size: inherit; font-weight: 600; line-height: 1; cursor: pointer; }
[data-asc-hub] .asc-hub-update-tag:disabled { border-color: var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); cursor: default; }
[data-asc-hub] .asc-hub-head-actions { display: flex; flex: none; gap: 4px; }
[data-asc-hub] .asc-hub-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm, 4px); background: transparent; font-size: 14px; line-height: 1; }
[data-asc-hub] .asc-hub-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* The footer's mode pill is the switch: neutral while read-only, orange while this
   session may write to App Store Connect. */
[data-asc-hub] .asc-hub-mode-btn { padding: 1px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: inherit; line-height: 1.5; cursor: pointer; white-space: nowrap; }
[data-asc-hub] .asc-hub-mode-btn:hover:not(:disabled) { border-color: var(--dsw-alias-label-secondary); color: var(--dsw-alias-label-primary); }
[data-asc-hub] .asc-hub-mode-btn[data-mode="write"] { border-color: var(--dsw-alias-state-warn-primary); background: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-bg-base); font-weight: 600; }
[data-asc-hub] .asc-hub-mode-btn[data-mode="write"]:hover:not(:disabled) { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-bg-base); }
[data-asc-hub] .asc-hub-mode-btn:disabled { cursor: default; }
[data-asc-hub] .asc-hub-onboarding { display: flex; flex-direction: column; gap: 0; min-width: 0; }
/* One row = one node on the release spine plus its card. The spine carries the
   progress; the cards carry the work and stay quiet. */
[data-asc-hub] .asc-hub-phase { display: grid; grid-template-columns: 26px minmax(0, 1fr); column-gap: 15px; min-width: 0; padding: 20px 0; }
[data-asc-hub] .asc-hub-phase:first-child { padding-top: 0; }
[data-asc-hub] .asc-hub-phase:last-child { padding-bottom: 0; }
[data-asc-hub] .asc-hub-phase-rail { position: relative; min-width: 0; }
[data-asc-hub] .asc-hub-phase-node {
  position: absolute;
  left: 50%;
  top: 10.4px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 50%;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  transition: background-color 200ms ease, border-color 200ms ease, color 200ms ease, width 200ms ease, height 200ms ease;
}
/* The 2px line runs behind the nodes: one half above the node, one below. */
[data-asc-hub] .asc-hub-phase-rail::before,
[data-asc-hub] .asc-hub-phase-rail::after { content: ''; position: absolute; left: 13px; width: 2px; transform: translateX(-1px); background: var(--dsw-alias-border-l2); }
[data-asc-hub] .asc-hub-phase-rail::before { top: -20px; height: 30.4px; }
[data-asc-hub] .asc-hub-phase-rail::after { top: 10.4px; bottom: -20px; }
[data-asc-hub] .asc-hub-phase:first-child .asc-hub-phase-rail::before { display: none; }
[data-asc-hub] .asc-hub-phase:last-child .asc-hub-phase-rail::after { display: none; }
/* Progress reads off the spine: green up to the gate you are on, grey beyond it. */
[data-asc-hub] .asc-hub-phase:not([data-state="pending"]) .asc-hub-phase-rail::before { background: var(--dsw-alias-brand-primary); }
[data-asc-hub] .asc-hub-phase[data-state="done"] .asc-hub-phase-rail::after { background: var(--dsw-alias-brand-primary); }
/* The gate you are on is a filled brand disc — the one deliberate accent. */
[data-asc-hub] .asc-hub-phase[data-state="current"] .asc-hub-phase-node {
  width: 26px;
  height: 26px;
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
  font-size: 12px;
}
[data-asc-hub] .asc-hub-phase[data-state="done"] .asc-hub-phase-node {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
/* No frames: the steps are one column, separated by a hairline that starts at the
   content edge so it never crosses the progress spine. */
[data-asc-hub] .asc-hub-step {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
}
[data-asc-hub] .asc-hub-phase + .asc-hub-phase .asc-hub-step::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -20px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
[data-asc-hub] .asc-hub-step-head { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
[data-asc-hub] .asc-hub-step-title { font-size: 16px; font-weight: 600; line-height: 1.3; letter-spacing: -0.008em; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-step-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-phase[data-state="pending"] .asc-hub-step-title,
[data-asc-hub] .asc-hub-phase[data-state="done"] .asc-hub-step-title { color: var(--dsw-alias-label-secondary); font-weight: 500; }
[data-asc-hub] .asc-hub-step-body { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
[data-asc-hub] .asc-hub-step-caption { display: block; color: var(--dsw-alias-label-secondary); font-size: 1.1em; line-height: 1.45; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-step-body .asc-hub-btn-primary,
[data-asc-hub] .asc-hub-step-body .asc-hub-btn-outline { align-self: flex-start; width: 11.5em; max-width: 100%; min-height: 30px; font-size: 12.5px; }
/* A word beside a state, not a button: undo the sign-in. */
[data-asc-hub] .asc-hub-link { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 11.5px; line-height: 1.4; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
[data-asc-hub] .asc-hub-link:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
[data-asc-hub] .asc-hub-link:disabled { color: var(--dsw-alias-label-secondary); cursor: default; }
[data-asc-hub] .asc-hub-input[aria-invalid="true"] { border-color: var(--dsw-alias-state-error-primary); }
/* The message line is part of the layout from the start — empty until a field is
   missing — so a red sentence fills reserved space instead of pushing the card open. */
[data-asc-hub] .asc-hub-field-msg { display: block; min-height: 1.4em; font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-field-msg[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
[data-asc-hub] .asc-hub-key-row[data-invalid="true"] { border-color: var(--dsw-alias-state-error-primary); border-style: solid; }
/* Step 2 waits for step 1: everything in it is disabled and reads that way. */
[data-asc-hub] .asc-hub-input:disabled { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); cursor: not-allowed; }
[data-asc-hub] .asc-hub-key-row[data-locked="true"] { border-style: solid; border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
[data-asc-hub] .asc-hub-key-row[data-locked="true"] .asc-hub-key-hint { color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-step-body .asc-hub-btn-primary:disabled { border-color: var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); font-weight: 500; }
/* One line under Install, held open in every state: the installer's last word plays
   there, and the version takes its place once it is ready. */
[data-asc-hub] .asc-hub-engine-slot { height: 1.6em; overflow: hidden; font-size: 10px; line-height: 1.45; }
[data-asc-hub] .asc-hub-engine-log { margin: 0; white-space: pre; overflow: hidden; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1em; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) {
  [data-asc-hub] .asc-hub-phase-node,
  [data-asc-hub] .asc-hub-optional-toggle::before { transition: none; }
}
[data-asc-hub] .asc-hub-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg, 10px); background: var(--dsw-alias-bg-layer-1); }
[data-asc-hub] .asc-hub-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
[data-asc-hub] .asc-hub-card-title { font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-hint { color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-actions { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
/* A card's primary action is the same length in every card: one width, wide enough to
   show the longest label in full ("Distribute build"), instead of hugging each label. */
[data-asc-hub] .asc-hub-actions-fill .asc-hub-btn { flex: 0 0 auto; min-width: 11em; justify-content: center; }
[data-asc-hub] .asc-hub-actions-submit { margin-top: 9px; }
[data-asc-hub] .asc-hub-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; max-width: 100%; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 6px); background: transparent; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
[data-asc-hub] .asc-hub-btn-primary { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); font-weight: 600; }
/* A disabled primary action must read as disabled: the accent fill would otherwise look
   clickable while the gate silently refuses it. */
[data-asc-hub] .asc-hub-btn-primary:disabled { border-color: var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); font-weight: 500; cursor: default; }
/* Quiet secondary: white surface, hairline edge, accent label. Declared after the
   base rule on purpose: the base sets the border shorthand, so an earlier rule would
   lose its colour. */
[data-asc-hub] .asc-hub-btn-outline { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-brand-primary); font-weight: 500; }
[data-asc-hub] .asc-hub-btn-outline:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-brand-primary); }
/* Locked with the rest of the step: the label greys out like any other disabled action. */
[data-asc-hub] .asc-hub-btn-outline:disabled { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); cursor: not-allowed; }
[data-asc-hub] .asc-hub-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); filter: brightness(1.07); }
[data-asc-hub] .asc-hub-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; }
[data-asc-hub] .asc-hub-field > span { overflow-wrap: anywhere; }
[data-asc-hub] fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
[data-asc-hub] .asc-hub-input, [data-asc-hub] .asc-hub-select, [data-asc-hub] .asc-hub-textarea { width: 100%; min-width: 0; max-width: 100%; padding: 5px 7px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm, 4px); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
[data-asc-hub] .asc-hub-textarea { resize: vertical; min-height: 56px; }
[data-asc-hub] .asc-hub-check { display: flex; align-items: flex-start; gap: 6px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-check input { flex: none; margin: 2px 0 0; accent-color: var(--dsw-alias-brand-primary); }
/* The key is the file: drop it on this row (or pick it), and that is the whole input. */
[data-asc-hub] .asc-hub-key-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; padding: 6px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 6px); font-size: 12px; }
/* The credential fields are three primary buttons wide rather than full-bleed. The
   button is 11.5em of its own 12.5px font; the calc re-bases that to the fields'
   12px font so both resolve to the same pixels. */
[data-asc-hub] .asc-hub-field > .asc-hub-input,
[data-asc-hub] .asc-hub-optional-body > .asc-hub-input,
[data-asc-hub] .asc-hub-key-row { width: calc(3 * 11.5em * 12.5 / 12); max-width: 100%; }
[data-asc-hub] .asc-hub-key-row[data-dragging="true"] { border-color: var(--dsw-alias-brand-primary); }
[data-asc-hub] .asc-hub-key-row[data-source="file"] { border-style: solid; border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
[data-asc-hub] .asc-hub-key-hint { flex: 1 1 8em; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.4; }
[data-asc-hub] .asc-hub-key-name { flex: 1 1 8em; display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 11.5px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-key-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-asc-hub] .asc-hub-file-input { display: none; }
/* A truly optional field: folded behind a triangle, with its space kept so opening
   it never pushes the verify button down. */
[data-asc-hub] .asc-hub-optional-toggle { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px; line-height: 1.4; text-align: left; cursor: pointer; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-optional-toggle::before { content: ''; flex: none; width: 0; height: 0; border-left: 4px solid currentColor; border-top: 3.5px solid transparent; border-bottom: 3.5px solid transparent; transition: transform 150ms ease; }
[data-asc-hub] .asc-hub-optional-toggle[data-open="true"]::before { transform: rotate(90deg); }
[data-asc-hub] .asc-hub-optional-body { margin-top: 8px; min-width: 0; }
/* The inherited skill pack: housekeeping. Quiet, hairlined, and open by default. */
/* The console gap already separates this row; the hairline alone marks it as housekeeping. */
[data-asc-hub] .asc-hub-skills { padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); min-width: 0; }
[data-asc-hub] .asc-hub-skills-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
[data-asc-hub] .asc-hub-skills-head .asc-hub-optional-toggle { flex: 1 1 auto; min-width: 0; }
/* The row's own action: same type size as the line it sits on, so the row stays one
   quiet sentence with a verb at the end. */
[data-asc-hub] .asc-hub-skills-action { flex: none; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 11px; line-height: 1.4; cursor: pointer; }
[data-asc-hub] .asc-hub-skills-action:hover { text-decoration: underline; }
[data-asc-hub] .asc-hub-skills-action:disabled { color: var(--dsw-alias-label-secondary); cursor: default; text-decoration: none; }
[data-asc-hub] .asc-hub-skills-state { color: var(--dsw-alias-label-secondary); font-size: 11px; }
/* Seven concrete asks instead of a paragraph about a feature: the pack is an index
   of the long tail, and each line is something the user can literally say. */
[data-asc-hub] .asc-hub-skills-uses { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; }
[data-asc-hub] .asc-hub-skills-uses li { position: relative; padding-left: 10px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-skills-uses li::before { content: '›'; position: absolute; left: 0; color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-rows { display: flex; flex-direction: column; gap: 4px; list-style: none; padding: 0; }
[data-asc-hub] .asc-hub-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; min-width: 0; padding: 4px 0; border-top: 1px solid var(--dsw-alias-border-l1); font-size: 11px; }
[data-asc-hub] .asc-hub-row:first-child { border-top: 0; }
[data-asc-hub] .asc-hub-row-main { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-row-main strong { font-size: 12px; }
/* The card title is the field label, so the two share one row. */
[data-asc-hub] .asc-hub-inline { display: flex; align-items: center; gap: 8px; min-width: 0; }
[data-asc-hub] .asc-hub-inline-label { flex: none; color: var(--dsw-alias-label-secondary); font-size: 11px; }
[data-asc-hub] .asc-hub-inline .asc-hub-select { flex: 1 1 auto; width: auto; }
/* Under the app picker: the directory this session works in, and how it is
   checked out. Quiet by design — it is context, not a control. */
/* One rhythm: 14px between sections, 8px inside each. */
[data-asc-hub] .asc-hub-console { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
[data-asc-hub] .asc-hub-workspace { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 6px; min-width: 0; font-size: 11px; }
/* Second line: branch, drift from the upstream, and what is uncommitted. */
/* The build step: version and build number are two decisions, side by side. */
[data-asc-hub] .asc-hub-build-line { display: flex; gap: 8px; min-width: 0; }
/* The build list doubles as the picker: radio + name, tags, date. */
[data-asc-hub] .asc-hub-row-build { grid-template-columns: minmax(0, 1fr) auto auto; }
[data-asc-hub] .asc-hub-build-pick { display: flex; align-items: center; gap: 6px; min-width: 0; }
[data-asc-hub] .asc-hub-build-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
[data-asc-hub] .asc-hub-build-tags { display: flex; align-items: center; gap: 4px; min-width: 0; }
/* The line between the five newest builds and the release build: stronger than the
   hairline between rows, and the pinned row drops its own so there is only one. */
[data-asc-hub] .asc-hub-rows-divider { list-style: none; height: 1px; margin: 6px 0 2px; background: var(--dsw-alias-border-l2); }
[data-asc-hub] .asc-hub-row-pinned { border-top: 0; }
[data-asc-hub] .asc-hub-rows-more { display: flex; align-items: center; justify-content: space-between; gap: 6px; list-style: none; padding: 2px 0; }
/* Paging a list is not an action on the app: it stays an underlined text link, but in
   the secondary colour, so it never competes with the accent-coloured actions. */
[data-asc-hub] .asc-hub-link-quiet { color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-link-quiet:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }

[data-asc-hub] .asc-hub-tf[data-audience="release"] { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
/* Groups: two per row, so a long list does not become a column. */
/* Label column and control column shared by every row of a form, so a control's left
   edge is the same in each row. */
[data-asc-hub] .asc-hub-form { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 6px 8px; min-width: 0; }
/* Groups sit on one line after their label and wrap only when they must. */
[data-asc-hub] .asc-hub-groups { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; min-width: 0; }
[data-asc-hub] .asc-hub-groups .asc-hub-check { min-width: 0; }
[data-asc-hub] .asc-hub-check-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-asc-hub] .asc-hub-field-inline { flex: 1 1 0; min-width: 0; }
[data-asc-hub] .asc-hub-build-line .asc-hub-field > .asc-hub-input { width: 100%; }
/* Path on the left, git facts on the right of the same line. */
[data-asc-hub] .asc-hub-workspace-git { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; min-width: 0; margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-workspace-path { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-asc-hub] .asc-hub-workspace-delta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
[data-asc-hub] .asc-hub-workspace-state { color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-workspace-build { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 6px; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-tag[data-state="ok"] { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
[data-asc-hub] .asc-hub-workspace-path { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; }
[data-asc-hub] .asc-hub-workspace-branch { flex: none; color: var(--dsw-alias-label-secondary); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
/* Builds: three columns — the build ID with its TestFlight audiences, the
   processed state as a short step right of it (never pushed to the far edge),
   and the date at the end. */
[data-asc-hub] .asc-hub-row-build { display: grid; grid-template-columns: minmax(9.5em, max-content) max-content minmax(0, 1fr); align-items: center; column-gap: 0.7em; }
[data-asc-hub] .asc-hub-build-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 5px; min-width: 0; }
[data-asc-hub] .asc-hub-row-build > .asc-hub-chip { justify-self: start; }
[data-asc-hub] .asc-hub-row-date { justify-self: end; }
[data-asc-hub] .asc-hub-tf-set { display: flex; flex-wrap: wrap; gap: 4px; }
[data-asc-hub] .asc-hub-tf, [data-asc-hub] .asc-hub-tag { flex: none; padding: 0 5px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 9.5px; line-height: 1.5; }
[data-asc-hub] .asc-hub-tf[data-audience="external"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
[data-asc-hub] .asc-hub-tf[data-audience="sent"] { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
[data-asc-hub] .asc-hub-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-chip { display: inline-flex; align-items: center; flex: none; max-width: 100%; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 10px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-chip[data-state="ok"] { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
[data-asc-hub] .asc-hub-chip[data-state="wait"] { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
[data-asc-hub] .asc-hub-chip[data-state="error"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
[data-asc-hub] .asc-hub-summary { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; font-size: 11px; }
[data-asc-hub] .asc-hub-summary dt { color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-summary dd { overflow-wrap: anywhere; }
/* A stale page, not a failed operation: one warning block with the way out. */
[data-asc-hub] .asc-hub-recovery { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 10px; border: 1px solid var(--dsw-alias-state-warn-primary); border-radius: var(--dsw-radius-lg, 10px); background: var(--dsw-alias-bg-base); }
[data-asc-hub] .asc-hub-recovery-title { margin: 0; color: var(--dsw-alias-state-warn-primary); font-size: 12px; line-height: 1.4; }
[data-asc-hub] .asc-hub-recovery-body { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
[data-asc-hub] .asc-hub-recovery-actions { display: flex; gap: 8px; }
[data-asc-hub] .asc-hub-error { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 8px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: var(--dsw-radius-md, 6px); background: var(--dsw-alias-bg-base); }
[data-asc-hub] .asc-hub-error-title { color: var(--dsw-alias-state-error-primary); font-size: 12px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-error-msg { font-size: 11px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-error-next { color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-detail { max-height: 160px; overflow: auto; margin: 0; padding: 6px; border-left: 2px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); white-space: pre-wrap; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
[data-asc-hub] .asc-hub-log { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 6px; }
[data-asc-hub] .asc-hub-log summary { color: var(--dsw-alias-label-secondary); font-size: 11px; cursor: pointer; }
[data-asc-hub] .asc-hub-log-text { max-height: 180px; overflow: auto; margin: 4px 0 0; padding: 6px; border-radius: var(--dsw-radius-sm, 4px); background: var(--dsw-alias-bg-layer-2); white-space: pre-wrap; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 1.45; }
[data-asc-hub] .asc-hub-table { width: 100%; border-collapse: collapse; font-size: 11px; }
[data-asc-hub] .asc-hub-table th, [data-asc-hub] .asc-hub-table td { padding: 3px 2px; text-align: left; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-table th { color: var(--dsw-alias-label-secondary); font-weight: 600; }
[data-asc-hub] .asc-hub-table tr { border-top: 1px solid var(--dsw-alias-border-l1); }
[data-asc-hub] .asc-hub-table .asc-hub-num { text-align: right; }
[data-asc-hub] .asc-hub-total { font-weight: 600; }
@media (max-width: 360px) {
  [data-asc-hub] .asc-hub-head { flex-wrap: wrap; }
  [data-asc-hub] .asc-hub-actions { flex-direction: column; align-items: stretch; }
  [data-asc-hub] .asc-hub-actions .asc-hub-btn { width: 100%; }
}
`

    /* ------------------------------------------------------------------ *
     * Transport: exact-Fetch RPC over the shared /api channel.
     * The Host answers with the action's data directly; an envelope-shaped
     * answer is unwrapped as well so both contract revisions work.
     * ------------------------------------------------------------------ */

    async function callHost(ctx: ClientContext, action: string, input: unknown, signal?: AbortSignal): Promise<CallResult> {
      const payload = input === undefined ? { action } : { action, input }
      try {
        const result = await ctx.connection.rpc.call('/api', 'asc-hub/' + action, payload, signal)
        if (!result || result.ok !== true) {
          const error: WireErrorLike = result && result.error && typeof result.error === 'object' ? result.error : {}
          const details: { text?: unknown; detail?: unknown } = error.details && typeof error.details === 'object' ? error.details : {}
          return {
            ok: false,
            error: {
              code: typeof error.code === 'string' && error.code ? error.code : 'RPC_FAILED',
              message: typeof error.message === 'string' ? error.message : '',
              detail: typeof details.text === 'string' && details.text ? details.text : (typeof details.detail === 'string' ? details.detail : ''),
            },
          }
        }
        return { ok: true, value: result.value as JsonData | null }
      } catch (error) {
        const failure = error as { message?: unknown } | null
        return { ok: false, error: { code: 'RPC_FAILED', message: failure && failure.message ? String(failure.message) : '', detail: '' } }
      }
    }

    function unwrapEnvelope(value: JsonData | null): ProbeResult {
      if (value && typeof value === 'object' && typeof value.ok === 'boolean' && Object.prototype.hasOwnProperty.call(value, 'action')) {
        if (value.ok === false) {
          const error: WireErrorLike = value.error && typeof value.error === 'object' ? value.error : {}
          return {
            ok: false,
            error: {
              code: typeof error.code === 'string' && error.code ? error.code : 'ASC_FAILED',
              message: typeof error.message === 'string' ? error.message : '',
              detail: typeof error.detail === 'string'
                ? error.detail
                : (error.details && typeof error.details.text === 'string' ? error.details.text : ''),
            },
          }
        }
        return { ok: true, data: value.data as JsonData | null }
      }
      return { ok: true, data: value as JsonData | null }
    }

    function errorDetail(error: WireErrorLike | null | undefined): string {
      if (!error) return ''
      if (typeof error.detail === 'string' && error.detail) return error.detail
      if (typeof error.message === 'string' && error.message) return error.message
      return typeof error.code === 'string' ? error.code : ''
    }

    /* ------------------------------------------------------------------ *
     * Hub store: one derived status snapshot shared by the trigger and the
     * panel. No polling; every panel action refreshes it afterwards.
     * ------------------------------------------------------------------ */

    // Everything before onboarding finishes reads "start"; the phase still
    // distinguishes engine from login so the body can show the right step.
    const PHASE_LABEL: Record<string, string> = { start: 'start', engine: 'start', login: 'start', ready: 'ready', error: 'error' }

    function deriveLabel(status: HubState | null): string {
      if (!status || typeof status !== 'object') return 'start'
      if (typeof status.label === 'string' && LABELS.has(status.label)) return status.label
      const phase = typeof status.phase === 'string' ? status.phase : ''
      if (phase === 'busy') {
        const operation = status.operation && typeof status.operation === 'object' ? status.operation : null
        return operation && operation.kind === 'submit' ? 'review' : 'build'
      }
      if (PHASE_LABEL[phase]) return PHASE_LABEL[phase]
      return status.lastError ? 'error' : 'start'
    }

    function createStore(ctx: ClientContext): Store {
      let state: StoreState = {
        status: null,
        statusError: null,
        hostDown: false,
        loading: true,
        label: 'start',
        busyAction: '',
        actionError: null,
        log: [],
        // Bumped by the panel's one refresh button; every query watches it, so one
        // click re-reads every section instead of each card owning its own button.
        reload: 0,
      }
      let inflight: Promise<HubState | null> | null = null
      let counter = 0
      const listeners = new Set<() => void>()

      const emit = (patch: Partial<StoreState>): void => {
        state = Object.assign({}, state, patch)
        for (const listener of Array.from(listeners)) listener()
      }
      const subscribe = (listener: () => void): (() => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      }
      const getSnapshot = () => state

      const pushLog = (action: string, text: unknown): void => {
        if (typeof text !== 'string' || !text) return
        counter += 1
        emit({ log: [{ id: counter, action, text }, ...state.log].slice(0, 4) })
      }

      // A transport failure is almost always the Host half being swapped (plugin
      // install/update, HMR). One short retry covers that gap; if it is still gone the
      // page is stale, so the panel says so once and offers a reload.
      const isTransport = (error: HubError | null | undefined): boolean => !!error && error.code === 'RPC_FAILED'
      const wait = (ms: number): Promise<void> => new Promise(resolve => {
        if (typeof globalThis.setTimeout !== 'function') { resolve(); return }
        globalThis.setTimeout(resolve, ms)
      })
      const probe: Probe = async (action, input, signal) => {
        let reply = await callHost(ctx, action, input, signal)
        if (!reply.ok && isTransport(reply.error) && !(signal && signal.aborted)) {
          await wait(600)
          if (!(signal && signal.aborted)) reply = await callHost(ctx, action, input, signal)
        }
        const down = !reply.ok && isTransport(reply.error)
        if (down !== state.hostDown) emit({ hostDown: down })
        return reply.ok ? unwrapEnvelope(reply.value) : reply
      }

      /** Re-read everything: the status here, and every section through `reload`. */
      const refreshAll = async () => {
        emit({ reload: state.reload + 1 })
        return refresh()
      }

      const refresh = (): Promise<HubState | null> => {
        if (inflight) return inflight
        const run = (async () => {
          const result = await probe('status')
          if (result.ok) {
            const data = result.data && typeof result.data === 'object' ? result.data as HubState : null
            state = Object.assign({}, state, { status: data, statusError: null, loading: false, label: deriveLabel(data) })
            for (const listener of Array.from(listeners)) listener()
            return data
          }
          emit({ statusError: result.error, loading: false, label: state.status ? state.label : 'error' })
          return null
        })()
        inflight = run
        const settle = () => { if (inflight === run) inflight = null }
        run.then(settle, settle)
        return run
      }

      const perform = async (action: string, input?: unknown): Promise<ProbeResult> => {
        emit({ busyAction: action, actionError: null })
        const result = await probe(action, input)
        if (!result.ok) pushLog(action, errorDetail(result.error))
        else if (result.data && typeof result.data.log === 'string') pushLog(action, result.data.log)
        emit({ busyAction: '', actionError: result.ok ? null : result.error })
        await refresh()
        return result
      }

      return { subscribe, getSnapshot, refresh, refreshAll, probe, perform }
    }

    /* ------------------------------------------------------------------ *
     * Small helpers
     * ------------------------------------------------------------------ */

    function useLocaleTick(locale: LocaleService): void {
      const subscribe = React.useCallback((listener: () => void) => locale.subscribe(listener), [locale])
      const getSnapshot = React.useCallback(() => locale.getLocale(), [locale])
      React.useSyncExternalStore(subscribe, getSnapshot)
    }

    function errorText(t: Translate, code: string): string {
      if (typeof code !== 'string' || !code) return t('errorUnknown')
      const key = 'error.' + code
      const text = t(key)
      return text === key ? t('errorUnknown') : text
    }

    function readStored(key: string): string {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return ''
        const value = window.localStorage.getItem(key)
        return typeof value === 'string' ? value : ''
      } catch (error) { return '' }
    }

    function writeStored(key: string, value: string): void {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return
        if (value) window.localStorage.setItem(key, value)
        else window.localStorage.removeItem(key)
      } catch (error) { /* storage may be unavailable; selection stays in memory */ }
    }

    function shortId(value: unknown): string {
      if (typeof value !== 'string' || !value) return ''
      return value.length <= 4 ? value : '…' + value.slice(-4)
    }

    function formatDate(value: unknown): string {
      return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : ''
    }

    /** A build reads the way Xcode names it: marketing version, build in brackets. */
    function buildLabel(build: BuildInfo | null): string {
      const version = build && build.version !== undefined && build.version !== '' ? String(build.version) : ''
      const number = build && build.buildNumber !== undefined && build.buildNumber !== '' ? String(build.buildNumber) : ''
      if (version && number) return version + ' (' + number + ')'
      return version || number || '—'
    }

    /** Apple's processing states are enums; say them in words instead. */
    function processingLabel(t: Translate, value: unknown): string {
      const text = typeof value === 'string' ? value.toUpperCase() : ''
      if (!text) return t('unknown')
      if (text.includes('EXPIRED')) return t('buildExpired')
      if (/REJECT|FAIL|INVALID|ERROR/.test(text)) return t('buildInvalid')
      if (/REVIEW|PROCESS|WAIT|PENDING|PREPARE/.test(text)) return t('buildProcessing')
      if (/READY|SALE|COMPLETE|VALID|APPROVED/.test(text)) return t('buildReady')
      return text
    }

    function chipState(value: unknown): string {
      const text = typeof value === 'string' ? value.toUpperCase() : ''
      if (!text) return 'idle'
      if (/REJECT|FAIL|INVALID|ERROR|EXPIRED/.test(text)) return 'error'
      if (/REVIEW|PROCESS|WAIT|PENDING|PREPARE/.test(text)) return 'wait'
      if (/READY|SALE|COMPLETE|VALID|APPROVED/.test(text)) return 'ok'
      return 'idle'
    }

    function normalizeApps(data: JsonData | null): AppInfo[] {
      return data && Array.isArray(data.apps) ? (data.apps as AppInfo[]).filter(app => app && typeof app.id === 'string') : []
    }

    function normalizeBuilds(data: JsonData | null): BuildInfo[] {
      return data && Array.isArray(data.builds) ? (data.builds as BuildInfo[]).filter(build => build && typeof build.id === 'string') : []
    }

    function normalizeGroups(data: JsonData | null): GroupInfo[] {
      return data && Array.isArray(data.groups) ? (data.groups as GroupInfo[]).filter(group => group && typeof group.id === 'string') : []
    }

    /** Builds a person can actually send: processed, not expired, newest first. */
    function distributableBuilds(builds: BuildInfo[]): BuildInfo[] {
      if (!Array.isArray(builds)) return []
      return builds.filter(build => build && typeof build.processingState === 'string'
        && build.processingState.toUpperCase() === 'VALID' && build.expired !== true)
    }

    /* One read query; `key` carries the input identity so effects re-run only
     * when the payload actually changes. Every query also watches the store's
     * `reload` counter, so the panel's single refresh button re-reads everything. */
    function useQuery(store: Store, action: string, input: unknown, enabled: boolean): QueryResult {
      const key = input === undefined ? '' : JSON.stringify(input)
      const [result, setResult] = React.useState<QueryState>({ loading: !!enabled, data: null, error: null })
      const [nonce, setNonce] = React.useState(0)
      const tick = React.useSyncExternalStore(store.subscribe, () => store.getSnapshot().reload)
      const keyRef = React.useRef(key)
      React.useEffect(() => {
        if (!enabled) {
          setResult({ loading: false, data: null, error: null })
          return undefined
        }
        const changed = keyRef.current !== key
        keyRef.current = key
        let live = true
        setResult(current => ({ loading: true, data: changed ? null : current.data, error: null }))
        const payload: unknown = key ? JSON.parse(key) : undefined
        void store.probe(action, payload).then(reply => {
          if (!live) return
          setResult({ loading: false, data: reply.ok ? reply.data : null, error: reply.ok ? null : reply.error })
        })
        return () => { live = false }
      }, [store, action, key, enabled, nonce, tick])
      const reload = React.useCallback(() => { setNonce(value => value + 1) }, [])
      return [result, reload]
    }

    /* ------------------------------------------------------------------ *
     * Shared presentational pieces
     * ------------------------------------------------------------------ */

    /* The page outlived the Host half. One calm sentence and the one thing that fixes
     * it, instead of an error box per card. */
    function Recovery({ t }: { t: Translate }): VNode {
      return h('section', { className: 'asc-hub-recovery', role: 'alert' },
        h('p', { className: 'asc-hub-recovery-title' }, t('hostDownTitle')),
        h('p', { className: 'asc-hub-recovery-body' }, t('hostDownBody')),
        h('div', { className: 'asc-hub-recovery-actions' },
          h('button', {
            type: 'button',
            className: 'asc-hub-btn',
            onClick: () => {
              const location = globalThis.location
              if (location && typeof location.reload === 'function') location.reload()
            },
          }, t('reloadPanel'))))
    }

    function ErrorNote({ t, error }: { t: Translate; error: HubError | null }): VNode | null {
      if (!error) return null
      const code = typeof error.code === 'string' ? error.code : ''
      // A dead transport is one fact about the page, not five; the panel banner owns it.
      if (code === 'RPC_FAILED') return null
      const message = typeof error.message === 'string' ? error.message : ''
      const detail = typeof error.detail === 'string' ? error.detail : ''
      const nextKey = 'next.' + code
      const nextText = code ? t(nextKey) : nextKey
      return h('div', { className: 'asc-hub-error', role: 'alert' },
        h('p', { className: 'asc-hub-error-title' }, errorText(t, code)),
        code ? h('span', { className: 'asc-hub-chip', 'data-state': 'error' }, code) : null,
        message ? h('p', { className: 'asc-hub-error-msg' }, message) : null,
        nextText !== nextKey ? h('p', { className: 'asc-hub-error-next' }, nextText) : null,
        detail ? h('pre', { className: 'asc-hub-detail' }, detail) : null)
    }

    function ActionRow({ className, children }: { className?: string; children?: Child }): VNode {
      return h('div', { className: className ? 'asc-hub-actions ' + className : 'asc-hub-actions' }, children)
    }

    function SummaryRow({ label, value }: { label: string; value: string }): VNode[] {
      return [h('dt', { key: 't' }, label), h('dd', { key: 'd' }, value)]
    }

    /**
     * One step of the onboarding page: a timeline node carrying the step number
     * (or a tick once done) and, beside it, the rounded card that holds the work.
     * The rail behind the node is what shows progress between the cards.
     */
    function Step({ number, total, title, subtitle, state, srLabel, children }: { number: number; total: number; title: string; subtitle?: string; state: string; srLabel?: string; children?: Child }): VNode {
      const done = state === 'done'
      return h('div', { className: 'asc-hub-phase', 'data-state': state },
        h('div', { className: 'asc-hub-phase-rail', 'aria-hidden': 'true' },
          h('span', { className: 'asc-hub-phase-node' }, done ? '✓' : String(number))),
        h('section', {
          className: 'asc-hub-step',
          'aria-current': state === 'current' ? 'step' : undefined,
        },
          srLabel ? h('span', { className: 'asc-hub-sr' }, srLabel) : null,
          h('div', { className: 'asc-hub-step-head' },
            h('h3', { className: 'asc-hub-step-title' }, title),
            subtitle ? h('p', { className: 'asc-hub-step-sub' }, subtitle) : null),
          children ? h('div', { className: 'asc-hub-step-body' }, children) : null))
    }

    /* ------------------------------------------------------------------ *
     * Trigger
     * ------------------------------------------------------------------ */

    function StatusButton(props: { t: Translate; store: Store; locale: LocaleService; open: () => void; sessionId?: string }): VNode {
      const { t, store, locale, open } = props
      useLocaleTick(locale)
      const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot)
      React.useEffect(() => { void store.refresh() }, [store])
      const label = state.label
      return h('span', { 'data-asc-hub': '', className: 'asc-hub-trigger-slot' },
        h('style', null, STYLES),
        h('button', {
          type: 'button',
          className: 'asc-hub-pill',
          'data-label': label,
          'aria-busy': state.busyAction ? 'true' : undefined,
          'aria-label': t('statusAria', { label: t('label.' + label) }),
          title: t('statusAria', { label: t('label.' + label) }),
          onClick: () => open(),
        },
          h('span', { className: 'asc-hub-dot', 'aria-hidden': 'true' }),
          h('span', { className: 'asc-hub-pill-text' }, 'asc: ' + label)))
    }

    function TabTitle(props: { t: Translate }): VNode {
      return h('span', { className: 'asc-hub-tab-title' }, props.t('tabTitle'))
    }

    /* ------------------------------------------------------------------ *
     * Onboarding
     * ------------------------------------------------------------------ */

    function EngineStep({ t, store, engine, engineReady }: { t: Translate; store: Store; engine: EngineInfo | null; engineReady: boolean }): VNode {
      const [log, setLog] = React.useState('')
      const [error, setError] = React.useState<HubError | null>(null)
      const [busy, setBusy] = React.useState(false)
      const install = async () => {
        setBusy(true)
        setError(null)
        // The Host chooses Homebrew and falls back to the official installer on
        // its own, so this is the only button the step needs.
        const result = await store.perform('engine.install', { method: 'brew' })
        setBusy(false)
        if (result.ok) {
          if (result.data && typeof result.data.log === 'string') setLog(result.data.log)
          await store.perform('engine.detect')
          return
        }
        setError(result.error)
        if (result.error && typeof result.error.detail === 'string') setLog(result.error.detail)
      }
      const output = log || (error && typeof error.detail === 'string' ? error.detail : '')
      // One line, the last thing the installer said: that is the whole budget here.
      const tail = String(output || '')
        .replace(/\r/g, '')
        .split('\n')
        .filter(line => line.trim() !== '')
        .slice(-1)
        .join('')

      // The slot under the button is one line tall in every state, so the steps below
      // never move: the output plays there, the version replaces it when ready.
      return h('div', { className: 'asc-hub-step-body' },
        h('div', {
          className: 'asc-hub-engine-slot',
          role: engineReady || busy || !tail ? undefined : 'log',
          'aria-label': engineReady || busy || !tail ? undefined : t('installLogTitle'),
        },
          engineReady
            ? h('span', { className: 'asc-hub-step-caption' }, t('engineCaption', { version: (engine && engine.version) || t('unknown') }))
            : busy
              ? h('span', { className: 'asc-hub-step-caption' }, t('installing'))
              : tail ? h('pre', { className: 'asc-hub-engine-log' }, tail) : null),
        h('button', {
          type: 'button',
          className: 'asc-hub-btn asc-hub-btn-primary',
          disabled: engineReady || busy,
          'aria-busy': busy ? 'true' : undefined,
          onClick: () => { void install() },
        }, engineReady ? t('installedLabel') : t('installAsc')),
        h(ErrorNote, { t, error }))
    }

    function LoginStep({ t, store, keepOnboarding, enabled, auth, verified }: { t: Translate; store: Store; keepOnboarding: () => void; enabled: boolean; auth: AuthInfo | null; verified: boolean }): VNode {
      const [keyId, setKeyId] = React.useState('')
      const [issuerId, setIssuerId] = React.useState('')
      const [profileName, setProfileName] = React.useState('')
      const [file, setFile] = React.useState<KeyFile | null>(null)
      const [dragging, setDragging] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState<HubError | null>(null)
      const [message, setMessage] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [checked, setChecked] = React.useState(false)
      const [showProfile, setShowProfile] = React.useState(false)
      const fileInput = React.useRef<HTMLInputElement | null>(null)

      // Verified locks the fields where they stand: the values stay visible, nothing
      // about them can change, and the only affordance left is Reset.
      const locked = verified || !enabled
      // The key is supplied by the file the user just downloaded: dropping it is
      // the whole input, so the panel never asks anyone to find a filesystem path.
      const missing = {
        keyId: keyId.trim() === '',
        issuerId: issuerId.trim() === '',
        file: file === null,
      }
      const credentialsReady = !missing.keyId && !missing.issuerId && !missing.file
      // Marks stay off until the user asks to verify, then follow the fields, so
      // filling one in clears its own message without a second click.
      const showError = (name: 'keyId' | 'issuerId' | 'file'): boolean => checked && missing[name]

      const readFile = (dropped: File | null): void => {
        if (!dropped) return
        const name = typeof dropped.name === 'string' ? dropped.name : ''
        if (!/\.p8$/i.test(name)) { setMessage(t('keyFileWrong')); return }
        const reader = new FileReader()
        reader.onload = () => {
          const text = typeof reader.result === 'string' ? reader.result : ''
          if (!text) { setMessage(t('keyFileWrong')); return }
          setFile({ name, text })
          setMessage('')
          // AuthKey_<KEYID>.p8 carries the key id, so the user does not retype it.
          const match = /^AuthKey_([A-Za-z0-9]+)\.p8$/.exec(name)
          if (match) setKeyId(current => current || match[1])
        }
        reader.onerror = () => setMessage(t('keyFileWrong'))
        reader.readAsText(dropped)
      }

      // Undo the sign-in: `asc auth logout` drops the key from the Keychain, and the
      // status refresh puts the card back to its unverified form.
      const undo = async () => {
        setBusy(true)
        setError(null)
        setNotice('')
        const active = auth && typeof auth.activeProfile === 'string' && auth.activeProfile ? auth.activeProfile : undefined
        const result = await store.perform('auth.logout', active ? { name: active } : {})
        setBusy(false)
        if (!result.ok) { setError(result.error); return }
        setNotice(t('signOutDone'))
        if (keepOnboarding) keepOnboarding()
        await store.refresh()
      }

      const submit = async () => {
        setChecked(true)
        setNotice('')
        if (!credentialsReady) { setMessage(''); return }
        setBusy(true)
        setError(null)
        setMessage('')
        // The Host writes the PEM to a private 0600 file, hands it to asc, and
        // deletes it; `network` makes asc verify the key before it is stored.
        const result = await store.perform('auth.importKey', {
          keyId,
          issuerId,
          privateKeyPem: file!.text,
          name: profileName.trim() || undefined,
          network: true,
        })
        setBusy(false)
        if (!result.ok) { setError(result.error); return }
        setNotice(t('importDone'))
        if (keepOnboarding) keepOnboarding()
        await store.refresh()
      }

      // Verified is a state, not a step: one grey button saying so and one word to
      // take it back. The form, the fields and their timers are gone.
      const idError = showError('keyId') ? t('errKeyId') : ''
      const issuerError = showError('issuerId') ? t('errIssuerId') : ''
      const fileError = showError('file') ? t('errKeyFile') : ''

      return h('div', { className: 'asc-hub-step-body' },
        h(ActionRow, null,
          h('button', {
            type: 'button',
            className: 'asc-hub-btn asc-hub-btn-outline',
            disabled: locked,
            onClick: () => { window.open(APPLE_KEYS_URL, '_blank', 'noopener,noreferrer') },
          }, t('openAppleKeys'))),
        h('label', { className: 'asc-hub-field' },
          h('span', null, t('keyId')),
          h('input', {
            className: 'asc-hub-input',
            type: 'text',
            value: keyId,
            disabled: locked,
            autoComplete: 'off',
            spellCheck: false,
            'aria-invalid': idError ? 'true' : undefined,
            'aria-describedby': idError ? 'asc-hub-keyid-error' : undefined,
            onChange: event => setKeyId(event.target.value),
          }),
          h('span', { className: 'asc-hub-field-msg', id: 'asc-hub-keyid-error', 'data-error': idError ? 'true' : 'false', 'aria-live': 'polite' }, idError)),
        h('label', { className: 'asc-hub-field' },
          h('span', null, t('issuerId')),
          h('input', {
            className: 'asc-hub-input',
            type: 'text',
            value: issuerId,
            disabled: locked,
            autoComplete: 'off',
            spellCheck: false,
            'aria-invalid': issuerError ? 'true' : undefined,
            'aria-describedby': issuerError ? 'asc-hub-issuer-error' : undefined,
            onChange: event => setIssuerId(event.target.value),
          }),
          h('span', { className: 'asc-hub-field-msg', id: 'asc-hub-issuer-error', 'data-error': issuerError ? 'true' : 'false', 'aria-live': 'polite' }, issuerError)),
        h('div', { className: 'asc-hub-field' },
          h('span', null, t('keyPath')),
          h('div', {
            className: 'asc-hub-key-row',
            'data-source': file ? 'file' : 'empty',
            'data-dragging': dragging ? 'true' : 'false',
            'data-locked': locked ? 'true' : 'false',
            'data-invalid': fileError ? 'true' : undefined,
            onDragOver: event => { if (!locked) { event.preventDefault(); setDragging(true) } },
            onDragLeave: () => setDragging(false),
            onDrop: event => {
              event.preventDefault()
              setDragging(false)
              readFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0])
            },
          },
            h('input', {
              ref: fileInput,
              className: 'asc-hub-file-input',
              type: 'file',
              accept: '.p8',
              disabled: locked,
              tabIndex: -1,
              'aria-hidden': 'true',
              onChange: event => {
                readFile(event.target.files && event.target.files[0])
                event.target.value = ''
              },
            }),
            file
              ? h('span', { className: 'asc-hub-key-name', title: file.name }, h('span', null, file.name))
              : h('span', { className: 'asc-hub-key-hint' }, t('keyDropZone')),
            h('button', {
              type: 'button',
              className: 'asc-hub-btn',
              disabled: locked,
              onClick: () => { if (fileInput.current) fileInput.current.click() },
            }, t('chooseKeyFile')),
            file
              ? h('button', {
                type: 'button',
                className: 'asc-hub-btn',
                'aria-label': t('clearKeyFile'),
                disabled: locked,
                onClick: () => setFile(null),
              }, '×')
              : null),
          h('span', { className: 'asc-hub-field-msg', id: 'asc-hub-key-error', 'data-error': fileError ? 'true' : 'false', 'aria-live': 'polite' }, fileError)),
        h('div', { className: 'asc-hub-optional' },
          h('button', {
            type: 'button',
            className: 'asc-hub-optional-toggle',
            'data-open': showProfile ? 'true' : 'false',
            'aria-expanded': showProfile ? 'true' : 'false',
            disabled: locked,
            onClick: () => setShowProfile(value => !value),
          }, profileName.trim() || t('profileNameOptional')),
          // The field keeps its box whether or not it is revealed, so toggling it
          // cannot move the action below.
          // Nothing is reserved while it is folded: opening the triangle is what makes
          // the field, and the extra height, appear.
          showProfile ? h('div', { className: 'asc-hub-optional-body' },
            h('input', {
              className: 'asc-hub-input',
              type: 'text',
              value: profileName,
              'aria-label': t('profileNameOptional'),
              disabled: locked,
              placeholder: t('profileNameHint'),
              autoComplete: 'off',
              spellCheck: false,
              onChange: event => setProfileName(event.target.value),
            })) : null),
        // Verified keeps the layout exactly where it was: same fields, same button
        // slot, with the button reporting the state and one word beside it to reset.
        h('div', { className: 'asc-hub-actions asc-hub-actions-submit' },
          h('button', {
            type: 'button',
            className: 'asc-hub-btn asc-hub-btn-primary',
            disabled: locked || busy,
            'aria-busy': busy ? 'true' : undefined,
            onClick: verified ? undefined : () => { void submit() },
          }, verified ? t('verifiedLabel') : busy ? t('verifying') : t('verifySignIn')),
          verified ? h('button', {
            type: 'button',
            className: 'asc-hub-link',
            // Reset is the way out of the verified state, so it stays clickable there;
            // it only needs the engine, since it runs `asc auth logout`.
            disabled: busy || !enabled,
            onClick: () => { void undo() },
          }, busy ? t('undoing') : t('resetSignIn')) : null),
        message ? h('p', { className: 'asc-hub-error-msg', role: 'alert' }, message) : null,
        notice ? h('p', { className: 'asc-hub-hint', role: 'status' }, notice) : null,
        h(ErrorNote, { t, error }))
    }

    function ReadyStep({ t, onConsole, enabled }: { t: Translate; onConsole: () => void; enabled: boolean }): VNode {
      // The confirming line states a fact about the machine, so it only appears
      // once that fact is true; a step that cannot run yet says nothing.
      return h('div', { className: 'asc-hub-step-body' },
        h('button', {
          type: 'button',
          className: 'asc-hub-btn asc-hub-btn-primary',
          disabled: !enabled,
          onClick: onConsole,
        }, t('openConsole')))
    }

    /**
     * The whole flow on one page, in order: install the engine, sign in, open the
     * console. Steps that are already satisfied stay visible as one quiet line so
     * the page always reads 1-2-3.
     */
    function Onboarding({ t, store, engine, auth, engineReady, authReady, onConsole, keepOnboarding }: { t: Translate; store: Store; engine: EngineInfo | null; auth: AuthInfo | null; engineReady: boolean; authReady: boolean; onConsole: () => void; keepOnboarding: () => void }): VNode {
      const engineState = engineReady ? 'done' : 'current'
      const loginState = authReady ? 'done' : engineReady ? 'current' : 'pending'
      const readyState = engineReady && authReady ? 'current' : 'pending'
      // The visible numerals are decorative, so each card names itself to a screen
      // reader: "Step 2 of 3", plus "Done" once satisfied.
      const sr = (index: number, state: string): string => {
        const ordinal = t('stepOf', { current: index, total: 3 })
        return state === 'done' ? ordinal + ', ' + t('step.done') : ordinal
      }
      return h('section', { className: 'asc-hub-onboarding' },
        h(Step, {
          number: 1, total: 3, title: t('stepEngine'), subtitle: t('engineSub'),
          state: engineState, srLabel: sr(1, engineState),
        }, h(EngineStep, { t, store, engine, engineReady })),
        h(Step, {
          number: 2, total: 3, title: t('stepLogin'),
          // Once signed in, the subtitle stops telling you to sign in.
          subtitle: authReady ? t('loginSubDone') : t('loginIntro1'),
          state: loginState, srLabel: sr(2, loginState),
        }, h(LoginStep, { t, store, keepOnboarding, enabled: engineReady, auth, verified: authReady })),
        h(Step, {
          number: 3, total: 3, title: t('stepReady'),
          subtitle: t('readySub'),
          state: readyState, srLabel: sr(3, readyState),
        }, h(ReadyStep, { t, onConsole, enabled: engineReady && authReady })))
    }

    /* ------------------------------------------------------------------ *
     * Console
     * ------------------------------------------------------------------ */

    /* The app card is the picker: the card title is its label, so both sit on one
     * row instead of a title above a second, redundant label. */
    function AppPicker({ t, query, apps, appId, onChange }: { t: Translate; query: QueryState; apps: AppInfo[]; appId: string; onChange: (value: string) => void }): VNode {
      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-inline' },
          h('span', { className: 'asc-hub-inline-label' }, t('appTitle')),
          apps.length > 0
            ? h('select', {
              className: 'asc-hub-select',
              value: appId,
              onChange: event => onChange(event.target.value),
              'aria-label': t('appTitle'),
            },
              h('option', { value: '' }, t('appNone')),
              apps.map(app => h('option', { key: app.id, value: app.id },
                String(app.name || app.id) + ' · ' + String(app.bundleId || ''))))
            : query.loading ? h('span', { className: 'asc-hub-hint' }, t('loading')) : null),
        query.error ? h(ErrorNote, { t, error: query.error }) : null,
        !query.error && !query.loading && apps.length === 0 ? h('p', { className: 'asc-hub-hint' }, t('noApps')) : null,
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appHint')) : null)
    }

    /* Where a build stands with TestFlight: one tag per audience it reached. */
    function TestFlightMarks({ t, build }: { t: Translate; build: BuildInfo }): VNode | null {
      const marks: VNode[] = []
      if (build.internal === true) {
        marks.push(h('span', {
          key: 'internal',
          className: 'asc-hub-tf',
          'data-audience': 'internal',
          title: t('tfInternalTitle'),
        }, t('internalGroup')))
      }
      if (build.external === true) {
        marks.push(h('span', {
          key: 'external',
          className: 'asc-hub-tf',
          'data-audience': 'external',
          title: t('tfExternalTitle'),
        }, t('externalGroup')))
      }
      if (marks.length === 0) return null
      return h('span', { className: 'asc-hub-tf-set' }, marks)
    }

    /* Where this session works. A section like every other one: the same card chrome
     * and title, and the Host resolves the directory from the session itself. */
    /* What the auto-fix button copies. It is a message to the model, so it is written
     * in English and never localized: the person pastes it into the chat. */
    const AUTO_FIX_PROMPT = [
      'I want to make this working directory into a codebase that is ready to build and ship to App Store Connect.',
      '',
      'Please:',
      '1. Build a Release archive for the App Store (asc xcode archive, then asc xcode export) and read the errors.',
      '2. Fix everything that stops it: unresolved packages or pods, signing and provisioning, missing SDKs or build settings, compiler errors, and version/build-number mismatches.',
      '3. Keep the app behavior unchanged. Do not add features, do not reformat unrelated code, and do not commit anything.',
      '',
      'When the archive and the export both succeed, tell me the scheme and the exact commands that worked, so I can run them from the ASC Hub panel.',
    ].join('\n')

    function WorkspaceCard({ t, store, sessionId }: { t: Translate; store: Store; sessionId?: string }): VNode {
      const query = useQuery(store, 'workspace.info', sessionId ? { sessionId } : {}, true)
      const data = query[0].data && typeof query[0].data === 'object' ? query[0].data as WorkspaceInfo : null
      const text = (key: keyof WorkspaceInfo): string => (data && typeof data[key] === 'string' ? data[key] : '')
      const count = (key: keyof WorkspaceInfo): number | null => (data && typeof data[key] === 'number' ? data[key] : null)
      const display = text('display')
      const cwd = text('cwd')
      const branch = text('branch')
      const upstream = text('upstream')
      const worktree = !!(data && data.worktree === true)
      const ahead = count('ahead')
      const behind = count('behind')
      const changed = count('changed')
      const untracked = count('untracked')
      const clean = !!(data && data.clean === true)
      const built = data && data.build && typeof data.build === 'object' ? data.build : null
      const buildReady = !!(built && built.ready === true)
      const buildIos = !!(built && built.ios === true)
      const reason = built && typeof built.reason === 'string' ? built.reason : ''
      const reasonKey = reason === 'no-project' ? 'cannotNoProject'
        : reason === 'not-ios' ? 'cannotNotIos'
          : reason === 'no-xcode' ? 'cannotNoXcode'
            : reason === 'unloadable' ? 'cannotUnloadable' : ''
      const [copied, setCopied] = React.useState(false)
      // The repair prompt is the only thing the panel can offer for a codebase that
      // cannot build: it is a message for the model, so it is copied, not sent.
      const copyPrompt = () => {
        const clipboard = globalThis.navigator && globalThis.navigator.clipboard
        if (clipboard && typeof clipboard.writeText === 'function') {
          void clipboard.writeText(AUTO_FIX_PROMPT).then(() => setCopied(true), () => setCopied(false))
        }
      }
      // Second line: which branch, how far from its upstream, and whether anything is
      // uncommitted. Short tokens with full sentences in the tooltips.
      const dirty: string[] = []
      if (clean) dirty.push(t('gitClean'))
      else {
        if (changed !== null && changed > 0) dirty.push(t('gitUncommitted', { count: changed }))
        if (untracked !== null && untracked > 0) dirty.push(t('gitUntracked', { count: untracked }))
      }
      const hasGit = branch !== '' || ahead !== null || behind !== null || dirty.length > 0
      // Three lines, in the order the question is asked: what this is, where it is and
      // what git says about it, and whether the rest of the panel can build it.
      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('workspaceLabel'))),
        h('div', { className: 'asc-hub-workspace' },
          display
            ? h('code', { className: 'asc-hub-workspace-path', title: cwd || display }, display)
            : h('span', { className: 'asc-hub-hint' }, query[0].error ? t('unknown') : t('workspacePending')),
          hasGit
            ? h('span', { className: 'asc-hub-workspace-git' },
              worktree ? h('span', { className: 'asc-hub-tag' }, t('worktreeTag')) : null,
              branch ? h('span', { className: 'asc-hub-workspace-branch' }, branch) : null,
              ahead !== null && ahead > 0
                ? h('span', { className: 'asc-hub-workspace-delta', title: upstream ? t('gitAheadTitle', { count: ahead, upstream }) : undefined }, '\u2191' + ahead)
                : null,
              behind !== null && behind > 0
                ? h('span', { className: 'asc-hub-workspace-delta', title: upstream ? t('gitBehindTitle', { count: behind, upstream }) : undefined }, '\u2193' + behind)
                : null,
              dirty.map((part, index) => h('span', { key: index, className: 'asc-hub-workspace-state' }, part)))
            : null),
        built
          ? h('div', { className: 'asc-hub-workspace-build' },
            h('span', {
              className: 'asc-hub-tag',
              'data-state': buildReady ? 'ok' : 'muted',
              title: buildReady ? String(built.name || '') : (reasonKey ? t(reasonKey) : ''),
            }, buildReady ? t('buildReady') : t('buildNotReady')),
            !buildReady && reasonKey ? h('span', { className: 'asc-hub-hint' }, t(reasonKey)) : null,
            // The one repair the panel can hand over, and only for an iOS codebase.
            !buildReady && buildIos
              ? h('button', {
                type: 'button',
                className: 'asc-hub-btn',
                title: t('autoFixHint'),
                onClick: copyPrompt,
              }, copied ? t('autoFixCopied') : t('autoFix'))
              : null)
          : null)
    }

    function SalesCard({ t, store, appId }: { t: Translate; store: Store; appId: string }): VNode {
      const [period, setPeriod] = React.useState('day')
      const [date, setDate] = React.useState('')
      const [vendorNumber, setVendorNumber] = React.useState(() => readStored(VENDOR_KEY))
      const [editingVendor, setEditingVendor] = React.useState(false)
      const [vendorDraft, setVendorDraft] = React.useState(() => readStored(VENDOR_KEY))

      // CONTRACT §Sales: `appId` is required and the report is vendor-scoped.
      const input: SalesInput = { appId, period }
      if (date) input.date = date
      if (vendorNumber) input.vendorNumber = vendorNumber
      const query = useQuery(store, 'sales.summary', input, !!appId)
      const data = query[0].data && typeof query[0].data === 'object' ? query[0].data : null
      const rows = data && Array.isArray(data.rows) ? data.rows as SalesRow[] : null
      const totals = data && data.totals && typeof data.totals === 'object' ? data.totals as SalesTotals : null
      const needsVendor = !!(query[0].error && query[0].error.code === 'VENDOR_REQUIRED')
      const showVendorField = editingVendor || needsVendor

      const applyVendor = () => {
        const next = vendorDraft.trim()
        setVendorNumber(next)
        writeStored(VENDOR_KEY, next)
        setEditingVendor(false)
      }

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('salesTitle')),
          h('button', { type: 'button', className: 'asc-hub-btn', disabled: !appId || query[0].loading, onClick: query[1] }, t('refresh'))),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        !appId ? null : h('div', { className: 'asc-hub-actions' },
          h('label', { className: 'asc-hub-field' },
            h('span', null, t('period')),
            h('select', {
              className: 'asc-hub-select',
              value: period,
              onChange: event => setPeriod(event.target.value),
              'aria-label': t('period'),
            },
              h('option', { value: 'day' }, t('periodDay')),
              h('option', { value: 'week' }, t('periodWeek')))),
          h('label', { className: 'asc-hub-field' },
            h('span', null, t('salesDate')),
            h('input', {
              className: 'asc-hub-input',
              type: 'text',
              value: date,
              placeholder: 'YYYY-MM-DD',
              spellCheck: false,
              onChange: event => setDate(event.target.value),
            }))),
        !appId ? null : showVendorField
          ? h('div', null,
            h('label', { className: 'asc-hub-field' },
              h('span', null, t('vendorNumber')),
              h('input', {
                className: 'asc-hub-input',
                type: 'text',
                value: vendorDraft,
                spellCheck: false,
                onChange: event => setVendorDraft(event.target.value),
              })),
            h('p', { className: 'asc-hub-hint' }, t('vendorHint')),
            h(ActionRow, null,
              h('button', { type: 'button', className: 'asc-hub-btn', disabled: !vendorDraft.trim(), onClick: applyVendor }, t('applyVendor'))))
          : h('p', { className: 'asc-hub-hint' },
            vendorNumber ? t('vendorCurrent', { number: vendorNumber }) : null,
            h('button', {
              type: 'button',
              className: 'asc-hub-btn',
              onClick: () => { setVendorDraft(vendorNumber); setEditingVendor(true) },
            }, t('setVendor'))),
        query[0].error ? h(ErrorNote, { t, error: query[0].error }) : null,
        data && (rows === null || (rows.length === 0 && !totals))
          ? h('p', { className: 'asc-hub-hint' }, t('noReport')) : null,
        rows && rows.length > 0 ? h('table', { className: 'asc-hub-table' },
          h('thead', null, h('tr', null,
            h('th', null, t('salesDate')),
            h('th', { className: 'asc-hub-num' }, t('salesUnits')),
            h('th', { className: 'asc-hub-num' }, t('salesProceeds')))),
          h('tbody', null,
            rows.map((row, index) => h('tr', { key: String((row && row.date) || index) },
              h('td', null, String((row && (row.date || row.day)) || '—')),
              h('td', { className: 'asc-hub-num' }, String((row && row.units !== undefined) ? row.units : '—')),
              h('td', { className: 'asc-hub-num' },
                String((row && row.proceeds !== undefined) ? row.proceeds : '—'),
                row && row.currency ? ' ' + String(row.currency) : ''))),
            totals ? h('tr', { className: 'asc-hub-total' },
              h('td', null, t('salesTotal')),
              h('td', { className: 'asc-hub-num' }, String(totals.units !== undefined ? totals.units : '—')),
              h('td', { className: 'asc-hub-num' }, String(totals.proceeds !== undefined ? totals.proceeds : '—'))) : null)) : null)
    }

    function AnalyticsCard({ t, store, appId }: { t: Translate; store: Store; appId: string }): VNode {
      const query = useQuery(store, 'analytics.reports', appId ? { appId } : undefined, !!appId)
      const data = query[0].data && typeof query[0].data === 'object' ? query[0].data : null
      const requests: JsonData[] = data && Array.isArray(data.requests) ? data.requests as JsonData[] : []
      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('analyticsTitle')),
          h('button', { type: 'button', className: 'asc-hub-btn', disabled: !appId || query[0].loading, onClick: query[1] }, t('refresh'))),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        query[0].error ? h(ErrorNote, { t, error: query[0].error }) : null,
        appId && !query[0].loading && requests.length === 0 && !query[0].error
          ? h('p', { className: 'asc-hub-hint' }, t('noAnalytics')) : null,
        requests.length > 0 ? h('ul', { className: 'asc-hub-rows' },
          requests.map((request, index) => {
            const record: JsonData = request && typeof request === 'object' ? request : {}
            const id = record.id !== undefined ? String(record.id) : ''
            const accessType = record.accessType !== undefined ? String(record.accessType) : ''
            const summary = id || accessType ? null : JSON.stringify(record).slice(0, 160)
            return h('li', { key: id || String(index), className: 'asc-hub-row' },
              h('span', { className: 'asc-hub-row-main' },
                h('span', { className: 'asc-hub-mono' }, id || t('unknown')),
                accessType ? h('span', { className: 'asc-hub-hint' }, accessType) : null,
                summary ? h('span', { className: 'asc-hub-mono' }, summary) : null))
          })) : null)
    }

    function LogArea({ t, log }: { t: Translate; log: LogEntry[] }): VNode {
      const entries = Array.isArray(log) ? log : []
      return h('details', { className: 'asc-hub-log' },
        h('summary', null, t('logTitle')),
        entries.length === 0
          ? h('p', { className: 'asc-hub-hint' }, t('logEmpty'))
          : h('pre', { className: 'asc-hub-log-text' }, entries.map(entry => '[' + entry.action + '] ' + entry.text).join('\n\n')))
    }

    /**
     * The inherited skill pack. The Hub reports whether `asc install-skills` has run
     * on this machine; the row opens by default so the state and its one button are
     * both in reach, and installing is the same installer the user would run by hand.
     */
    const SKILL_EXAMPLES: string[] = ['skillsUse1', 'skillsUse2', 'skillsUse3', 'skillsUse4', 'skillsUse5', 'skillsUse6', 'skillsUse7']

    function SkillsRow({ t, store, skills, busy }: { t: Translate; store: Store; skills: SkillsInfo | null; busy: string }): VNode {
      // Open on arrival: the inherited pack is usually already installed, so the row
      // reads as a fact ("here is what asc put on this machine") instead of a
      // disclosure to hunt for.
      const [open, setOpen] = React.useState(true)
      const installed = !!skills && skills.installed === true
      const pending = installed && skills.update === true
      const count = skills && typeof skills.count === 'number' ? skills.count : 0
      const ref = skills && typeof skills.ref === 'string' ? skills.ref.slice(0, 7) : ''
      const state = installed
        ? t('skillsInstalled', { count, ref: ref === '' ? '—' : ref })
        : t('skillsMissing')
      const installing = busy === 'skills.install'
      // The one thing to do lives at the end of the summary line, in the row's own
      // type size: `install` when the pack is absent, `update` only when the engine
      // ships a newer pin. Nothing to do means no button at all.
      const action = !installed ? t('skillsInstall') : pending ? t('skillsUpdate') : ''
      const run = async () => {
        await store.perform('skills.install', {})
        await store.refresh()
      }
      return h('section', { className: 'asc-hub-skills' },
        h('div', { className: 'asc-hub-skills-head' },
          h('button', {
            type: 'button',
            className: 'asc-hub-optional-toggle',
            'data-open': open ? 'true' : 'false',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => setOpen(value => !value),
          }, t('skillsTitle') + ' · ' + state),
          action === ''
            ? null
            : h('button', {
              type: 'button',
              className: 'asc-hub-skills-action',
              disabled: busy !== '',
              onClick: () => { void run() },
            }, installing ? t('skillsInstalling') : action)),
        open
          ? h('div', { className: 'asc-hub-optional-body' },
            h('ul', { className: 'asc-hub-skills-uses' },
              SKILL_EXAMPLES.map(key => h('li', { key }, t(key)))))
          : null)
    }

    /* The build list, in two parts: the newest builds, a divider, then the build the
     * store version carries. It starts at three and grows by three, so a long history
     * never pushes the rest of the console off the panel. Picking a build happens where
     * it is used — TestFlight and Review each own a menu — so this list is a reference. */
    function BuildsCard({ t, appId, query, builds, release }: { t: Translate; appId: string; query: QueryState; builds: BuildInfo[]; release: BuildInfo | null }): VNode {
      const [visible, setVisible] = React.useState(BUILD_PAGE)
      React.useEffect(() => { setVisible(BUILD_PAGE) }, [appId])

      const pinned = release && release.id ? release : null
      const shown = builds.slice(0, visible)
      const hasMore = builds.length > shown.length
      const expanded = visible > BUILD_PAGE
      const tags = (build: BuildInfo, pinnedRow: boolean): VNode => h('span', { className: 'asc-hub-build-tags' },
        pinnedRow
          ? h('span', { className: 'asc-hub-tf', 'data-audience': 'release' }, t('releaseTag'))
          : h(TestFlightMarks, { t, build }))
      const row = (build: BuildInfo, pinnedRow: boolean): VNode => h('li', {
        key: pinnedRow ? 'pinned-' + build.id : build.id,
        className: pinnedRow ? 'asc-hub-row asc-hub-row-build asc-hub-row-pinned' : 'asc-hub-row asc-hub-row-build',
      },
        h('span', { className: 'asc-hub-build-pick' },
          h('span', { className: 'asc-hub-build-name' }, buildLabel(build))),
        tags(build, pinnedRow),
        h('span', { className: 'asc-hub-row-date asc-hub-mono' }, formatDate(build.uploadedDate)))

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('buildsTitle'))),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        query.error ? h(ErrorNote, { t, error: query.error }) : null,
        appId && !query.error && !query.loading && builds.length === 0 ? h('p', { className: 'asc-hub-hint' }, t('noBuilds')) : null,
        shown.length > 0
          ? h('ul', { className: 'asc-hub-rows' },
            shown.map(build => row(build, false)),
            hasMore || expanded
              ? h('li', { key: 'asc-hub-build-more', className: 'asc-hub-rows-more' },
                hasMore
                  ? h('button', {
                    type: 'button',
                    className: 'asc-hub-link asc-hub-link-quiet',
                    onClick: () => setVisible(current => current + BUILD_PAGE),
                  }, t('loadMore'))
                  : null,
                expanded
                  ? h('button', {
                    type: 'button',
                    className: 'asc-hub-link asc-hub-link-quiet',
                    onClick: () => setVisible(BUILD_PAGE),
                  }, t('showLess'))
                  : null)
              : null,
            pinned ? h('li', { key: 'asc-hub-build-divider', className: 'asc-hub-rows-divider', role: 'separator', 'aria-hidden': 'true' }) : null,
            pinned ? row(pinned, true) : null)
          : null)
    }

    /* Step 1 of the release flow: build the code in the working directory. Version and
     * build number are two separate decisions — that is what `1.2.5 (2)` is — so they
     * are two fields, and the scheme comes from the project itself. */
    function BuildCard({ t, store, appId, sessionId, builds, onBuilt }: { t: Translate; store: Store; appId: string; sessionId?: string; builds: BuildInfo[]; onBuilt: () => void }): VNode {
      const versions: string[] = []
      for (const build of builds) {
        const version = build && typeof build.version === 'string' ? build.version : ''
        if (version !== '' && versions.indexOf(version) === -1) versions.push(version)
      }
      const [version, setVersion] = React.useState('')
      const [buildNumber, setBuildNumber] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState<HubError | null>(null)
      const [note, setNote] = React.useState('')

      // Suggested, never imposed: the newest version and the next number for it, until
      // the human types their own.
      const chosenVersion = version !== '' ? version : (versions.length > 0 ? versions[0] : '')
      const numbers = builds
        .filter(build => build && (chosenVersion === '' || build.version === chosenVersion))
        .map(build => Number(build.buildNumber))
        .filter(number => Number.isFinite(number))
      const suggestion = numbers.length === 0 ? 1 : Math.max.apply(null, numbers) + 1
      const chosenNumber = buildNumber !== '' ? buildNumber : String(suggestion)

      const submit = async () => {
        if (!appId) return
        if (chosenVersion.trim() === '' || chosenNumber.trim() === '') {
          setError({ code: 'INVALID_INPUT', message: t('buildNeedsInput'), detail: '' })
          return
        }
        setBusy(true)
        setError(null)
        setNote('')
        // The unit of work is the directory, not a file: the Host archives what this
        // session is looking at, exports the .ipa and uploads it.
        const result = await store.perform('build.create', {
          appId,
          sessionId,
          version: chosenVersion.trim(),
          buildNumber: chosenNumber.trim(),
          confirm: true,
        })
        setBusy(false)
        if (!result.ok) { setError(result.error); return }
        setNote(t('builtNote'))
        if (typeof onBuilt === 'function') onBuilt()
      }

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('buildTitle'))),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        appId
          ? h('div', { className: 'asc-hub-build-line' },
            h('label', { className: 'asc-hub-field asc-hub-field-inline' },
              h('span', null, t('versionLabel')),
              h('input', {
                className: 'asc-hub-input',
                value: chosenVersion,
                placeholder: t('versionPlaceholder'),
                onChange: event => setVersion(event.target.value),
              })),
            h('label', { className: 'asc-hub-field asc-hub-field-inline' },
              h('span', null, t('buildNumberLabel')),
              h('input', {
                className: 'asc-hub-input',
                value: chosenNumber,
                inputMode: 'numeric',
                onChange: event => setBuildNumber(event.target.value),
              })))
          : null,
        appId ? h('p', { className: 'asc-hub-hint' }, t('buildHint')) : null,
        appId
          ? h(ActionRow, { className: 'asc-hub-actions-fill' },
            h('button', {
              type: 'button',
              className: 'asc-hub-btn asc-hub-btn-primary',
              disabled: busy,
              'aria-busy': busy ? 'true' : undefined,
              onClick: () => { void submit() },
            }, busy ? t('building') : t('buildAction')))
          : null,
        note ? h('p', { className: 'asc-hub-hint' }, note) : null,
        h(ErrorNote, { t, error }))
    }

    /** Numeric comparison of dotted version strings; null when either side is unusable. */
    function compareVersions(a: unknown, b: unknown): number | null {
      if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return null
      const left = a.split('.').map(part => Number(part))
      const right = b.split('.').map(part => Number(part))
      if (left.some(number => !Number.isFinite(number)) || right.some(number => !Number.isFinite(number))) {
        return a === b ? 0 : null
      }
      const length = Math.max(left.length, right.length)
      for (let index = 0; index < length; index += 1) {
        const one = left[index] === undefined ? 0 : left[index]
        const other = right[index] === undefined ? 0 : right[index]
        if (one > other) return 1
        if (one < other) return -1
      }
      return 0
    }

    /* The build menu both later steps use: label and choice on one row. A step owns its
     * own choice, because sending a build to testers and submitting one for review are
     * different decisions about the same list. */
    function BuildMenu({ t, label, builds, buildId, onChange, optionLabel }: { t: Translate; label: string; builds: BuildInfo[]; buildId: string; onChange: (value: string) => void; optionLabel?: (build: BuildInfo | null) => string }): VNode {
      const name = typeof optionLabel === 'function' ? optionLabel : buildLabel
      return h('div', { className: 'asc-hub-inline' },
        h('span', { className: 'asc-hub-inline-label' }, label),
        h('select', {
          className: 'asc-hub-select',
          value: buildId,
          'aria-label': label,
          disabled: builds.length === 0,
          onChange: event => onChange(event.target.value),
        },
          builds.length === 0 ? h('option', { value: '' }, t('tfNoBuild')) : null,
          builds.map(build => h('option', { key: build.id, value: build.id }, name(build)))))
    }

    /* Step 2: pick a build from the menu, pick the groups, write what to test, send. */
    function TestFlightCard({ t, store, appId, builds, onSent }: { t: Translate; store: Store; appId: string; builds: BuildInfo[]; onSent: () => void }): VNode {
      const groupsQuery = useQuery(store, 'testflight.groups', appId ? { appId } : undefined, !!appId)
      const groups = normalizeGroups(groupsQuery[0].data)
      const [buildId, setBuildId] = React.useState('')
      const [selected, setSelected] = React.useState<string[]>([])
      const [whatsNew, setWhatsNew] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState<HubError | null>(null)
      const [sent, setSent] = React.useState<string | null>(null)

      // The newest build is the default, and a choice that no longer exists is dropped.
      React.useEffect(() => {
        if (buildId !== '' && builds.some(build => build.id === buildId)) return
        setBuildId(builds.length > 0 ? builds[0].id : '')
      }, [builds, buildId])
      React.useEffect(() => { setSent(null) }, [appId, buildId])

      const build = builds.find(candidate => candidate.id === buildId) || null

      const toggle = (id: string): void => {
        setSelected(current => current.indexOf(id) === -1 ? current.concat([id]) : current.filter(item => item !== id))
      }

      // `Distribute` is the confirmation: the build from the menu, the groups here and
      // the one button is the human's decision, so the payload sets the flag itself.
      const distribute = async () => {
        if (!appId || !build) return
        setBusy(true)
        setError(null)
        setSent(null)
        const input = { appId, buildId: build.id, groupIds: selected, confirm: true } as DistributeInput
        if (whatsNew) input.whatsNew = whatsNew
        const result = await store.perform('testflight.distribute', input)
        setBusy(false)
        if (!result.ok) { setError(result.error); return }
        const names = selected.map(id => {
          const group = groups.find(item => item.id === id)
          return group && group.name ? String(group.name) : String(id)
        })
        setSent(t('tfSent', { build: buildLabel(build), groups: names.join(', ') }))
        if (typeof onSent === 'function') onSent()
      }

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('testflightTitle'))),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        groupsQuery[0].error ? h(ErrorNote, { t, error: groupsQuery[0].error }) : null,
        // One grid for both rows, so the first group checkbox lines up with the build
        // menu above it instead of starting wherever its own label happens to end.
        appId
          ? h('div', { className: 'asc-hub-form' },
            h('span', { className: 'asc-hub-inline-label' }, t('tfBuildLabel')),
            h('select', {
              className: 'asc-hub-select',
              value: buildId,
              'aria-label': t('tfBuildLabel'),
              disabled: builds.length === 0,
              onChange: event => setBuildId(event.target.value),
            },
              builds.length === 0 ? h('option', { value: '' }, t('tfNoBuild')) : null,
              builds.map(candidate => h('option', { key: candidate.id, value: candidate.id }, buildLabel(candidate)))),
            h('span', { className: 'asc-hub-inline-label' }, t('groupsTitle')),
            groups.length > 0
              ? h('div', { className: 'asc-hub-groups' },
                groups.map(group => h('label', { key: group.id, className: 'asc-hub-check' },
                  h('input', { type: 'checkbox', checked: selected.indexOf(group.id) !== -1, onChange: () => toggle(group.id) }),
                  h('span', { className: 'asc-hub-check-name' }, String(group.name || group.id)),
                  typeof group.testerCount === 'number'
                    ? h('span', { className: 'asc-hub-mono' }, String(group.testerCount)) : null)))
              : h('span', { className: 'asc-hub-hint' }, groupsQuery[0].loading ? t('loading') : t('noGroups')))
          : null,
        build ? h('label', { className: 'asc-hub-field' },
          h('span', null, t('whatsNew')),
          h('textarea', {
            className: 'asc-hub-textarea',
            value: whatsNew,
            placeholder: t('whatsNewHint'),
            onChange: event => setWhatsNew(event.target.value),
          })) : null,
        build ? h(ActionRow, { className: 'asc-hub-actions-fill' },
          h('button', {
            type: 'button',
            className: 'asc-hub-btn asc-hub-btn-primary',
            disabled: busy || selected.length === 0,
            'aria-busy': busy ? 'true' : undefined,
            onClick: () => { void distribute() },
          }, busy ? t('distributing') : t('distribute'))) : null,
        sent ? h('p', { className: 'asc-hub-hint' }, sent) : null,
        h(ErrorNote, { t, error }))
    }

    /* Step 3: the App Review half. Pick a build; a build that already went through
     * review says so, and a build that has not is the one you can submit. */
    function ReviewCard({ t, store, appId, builds }: { t: Translate; store: Store; appId: string; builds: BuildInfo[] }): VNode {
      const [buildId, setBuildId] = React.useState('')
      const [confirm, setConfirm] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState<HubError | null>(null)

      React.useEffect(() => {
        if (buildId !== '' && builds.some(build => build.id === buildId)) return
        setBuildId(builds.length > 0 ? builds[0].id : '')
      }, [builds, buildId])
      React.useEffect(() => { setConfirm(false); setError(null) }, [appId, buildId])

      const build = builds.find(candidate => candidate.id === buildId) || null
      const version = build ? build.version : ''
      const readiness = useQuery(store, 'release.readiness', appId ? (version ? { appId, version } : { appId }) : undefined, !!appId)
      const release = useQuery(store, 'release.status', appId ? { appId } : undefined, !!appId)
      // Which version carries which build, and in what state: the only honest answer to
      // "has this build been reviewed?" — review applies to a version, not a build.
      const versions = useQuery(store, 'release.versions', appId ? { appId } : undefined, !!appId)
      const readinessData = readiness[0].data && typeof readiness[0].data === 'object' ? readiness[0].data : null
      const releaseData = release[0].data && typeof release[0].data === 'object' ? release[0].data : null
      const blockers: BlockerInfo[] = readinessData && Array.isArray(readinessData.blockers) ? readinessData.blockers as BlockerInfo[] : []
      const warnings = readinessData && typeof readinessData.warnings === 'number' ? readinessData.warnings : 0
      const reviewState = releaseData && releaseData.reviewState ? String(releaseData.reviewState) : ''
      const versionState = releaseData && releaseData.versionState ? String(releaseData.versionState) : ''
      const ready = !!(readinessData && readinessData.ready === true)

      // A build has been reviewed when the version that carries it got past App Review.
      // A build no version carries never went to review at all (TestFlight-only builds
      // are exactly that), which the old version-number guess got wrong.
      const versionsData: VersionEntry[] | null = versions[0].data && Array.isArray(versions[0].data.versions) ? versions[0].data.versions as VersionEntry[] : null
      const carriedBy = build ? versionsData && versionsData.find(entry => entry.buildId === build.id) : null
      // A version that shipped locks its number: no build can be submitted under it again,
      // and the menu says so instead of letting the readiness check explain it the long way.
      const versionShipped = (entry: VersionEntry): boolean => Boolean(entry) && /READY_FOR_DISTRIBUTION|PENDING_APPLE_RELEASE|PENDING_DEVELOPER_RELEASE|PROCESSING_FOR_DISTRIBUTION|READY_FOR_SALE/.test(
        entry.state ? String(entry.state) : '',
      )
      const shippedVersion = version !== '' && versionsData !== null
        ? versionsData.find(entry => entry.version === version && versionShipped(entry)) || null
        : null
      const blockedByShippedVersion = shippedVersion !== null
      const menuLabel = (candidate: BuildInfo | null): string => {
        if (!candidate) return ''
        const entry = versionsData ? versionsData.find(item => item.buildId === candidate.id) : null
        if (entry && versionShipped(entry)) return buildLabel(candidate) + ' · ' + t('buildReleased')
        if (entry) return buildLabel(candidate) + ' · ' + t('buildInReview')
        if (versionsData && versionsData.some(item => item.version === candidate.version && versionShipped(item))) {
          return buildLabel(candidate) + ' · ' + t('buildReleased')
        }
        return buildLabel(candidate) + ' · ' + t('buildNotSubmitted')
      }
      const pastReview = /READY_FOR_DISTRIBUTION|PENDING_APPLE_RELEASE|PENDING_DEVELOPER_RELEASE|PROCESSING_FOR_DISTRIBUTION|READY_FOR_SALE/.test(
        carriedBy && carriedBy.state ? String(carriedBy.state) : '',
      )
      // If the versions read failed, fall back to the version-number guess rather than
      // offering a submit that would only fail.
      const approved = /COMPLETE|APPROVED/i.test(reviewState)
        || /READY_FOR_DISTRIBUTION|PENDING_APPLE_RELEASE|PENDING_DEVELOPER_RELEASE|PROCESSING_FOR_DISTRIBUTION/.test(versionState)
      const order = compareVersions(version, releaseData && releaseData.version ? String(releaseData.version) : '')
      const reviewed = build === null ? false
        : versionsData === null
          ? (order !== null && (order < 0 || (order === 0 && approved)))
          : pastReview

      const submit = async () => {
        if (!appId || !build) return
        setBusy(true)
        setError(null)
        const input = { appId, buildId: build.id, confirm: true } as SubmitInput
        if (version) input.version = version
        const result = await store.perform('release.submit', input)
        setBusy(false)
        if (!result.ok) { setError(result.error); return }
        setConfirm(false)
        // The state and the blockers both changed; re-read the whole console.
        void store.refreshAll()
      }

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('reviewTitle')),
          reviewState
            ? h('span', {
              className: 'asc-hub-chip',
              'data-state': /APPROVED|COMPLETE|READY/i.test(reviewState) ? 'ok' : (/REJECT|INVALID/i.test(reviewState) ? 'error' : 'wait'),
            }, reviewState)
            : null),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        appId
          ? h(BuildMenu, { t, label: t('reviewBuild'), builds, buildId, onChange: setBuildId, optionLabel: menuLabel })
          : null,
        // Its version already shipped: there is no path to submit, and saying so is
        // better than a disabled button under a wall of blockers about the old version.
        !reviewed && blockedByShippedVersion
          ? h('div', { className: 'asc-hub-inline' },
            h('span', { className: 'asc-hub-chip', 'data-state': 'wait' }, t('versionShippedTag')),
            h('span', { className: 'asc-hub-hint' }, t('versionShippedHint', { version })))
          : null,
        // A build that already passed review has nothing to submit; say so instead of
        // showing a button that could only fail.
        reviewed
          ? h('div', { className: 'asc-hub-inline' },
            h('span', { className: 'asc-hub-chip', 'data-state': 'ok' }, t('reviewedTag')),
            h('span', { className: 'asc-hub-hint' }, t('reviewedHint', {
              version: carriedBy && carriedBy.version ? String(carriedBy.version) : t('unknown'),
              state: carriedBy && carriedBy.state ? String(carriedBy.state) : t('unknown'),
            })))
          : null,
        !reviewed && !blockedByShippedVersion && readiness[0].error ? h(ErrorNote, { t, error: readiness[0].error }) : null,
        !reviewed && !blockedByShippedVersion && release[0].error ? h(ErrorNote, { t, error: release[0].error }) : null,
        !reviewed && !blockedByShippedVersion && appId && readiness[0].loading ? h('p', { className: 'asc-hub-hint' }, t('checkingReadiness')) : null,
        !reviewed && !blockedByShippedVersion && readinessData ? h('dl', { className: 'asc-hub-summary' },
          SummaryRow({ label: t('readiness'), value: ready ? t('readyYes') : t('readyNo') }),
          version ? SummaryRow({ label: t('versionLabel'), value: version }) : null) : null,
        // The date is the current store version's submission; showing it while another
        // version's build is selected would attribute it to the wrong version.
        !reviewed && !blockedByShippedVersion && releaseData && releaseData.submittedDate
          && String(releaseData.version || '') === version
          ? h('p', { className: 'asc-hub-hint' }, t('submittedOn', { date: formatDate(releaseData.submittedDate) })) : null,
        !reviewed && !blockedByShippedVersion && blockers.length > 0 ? h('div', null,
          h('p', { className: 'asc-hub-hint' }, t('blockersTitle')),
          h('ul', { className: 'asc-hub-rows' },
            blockers.map((blocker, index) => h('li', { key: String((blocker && blocker.code) || index), className: 'asc-hub-row' },
              h('span', { className: 'asc-hub-row-main' },
                h('span', null, String((blocker && blocker.message) || '')),
                // The remediation is the useful half of a blocker; it is not optional.
                blocker && blocker.detail ? h('span', { className: 'asc-hub-hint' }, String(blocker.detail)) : null),
              h('span', { className: 'asc-hub-chip', 'data-state': 'error' }, String((blocker && blocker.code) || '')))))) : null,
        !reviewed && !blockedByShippedVersion && readinessData && blockers.length === 0 ? h('p', { className: 'asc-hub-hint' }, t('noBlockers')) : null,
        !reviewed && !blockedByShippedVersion && warnings > 0 ? h('p', { className: 'asc-hub-hint' }, t('readinessWarnings', { count: warnings })) : null,
        // The confirmation only appears when there is something to confirm.
        !reviewed && !blockedByShippedVersion && ready ? h('label', { className: 'asc-hub-check' },
          h('input', { type: 'checkbox', checked: confirm, onChange: event => setConfirm(event.target.checked) }),
          h('span', null, t('confirmSubmit'))) : null,
        !reviewed && !blockedByShippedVersion && appId ? h(ActionRow, { className: 'asc-hub-actions-fill' },
          h('button', {
            type: 'button',
            className: 'asc-hub-btn asc-hub-btn-primary',
            disabled: busy || !confirm || !ready || !build,
            'aria-busy': busy ? 'true' : undefined,
            onClick: () => { void submit() },
          }, busy ? t('submittingReview') : t('submitReview'))) : null,
        h(ErrorNote, { t, error }))
    }

    /* Step 4: what happens once review passes — an approved version waits for the
     * developer to release it, and that is a separate, deliberate click. */
    function ReleaseCard({ t, store, appId, build }: { t: Translate; store: Store; appId: string; build: BuildInfo | null }): VNode {
      const release = useQuery(store, 'release.status', appId ? { appId } : undefined, !!appId)
      const data = release[0].data && typeof release[0].data === 'object' ? release[0].data : null
      const version = data && data.version ? String(data.version) : ''
      const versionId = data && data.versionId ? String(data.versionId) : ''
      const versionState = data && data.versionState ? String(data.versionState) : ''
      const [confirm, setConfirm] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState<HubError | null>(null)
      const [done, setDone] = React.useState(false)
      // Only this state is waiting for a human: Apple-scheduled releases move on their own.
      const pending = versionState === 'PENDING_DEVELOPER_RELEASE'

      React.useEffect(() => { setConfirm(false); setError(null); setDone(false) }, [appId])

      const publish = async () => {
        if (!appId || versionId === '') return
        setBusy(true)
        setError(null)
        const result = await store.perform('release.publish', { appId, versionId, confirm: true })
        setBusy(false)
        if (!result.ok) { setError(result.error); return }
        setDone(true)
        setConfirm(false)
        void store.refreshAll()
      }

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('releaseSectionTitle')),
          versionState
            ? h('span', {
              className: 'asc-hub-chip',
              'data-state': /READY_FOR_DISTRIBUTION|PENDING_APPLE_RELEASE|PROCESSING_FOR_DISTRIBUTION/.test(versionState)
                ? 'ok'
                : (pending ? 'wait' : undefined),
            }, versionState)
            : null),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        release[0].error ? h(ErrorNote, { t, error: release[0].error }) : null,
        data ? h('dl', { className: 'asc-hub-summary' },
          version ? SummaryRow({ label: t('versionLabel'), value: version }) : null,
          SummaryRow({ label: t('attachedBuild'), value: build ? buildLabel(build) : t('unknown') })) : null,
        pending ? h('p', { className: 'asc-hub-hint' }, t('pendingDeveloperRelease')) : null,
        versionState !== '' && !pending && !done ? h('p', { className: 'asc-hub-hint' }, t('releaseNotReady')) : null,
        pending
          ? h('label', { className: 'asc-hub-check' },
            h('input', { type: 'checkbox', checked: confirm, onChange: event => setConfirm(event.target.checked) }),
            h('span', null, t('confirmRelease')))
          : null,
        pending ? h(ActionRow, { className: 'asc-hub-actions-fill' },
          h('button', {
            type: 'button',
            className: 'asc-hub-btn asc-hub-btn-primary',
            disabled: busy || !confirm || versionId === '',
            'aria-busy': busy ? 'true' : undefined,
            onClick: () => { void publish() },
          }, busy ? t('releasing') : t('releaseAction'))) : null,
        done ? h('p', { className: 'asc-hub-hint' }, t('releasedNote')) : null,
        h(ErrorNote, { t, error }))
    }

    /** How many builds the list shows at a time; "load more" adds the same amount. */
    const BUILD_PAGE = 3
    /** How many recent builds the console asks for, so the release build is findable. */
    const PICK_LIMIT = 12

    function Console({ t, store, skills, busy, sessionId }: { t: Translate; store: Store; skills: SkillsInfo | null; busy: string; sessionId?: string }): VNode {
      const [appId, setAppId] = React.useState(() => readStored(APP_KEY))
      const appsQuery = useQuery(store, 'apps.list', {}, true)
      const buildsQuery = useQuery(store, 'builds.list', appId ? { appId, limit: PICK_LIMIT } : undefined, !!appId)
      const releaseQuery = useQuery(store, 'release.status', appId ? { appId } : undefined, !!appId)
      const apps = normalizeApps(appsQuery[0].data)
      // Only processed builds are listed: everything in this list is ready to send.
      const recent = appId ? distributableBuilds(normalizeBuilds(buildsQuery[0].data)) : []

      // The release build is the one attached to the App Store version, not the newest.
      const releaseInfo = releaseQuery[0].data && typeof releaseQuery[0].data === 'object' ? releaseQuery[0].data : null
      const releaseVersion = releaseInfo && releaseInfo.version ? String(releaseInfo.version) : ''
      const releaseNumber = releaseInfo && releaseInfo.buildNumber ? String(releaseInfo.buildNumber) : ''
      // `release.status` always knows the version; the build number is only there when
      // App Store Connect reports it, so match on the version and take the newest.
      const release = releaseVersion !== ''
        ? recent.find(build => build.version === releaseVersion
          && (releaseNumber === '' || build.buildNumber === releaseNumber)) || null
        : null
      const chooseApp = (next: string): void => {
        setAppId(next)
        writeStored(APP_KEY, next)
      }

      // The console is the shipping flow in order: where the code is, build it, pick
      // the build, send it to TestFlight, submit it for review, release it. SalesCard
      // and AnalyticsCard are parked, not deleted: their Host actions are untouched, so
      // restoring one is a single line here.
      return h('div', { className: 'asc-hub-console' },
        h(AppPicker, { t, query: appsQuery[0], apps, appId, onChange: chooseApp }),
        h(WorkspaceCard, { t, store, sessionId }),
        h(BuildCard, { t, store, appId, sessionId, builds: recent, onBuilt: () => { void store.refreshAll() } }),
        h(BuildsCard, { t, appId, query: buildsQuery[0], builds: recent, release }),
        h(TestFlightCard, { t, store, appId, builds: recent, onSent: () => { void store.refreshAll() } }),
        h(ReviewCard, { t, store, appId, builds: recent }),
        h(ReleaseCard, { t, store, appId, build: release }),
        h(SkillsRow, { t, store, skills, busy }))
    }

    /* ------------------------------------------------------------------ *
     * Panel body
     * ------------------------------------------------------------------ */

    function PanelBody(props: { t: Translate; store: Store; locale: LocaleService; useTabInfo: () => TabInfo; sessionId?: string }): VNode {
      const { t, store, locale, useTabInfo } = props
      useLocaleTick(locale)
      const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot)
      const info = useTabInfo()
      const tab = info && info.tab ? info.tab : null
      const actions = tab && tab.actions ? tab.actions : null
      const [view, setView] = React.useState('auto')
      const [onboarded, setOnboarded] = React.useState(readOnboarded)

      React.useEffect(() => {
        if (!actions || typeof actions.bindCommands !== 'function') return undefined
        return actions.bindCommands({ refresh: () => { void store.refresh() } })
      }, [actions, store])

      const close = React.useCallback(() => {
        if (actions && typeof actions.close === 'function') actions.close()
      }, [actions])

      const status = state.status && typeof state.status === 'object' ? state.status : null
      const phase = status && typeof status.phase === 'string' ? status.phase : ''
      const engine = status && status.engine ? status.engine : null
      const auth = status && status.auth ? status.auth : null
      const engineReady = !!(engine && engine.installed)
      const authReady = !!(auth && auth.configured)
      const hub = status && status.hub && typeof status.hub === 'object' ? status.hub : null
      const update = status && status.update && typeof status.update === 'object' ? status.update : null
      // Changing the mode changes this session, not the stored configuration: the
      // Host keeps the override in memory and the row still decides the next start.
      const toggleMode = async () => {
        const next = mode === 'write' ? 'read-only' : 'write'
        await store.perform('mode.set', { mode: next })
        await store.refresh()
      }
      const applyUpdate = async () => {
        // The Host decides what an update means for the half that is stale: the core
        // re-runs the same installer onboarding uses, the hub half reports back that
        // the Plugin Manager owns installation.
        if (!update || update.available !== true) return
        await store.perform('update.apply', { scope: update.scope })
        await store.refresh()
      }
      const mode = status
        ? (typeof status.mode === 'string' ? status.mode : (status.config && typeof status.config.mode === 'string' ? status.config.mode : ''))
        : ''
      const modeLabel = mode === 'write' ? t('modeWrite') : mode === 'read-only' ? t('modeReadOnly') : t('modeUnknown')
      const onboarding = view === 'onboarding'
        || (view === 'auto' && (!status || !onboarded || phase === 'start' || phase === 'engine' || phase === 'login'))
      const keepOnboarding = () => setView('onboarding')
      const onConsole = () => {
        markOnboarded()
        setOnboarded(true)
        setView('console')
      }
      // Announced, never drawn: a banner at the top would compete with the step
      // that is actually doing the work.
      const live = state.busyAction ? t('working') : ''

      // Built before the branch, so nothing it reads may assume a status arrived: the
      // very first paint happens with `status === null`, and a null dereference here
      // takes the whole slot entry down (a white panel).
      const consoleBody = h(Console, {
        t,
        store,
        skills: status && status.skills ? status.skills : null,
        busy: state.busyAction,
        sessionId: props.sessionId,
      })
      // A dead transport is one fact about the page, not an operation failure: it owns a
      // single banner above whatever can still render. Any other failure stays the
      // operation's own error note.
      const body = state.hostDown
        ? (status ? consoleBody : null)
        : !status && state.statusError
          ? h('section', { className: 'asc-hub-card' }, h(ErrorNote, { t, error: state.statusError }))
          : onboarding
            ? h(Onboarding, { t, store, engine, auth, engineReady, authReady, onConsole, keepOnboarding })
            : consoleBody

      return h('div', { 'data-asc-hub': '', className: 'asc-hub-root' },
        h('style', null, STYLES),
        h('div', { className: 'asc-hub-panel', 'aria-busy': state.busyAction ? 'true' : undefined },
          h('div', { className: 'asc-hub-scroll' },
          h('header', { className: 'asc-hub-head' },
            h('div', { className: 'asc-hub-head-main' },
              h('h2', { className: 'asc-hub-title' }, t('title'))),
            h('div', { className: 'asc-hub-head-actions' },
              h('button', {
                type: 'button',
                className: 'asc-hub-icon-btn',
                'aria-label': t('refresh'),
                title: t('refresh'),
                disabled: state.busyAction !== '',
                onClick: () => { void store.refreshAll() },
              }, '↻'),
              h('button', {
                type: 'button',
                className: 'asc-hub-icon-btn',
                'aria-label': t('close'),
                title: t('close'),
                onClick: close,
              }, '×'))),
          h('p', { className: 'asc-hub-sr', role: 'status', 'aria-live': 'polite' }, live),
          state.hostDown ? h(Recovery, { t }) : null,
          state.actionError ? h(ErrorNote, { t, error: state.actionError }) : null,
          body,
          h(LogArea, { t, log: state.log })),
          h('footer', { className: 'asc-hub-foot' },
            h('div', { className: 'asc-hub-foot-meta' },
              // One line: the hub version — a tag with an up arrow once an update is
              // known — the author, then the engine behind it.
              h('span', { className: 'asc-hub-version-line' },
                // Three parts, each separated by a dot: the hub, the author, the engine.
                h('span', { className: 'asc-hub-foot-part' },
                  t('versionPrefix'),
                  h('span', { className: 'asc-hub-version-slot' },
                    update && update.available === true
                      ? h('button', {
                        type: 'button',
                        className: 'asc-hub-update-tag',
                        'aria-label': t('updateTitle'),
                        title: t('updateTitle'),
                        disabled: state.busyAction !== '',
                        onClick: () => { void applyUpdate() },
                      }, state.busyAction === 'engine.install'
                        ? t('updateRunning')
                        : (hub && hub.version ? t('hubVersion', { version: hub.version }) : t('hubVersionUnknown')) + ' ↑')
                      : h('span', null, hub && hub.version ? t('hubVersion', { version: hub.version }) : t('hubVersionUnknown')))),
                h('span', { className: 'asc-hub-foot-dot', 'aria-hidden': 'true' }, '·'),
                h('a', {
                  className: 'asc-hub-foot-link',
                  href: AUTHOR_URL,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                }, '©' + AUTHOR),
                h('span', { className: 'asc-hub-foot-dot', 'aria-hidden': 'true' }, '·'),
                h('span', { className: 'asc-hub-foot-part' },
                  t('engineLabel'),
                  h('a', {
                    className: 'asc-hub-foot-link',
                    href: ASC_REPO_URL,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                  }, engine && engine.version ? 'asc ' + engine.version : t('versionUnknown')))),
            h('div', { className: 'asc-hub-foot-actions' },
              // The setup steps stay reachable from the console: signing in again, or
              // reading what the onboarding asks for, should not need a reload.
              onboarding
                ? null
                : h('button', {
                  type: 'button',
                  className: 'asc-hub-link asc-hub-link-quiet',
                  title: t('setupHint'),
                  onClick: keepOnboarding,
                }, t('setupLink')),
              h('button', {
                type: 'button',
                className: 'asc-hub-mode-btn',
                'data-mode': mode === 'write' ? 'write' : 'read-only',
                'aria-label': mode === 'write' ? t('modeToReadOnly') : t('modeToWrite'),
                title: mode === 'write' ? t('modeToReadOnly') : t('modeToWrite'),
                disabled: state.busyAction !== '',
                onClick: () => { void toggleMode() },
              }, modeLabel))))))
    }

    /* ------------------------------------------------------------------ *
     * Plugin body
     * ------------------------------------------------------------------ */

    function apply(ctx: ClientContext): void {
      const store = createStore(ctx)
      const t = ctx.locale.bind(NS)

      const openPanel = () => {
        try { ctx.sidebarRight.openTab(KIND) } catch (error) { /* no on-screen session yet */ }
        try {
          if (typeof ctx.sidebarRight.isExpanded === 'function' && !ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded()
        } catch (error) { /* the column may not be mounted */ }
      }

      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'asc-hub.locale')

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: KIND,
        title: () => t('tabTitle'),
        keepMounted: true,
        guide: [{
          id: 'open',
          order: 50,
          title: () => t('tabTitle'),
          description: () => t('tabDescription'),
        }],
      }), 'asc-hub.tab')

      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TAB_ID,
        locale: NS,
        inject: () => ({ store, locale: ctx.locale, open: openPanel }),
      }, PanelBody), 'asc-hub.body')

      ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: TAB_ID,
        locale: NS,
      }, TabTitle), 'asc-hub.title')

      // Utilities render in ascending order from the left. The shipped "Open in…"
      // control sits at -10, so a negative order keeps the status pill to its left
      // instead of at the far right edge of the header.
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'asc-hub-status',
        order: -20,
        locale: NS,
        inject: () => ({ store, locale: ctx.locale, open: openPanel }),
      }, StatusButton), 'asc-hub.status')

      ctx.effect(() => {
        const generation = ctx.connection && ctx.connection.generation
        if (!generation || typeof generation.subscribe !== 'function') return () => {}
        return generation.subscribe(() => { void store.refresh() })
      }, 'asc-hub.reconnect')
    }

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs', 'connection', 'locale'],
      apply,
    }
  },
})
