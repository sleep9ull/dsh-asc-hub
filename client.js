window.__ModuleLoader__.load({
  id: 'dsh-asc-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /* ------------------------------------------------------------------ *
     * Constants
     * ------------------------------------------------------------------ */

    const NS = 'asc-hub'
    const KIND = 'asc-hub'
    const TAB_ID = 'dsh-asc-hub'
    const APP_KEY = 'dsh.asc-hub.v1.app'
    const VENDOR_KEY = 'dsh.asc-hub.v1.vendor'
    const APPLE_KEYS_URL = 'https://appstoreconnect.apple.com/access/integrations/api'
    const LABELS = new Set(['start', 'engine', 'login', 'ready', 'build', 'review', 'error'])

    /* ------------------------------------------------------------------ *
     * Locale dictionaries (both baseline locales are required)
     * ------------------------------------------------------------------ */

    // One bilingual table keeps both baseline locales in lockstep: one line per
    // key, English first. The locale service still receives two dictionaries.
    const TEXT = {
      'tabTitle': ['ASC Hub', 'ASC 控制台'],
      'tabDescription': ['Install the asc engine, sign in with an API key, and ship builds, releases and sales.', '安装 asc 引擎、用 API 密钥登录，并发布构建、版本与销售数据。'],
      'title': ['App Store Connect', 'App Store Connect'],
      'statusAria': ['ASC Hub status: {label}. Open the ASC Hub console.', 'ASC 控制台状态：{label}。打开 ASC 控制台面板。'],
      'refresh': ['Refresh', '刷新'],
      'close': ['Close', '关闭'],
      'working': ['Working…', '处理中…'],
      'loading': ['Loading…', '加载中…'],
      'unknown': ['unknown', '未知'],
      'none': ['none', '无'],
      'recheck': ['Recheck', '重新检查'],
      'errorUnknown': ['Something went wrong. Check the log and retry.', '出错了，请查看日志后重试。'],
      'versionLine': ['asc {version}', 'asc {version}'],
      'versionUnknown': ['asc version unknown', 'asc 版本未知'],
      'modeReadOnly': ['read-only', '只读'],
      'modePublish': ['publish', '可发布'],
      'modeUnknown': ['mode unknown', '模式未知'],
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
      'onboardingIntro': ['Install the engine, then sign in with an App Store Connect API key.', '先安装引擎，再用 App Store Connect API 密钥登录。'],
      'stepEngine': ['Install the asc engine', '安装 asc 引擎'],
      'stepLogin': ['Sign in to App Store Connect', '登录 App Store Connect'],
      'stepReady': ['Ready', '就绪'],
      'engineDetected': ['asc {version} at {path}', '在 {path} 检测到 asc {version}'],
      'engineMissing': ['asc was not found on this Mac.', '本机未找到 asc。'],
      'installMethodNote': ['Uses Homebrew when it is installed; otherwise it downloads the official asc build with curl.', '本机有 Homebrew 时用它安装；没有时用 curl 下载官方 asc 构建。'],
      'installAsc': ['Install asc', '安装 asc'],
      'installing': ['Installing…', '安装中…'],
      'installLogTitle': ['Install log', '安装日志'],
      'installWithCurl': ['Install with curl', '用 curl 安装'],
      'loginIntro1': ['The plugin never asks for an Apple ID password.', '本插件绝不会索要 Apple ID 密码。'],
      'loginIntro2': ['asc authenticates with an App Store Connect API key (.p8) and stores it in the macOS Keychain.', 'asc 使用 App Store Connect API 密钥（.p8）认证，并存放在 macOS 钥匙串中。'],
      'loginIntro3': ['Only the key file path is passed to asc, and the key never leaves this Mac.', '插件只把密钥文件的路径交给 asc，密钥本身不会离开这台 Mac。'],
      'openAppleKeys': ['Open App Store Connect API keys', '打开 App Store Connect API 密钥页面'],
      'appleKeysNote': ['Create a key there, then download AuthKey_XXXXXXXXXX.p8 once.', '在该页面创建密钥，然后下载一次 AuthKey_XXXXXXXXXX.p8。'],
      'keyId': ['Key ID', 'Key ID'],
      'issuerId': ['Issuer ID', 'Issuer ID'],
      'keyPath': ['Private key path (.p8, absolute)', '私钥路径（.p8，绝对路径）'],
      'profileNameOptional': ['Profile name (optional)', '配置名称（可选）'],
      'profileNameHint': ['Required when asc already has profiles.', 'asc 已有配置时必须填写。'],
      'keyPathHint': ['/Users/you/Downloads/AuthKey_XXXXXXXXXX.p8', '/Users/you/Downloads/AuthKey_XXXXXXXXXX.p8'],
      'dropZone': ['Drop AuthKey_*.p8 here, or choose a file', '把 AuthKey_*.p8 拖到这里，或选择文件'],
      'dropAria': ['Private key file drop zone', '私钥文件拖放区域'],
      'chooseKeyFile': ['Choose a .p8 key file', '选择 .p8 密钥文件'],
      'dropNote': ['The file is read in this browser and sent only to the local Host on this Mac.', '文件只在这个浏览器里读取，并只发送给本机的 Host。'],
      'keyFileWrong': ['Drop the AuthKey_*.p8 file downloaded from App Store Connect.', '请拖入从 App Store Connect 下载的 AuthKey_*.p8 文件。'],
      'keyFileLoaded': ['Key file read: {name}', '已读取密钥文件：{name}'],
      'importKey': ['Import key', '导入密钥'],
      'importingKey': ['Importing…', '导入中…'],
      'needKeyFields': ['Fill in the Key ID and Issuer ID to import the key.', '请先填写 Key ID 和 Issuer ID，再导入密钥。'],
      'importDone': ['The key was imported into the Keychain.', '密钥已导入钥匙串。'],
      'verifySignIn': ['Verify and sign in', '验证并登录'],
      'verifying': ['Verifying…', '验证中…'],
      'loginFieldsNeeded': ['Fill in all three fields, or import a .p8 file.', '请填写三项信息，或导入 .p8 文件。'],
      'signedIn': ['Signed in.', '已登录。'],
      'loginPending': ['Waiting for the engine.', '等待引擎安装完成。'],
      'readyPending': ['Complete the steps above.', '请先完成上面的步骤。'],
      'profileLabel': ['Profile', '配置'],
      'storageLabel': ['Key storage', '密钥存储'],
      'engineLabel': ['Engine', '引擎'],
      'readySummary': ['The engine and the account are ready.', '引擎和账号都已就绪。'],
      'openConsole': ['Open console', '打开控制台'],
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
      'appTitle': ['App', '应用'],
      'appChoose': ['App and bundle id', '应用与 Bundle ID'],
      'appNone': ['Select an app', '请选择应用'],
      'appHint': ['Choose an app to enable the build, TestFlight and review cards.', '选择应用后才能使用构建、TestFlight 与发布卡片。'],
      'noApps': ['No apps were returned for this account.', '该账号没有返回任何应用。'],
      'appRequired': ['Choose an app above to use this card.', '请先在上方选择应用。'],
      'buildsTitle': ['Builds', '构建'],
      'noBuilds': ['No builds yet.', '暂无构建。'],
      'uploadTitle': ['Upload an IPA', '上传 IPA'],
      'ipaPath': ['IPA path', 'IPA 路径'],
      'ipaPathHint': ['/path/to/App.ipa', '/path/to/App.ipa'],
      'versionOptional': ['Version (optional)', '版本号（可选）'],
      'buildNumberOptional': ['Build number (optional)', '构建号（可选）'],
      'waitForProcessing': ['Wait until processing finishes', '等待处理完成'],
      'uploadIpa': ['Upload IPA', '上传 IPA'],
      'uploading': ['Uploading…', '上传中…'],
      'confirmUpload': ['I understand this uploads the IPA to App Store Connect.', '我了解这会把 IPA 上传到 App Store Connect。'],
      'uploadDone': ['Upload finished.', '上传完成。'],
      'testflightTitle': ['TestFlight', 'TestFlight'],
      'groupsTitle': ['Groups', '分组'],
      'noGroups': ['No TestFlight groups were returned.', '没有返回 TestFlight 分组。'],
      'internalGroup': ['Internal', '内部'],
      'externalGroup': ['External', '外部'],
      'whatsNew': ['What to test', '测试说明'],
      'whatsNewHint': ['Notes shown to testers for this build.', '测试人员在此构建上看到的说明。'],
      'latestBuild': ['Build {version} ({build})', '构建 {version}（{build}）'],
      'noValidBuild': ['No processed (VALID) build is available yet.', '目前没有已处理（VALID）的构建。'],
      'distribute': ['Distribute build', '分发构建'],
      'distributing': ['Distributing…', '分发中…'],
      'confirmDistribute': ['I confirm this build and these groups.', '我确认该构建与所选分组。'],
      'betaReview': ['Submit for beta review', '提交 Beta 审核'],
      'submittingBeta': ['Submitting…', '提交中…'],
      'confirmBeta': ['I confirm this build should go to beta review.', '我确认该构建应提交 Beta 审核。'],
      'reviewTitle': ['Release', '发布'],
      'readiness': ['Readiness', '发布准备'],
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
    const en = {}
    const zh = {}
    for (const [key, pair] of Object.entries(TEXT)) { en[key] = pair[0]; zh[key] = pair[1] }

    /* ------------------------------------------------------------------ *
     * Styles: theme tokens only. Rendered inside each component tree.
     * ------------------------------------------------------------------ */

    const STYLES = `
[data-asc-hub] { color: var(--dsw-alias-label-primary); font: inherit; }
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
[data-asc-hub] .asc-hub-panel { display: flex; flex-direction: column; gap: 12px; width: 100%; min-width: 0; height: 100%; padding: 12px; overflow: auto; background: var(--dsw-alias-bg-base); font-size: var(--dsw-font-s-font-size, 13px); line-height: 1.5; }
[data-asc-hub] .asc-hub-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-width: 0; }
[data-asc-hub] .asc-hub-head-main { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
[data-asc-hub] .asc-hub-title { font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-sub { color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-head-actions { display: flex; flex: none; gap: 4px; }
[data-asc-hub] .asc-hub-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm, 4px); background: transparent; font-size: 14px; line-height: 1; }
[data-asc-hub] .asc-hub-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
[data-asc-hub] .asc-hub-mode { padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 10px; }
[data-asc-hub] .asc-hub-live { color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-intro { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-steps { display: flex; flex-direction: column; gap: 14px; list-style: none; padding: 0; }
[data-asc-hub] .asc-hub-step { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 2px 8px; min-width: 0; }
[data-asc-hub] .asc-hub-step[data-state="pending"] { color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-step-number { display: grid; place-items: center; width: 20px; height: 20px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 50%; color: var(--dsw-alias-label-secondary); font-size: 10px; }
[data-asc-hub] .asc-hub-step[data-state="current"] .asc-hub-step-number { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
[data-asc-hub] .asc-hub-step[data-state="done"] .asc-hub-step-number { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
[data-asc-hub] .asc-hub-step-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; min-width: 0; }
[data-asc-hub] .asc-hub-step-title { font-size: 12px; font-weight: 600; line-height: 20px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-step-state { flex: none; color: var(--dsw-alias-label-secondary); font-size: 10px; }
[data-asc-hub] .asc-hub-step-body { grid-column: 2; display: flex; flex-direction: column; gap: 8px; min-width: 0; margin-top: 4px; }
[data-asc-hub] .asc-hub-step-summary { grid-column: 2; color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; margin-top: 2px; }
[data-asc-hub] .asc-hub-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg, 10px); background: var(--dsw-alias-bg-layer-1); }
[data-asc-hub] .asc-hub-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
[data-asc-hub] .asc-hub-card-title { font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-hint { color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-actions { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
[data-asc-hub] .asc-hub-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; max-width: 100%; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 6px); background: transparent; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
[data-asc-hub] .asc-hub-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }
[data-asc-hub] .asc-hub-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; }
[data-asc-hub] .asc-hub-field > span { overflow-wrap: anywhere; }
[data-asc-hub] fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
[data-asc-hub] .asc-hub-input, [data-asc-hub] .asc-hub-select, [data-asc-hub] .asc-hub-textarea { width: 100%; min-width: 0; max-width: 100%; padding: 5px 7px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm, 4px); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
[data-asc-hub] .asc-hub-textarea { resize: vertical; min-height: 56px; }
[data-asc-hub] .asc-hub-check { display: flex; align-items: flex-start; gap: 6px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-check input { flex: none; margin: 2px 0 0; accent-color: var(--dsw-alias-brand-primary); }
[data-asc-hub] .asc-hub-drop { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 12px 8px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 6px); background: transparent; text-align: center; font-size: 11px; color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-drop[data-dragging="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
[data-asc-hub] .asc-hub-file-input { display: none; }
[data-asc-hub] .asc-hub-rows { display: flex; flex-direction: column; gap: 4px; list-style: none; padding: 0; }
[data-asc-hub] .asc-hub-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; min-width: 0; padding: 4px 0; border-top: 1px solid var(--dsw-alias-border-l1); font-size: 11px; }
[data-asc-hub] .asc-hub-row:first-child { border-top: 0; }
[data-asc-hub] .asc-hub-row-main { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-row-main strong { font-size: 12px; }
[data-asc-hub] .asc-hub-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-chip { display: inline-flex; align-items: center; flex: none; max-width: 100%; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 10px; overflow-wrap: anywhere; }
[data-asc-hub] .asc-hub-chip[data-state="ok"] { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
[data-asc-hub] .asc-hub-chip[data-state="wait"] { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
[data-asc-hub] .asc-hub-chip[data-state="error"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
[data-asc-hub] .asc-hub-summary { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; font-size: 11px; }
[data-asc-hub] .asc-hub-summary dt { color: var(--dsw-alias-label-secondary); }
[data-asc-hub] .asc-hub-summary dd { overflow-wrap: anywhere; }
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

    async function callHost(ctx, action, input, signal) {
      const payload = input === undefined ? { action } : { action, input }
      try {
        const result = await ctx.connection.rpc.call('/api', 'asc-hub/' + action, payload, signal)
        if (!result || result.ok !== true) {
          const error = result && result.error && typeof result.error === 'object' ? result.error : {}
          const details = error.details && typeof error.details === 'object' ? error.details : {}
          return {
            ok: false,
            error: {
              code: typeof error.code === 'string' && error.code ? error.code : 'RPC_FAILED',
              message: typeof error.message === 'string' ? error.message : '',
              detail: typeof details.text === 'string' && details.text ? details.text : (typeof details.detail === 'string' ? details.detail : ''),
            },
          }
        }
        return { ok: true, value: result.value }
      } catch (error) {
        return { ok: false, error: { code: 'RPC_FAILED', message: error && error.message ? String(error.message) : '', detail: '' } }
      }
    }

    function unwrapEnvelope(value) {
      if (value && typeof value === 'object' && typeof value.ok === 'boolean' && Object.prototype.hasOwnProperty.call(value, 'action')) {
        if (value.ok === false) {
          const error = value.error && typeof value.error === 'object' ? value.error : {}
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
        return { ok: true, data: value.data }
      }
      return { ok: true, data: value }
    }

    function errorDetail(error) {
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
    const PHASE_LABEL = { start: 'start', engine: 'start', login: 'start', ready: 'ready', error: 'error' }

    function deriveLabel(status) {
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

    function createStore(ctx) {
      let state = {
        status: null,
        statusError: null,
        loading: true,
        label: 'start',
        busyAction: '',
        actionError: null,
        log: [],
      }
      let inflight = null
      let counter = 0
      const listeners = new Set()

      const emit = patch => {
        state = Object.assign({}, state, patch)
        for (const listener of Array.from(listeners)) listener()
      }
      const subscribe = listener => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      }
      const getSnapshot = () => state

      const pushLog = (action, text) => {
        if (typeof text !== 'string' || !text) return
        counter += 1
        emit({ log: [{ id: counter, action, text }, ...state.log].slice(0, 4) })
      }

      const probe = async (action, input, signal) => {
        const reply = await callHost(ctx, action, input, signal)
        return reply.ok ? unwrapEnvelope(reply.value) : reply
      }

      const refresh = () => {
        if (inflight) return inflight
        const run = (async () => {
          const result = await probe('status')
          if (result.ok) {
            const data = result.data && typeof result.data === 'object' ? result.data : null
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

      const perform = async (action, input) => {
        emit({ busyAction: action, actionError: null })
        const result = await probe(action, input)
        if (!result.ok) pushLog(action, errorDetail(result.error))
        else if (result.data && typeof result.data.log === 'string') pushLog(action, result.data.log)
        emit({ busyAction: '', actionError: result.ok ? null : result.error })
        await refresh()
        return result
      }

      return { subscribe, getSnapshot, refresh, probe, perform }
    }

    /* ------------------------------------------------------------------ *
     * Small helpers
     * ------------------------------------------------------------------ */

    function useLocaleTick(locale) {
      const subscribe = React.useCallback(listener => locale.subscribe(listener), [locale])
      const getSnapshot = React.useCallback(() => locale.getLocale(), [locale])
      React.useSyncExternalStore(subscribe, getSnapshot)
    }

    function errorText(t, code) {
      if (typeof code !== 'string' || !code) return t('errorUnknown')
      const key = 'error.' + code
      const text = t(key)
      return text === key ? t('errorUnknown') : text
    }

    function readStored(key) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return ''
        const value = window.localStorage.getItem(key)
        return typeof value === 'string' ? value : ''
      } catch (error) { return '' }
    }

    function writeStored(key, value) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return
        if (value) window.localStorage.setItem(key, value)
        else window.localStorage.removeItem(key)
      } catch (error) { /* storage may be unavailable; selection stays in memory */ }
    }

    function shortId(value) {
      if (typeof value !== 'string' || !value) return ''
      return value.length <= 4 ? value : '…' + value.slice(-4)
    }

    function formatDate(value) {
      return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : ''
    }

    function chipState(value) {
      const text = typeof value === 'string' ? value.toUpperCase() : ''
      if (!text) return 'idle'
      if (/REJECT|FAIL|INVALID|ERROR|EXPIRED/.test(text)) return 'error'
      if (/REVIEW|PROCESS|WAIT|PENDING|PREPARE/.test(text)) return 'wait'
      if (/READY|SALE|COMPLETE|VALID|APPROVED/.test(text)) return 'ok'
      return 'idle'
    }

    function normalizeApps(data) {
      return data && Array.isArray(data.apps) ? data.apps.filter(app => app && typeof app.id === 'string') : []
    }

    function normalizeBuilds(data) {
      return data && Array.isArray(data.builds) ? data.builds.filter(build => build && typeof build.id === 'string') : []
    }

    function normalizeGroups(data) {
      return data && Array.isArray(data.groups) ? data.groups.filter(group => group && typeof group.id === 'string') : []
    }

    function pickLatestValid(builds) {
      if (!Array.isArray(builds)) return null
      return builds.find(build => build && typeof build.processingState === 'string'
        && build.processingState.toUpperCase() === 'VALID' && build.expired !== true) || null
    }

    /* One read query; `key` carries the input identity so effects re-run only
     * when the payload actually changes. */
    function useQuery(probe, action, input, enabled) {
      const key = input === undefined ? '' : JSON.stringify(input)
      const [result, setResult] = React.useState({ loading: !!enabled, data: null, error: null })
      const [nonce, setNonce] = React.useState(0)
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
        const payload = key ? JSON.parse(key) : undefined
        void probe(action, payload).then(reply => {
          if (!live) return
          setResult({ loading: false, data: reply.ok ? reply.data : null, error: reply.ok ? null : reply.error })
        })
        return () => { live = false }
      }, [probe, action, key, enabled, nonce])
      const reload = React.useCallback(() => { setNonce(value => value + 1) }, [])
      return [result, reload]
    }

    /* ------------------------------------------------------------------ *
     * Shared presentational pieces
     * ------------------------------------------------------------------ */

    function ErrorNote({ t, error }) {
      if (!error) return null
      const code = typeof error.code === 'string' ? error.code : ''
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

    function ActionRow({ children }) {
      return h('div', { className: 'asc-hub-actions' }, children)
    }

    function SummaryRow({ label, value }) {
      return [h('dt', { key: 't' }, label), h('dd', { key: 'd' }, value)]
    }

    function Step({ t, number, title, state, current, children }) {
      return h('li', {
        className: 'asc-hub-step',
        'data-state': state,
        'aria-current': current ? 'step' : undefined,
      },
        h('span', { className: 'asc-hub-step-number', 'aria-hidden': 'true' }, state === 'done' ? '✓' : String(number)),
        h('div', { className: 'asc-hub-step-head' },
          h('h3', { className: 'asc-hub-step-title' }, title),
          h('span', { className: 'asc-hub-step-state' }, t('step.' + state))),
        children)
    }

    /* ------------------------------------------------------------------ *
     * Trigger
     * ------------------------------------------------------------------ */

    function StatusButton(props) {
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

    function TabTitle(props) {
      return h('span', { className: 'asc-hub-tab-title' }, props.t('tabTitle'))
    }

    /* ------------------------------------------------------------------ *
     * Onboarding
     * ------------------------------------------------------------------ */

    function EngineStep({ t, store, engine, engineReady, keepOnboarding }) {
      const [log, setLog] = React.useState('')
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const brewReady = !!(engine && engine.brew && engine.brew.installed)
      const install = async chosen => {
        setBusy(true)
        setError(null)
        const method = chosen || (brewReady ? 'brew' : 'curl')
        const result = await store.perform('engine.install', { method })
        setBusy(false)
        if (result.ok) {
          if (result.data && typeof result.data.log === 'string') setLog(result.data.log)
          await store.perform('engine.detect')
          if (keepOnboarding) keepOnboarding()
          return
        }
        setError(result.error)
        if (result.error && typeof result.error.detail === 'string') setLog(result.error.detail)
      }
      const recheck = async () => {
        setBusy(true)
        const result = await store.perform('engine.detect')
        setBusy(false)
        setError(result.ok ? null : result.error)
      }
      const canFallback = error && (error.code === 'BREW_MISSING' || error.code === 'INSTALL_FAILED')
      return h('div', { className: 'asc-hub-step-body' },
        h('p', { className: 'asc-hub-hint' }, engineReady
          ? t('engineDetected', { version: (engine && engine.version) || t('unknown'), path: (engine && engine.path) || '' })
          : engine ? t('engineMissing') : t('loading')),
        engineReady ? null : h('p', { className: 'asc-hub-hint' }, t('installMethodNote')),
        h(ActionRow, null,
          engineReady
            ? h('button', { type: 'button', className: 'asc-hub-btn', disabled: busy, onClick: recheck }, t('recheck'))
            : h('button', {
              type: 'button',
              className: 'asc-hub-btn asc-hub-btn-primary',
              disabled: busy,
              'aria-busy': busy ? 'true' : undefined,
              onClick: () => { void install() },
            }, busy ? t('installing') : t('installAsc')),
          canFallback ? h('button', {
            type: 'button',
            className: 'asc-hub-btn',
            disabled: busy,
            onClick: () => { void install('curl') },
          }, t('installWithCurl')) : null),
        log ? h('details', { className: 'asc-hub-log' },
          h('summary', null, t('installLogTitle')),
          h('pre', { className: 'asc-hub-log-text' }, log)) : null,
        h(ErrorNote, { t, error }))
    }

    function LoginStep({ t, store, keepOnboarding }) {
      const [keyId, setKeyId] = React.useState('')
      const [issuerId, setIssuerId] = React.useState('')
      const [keyPath, setKeyPath] = React.useState('')
      const [profileName, setProfileName] = React.useState('')
      const [file, setFile] = React.useState(null)
      const [dragging, setDragging] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState(null)
      const [message, setMessage] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const fileInput = React.useRef(null)

      const importKey = async (pem, id, issuer) => {
        const nextKeyId = id === undefined ? keyId : id
        const nextIssuer = issuer === undefined ? issuerId : issuer
        if (!nextKeyId || !nextIssuer) { setMessage(t('needKeyFields')); return }
        setBusy('import')
        setError(null)
        setMessage('')
        setNotice('')
        const result = await store.perform('auth.importKey', {
          keyId: nextKeyId,
          issuerId: nextIssuer,
          privateKeyPem: pem,
          name: profileName.trim() || undefined,
        })
        setBusy('')
        if (!result.ok) { setError(result.error); return }
        setNotice(t('importDone'))
        if (keepOnboarding) keepOnboarding()
        await store.refresh()
      }

      const readFile = dropped => {
        if (!dropped) return
        const name = typeof dropped.name === 'string' ? dropped.name : ''
        if (!/\.p8$/i.test(name)) { setMessage(t('keyFileWrong')); return }
        const reader = new FileReader()
        reader.onload = () => {
          const text = typeof reader.result === 'string' ? reader.result : ''
          if (!text) { setMessage(t('keyFileWrong')); return }
          setFile({ name, text })
          setMessage('')
          const match = /^AuthKey_([A-Za-z0-9]+)\.p8$/.exec(name)
          if (match) setKeyId(current => current || match[1])
          void importKey(text, match ? (keyId || match[1]) : keyId, issuerId)
        }
        reader.onerror = () => setMessage(t('keyFileWrong'))
        reader.readAsText(dropped)
      }

      const signIn = async () => {
        if (!keyId || !issuerId || !keyPath) { setMessage(t('loginFieldsNeeded')); return }
        setBusy('login')
        setError(null)
        setMessage('')
        setNotice('')
        const result = await store.perform('auth.login', {
          keyId,
          issuerId,
          privateKeyPath: keyPath,
          name: profileName.trim() || undefined,
          network: true,
        })
        setBusy('')
        if (!result.ok) { setError(result.error); return }
        setNotice(t('signedIn'))
        if (keepOnboarding) keepOnboarding()
        await store.refresh()
      }

      return h('div', { className: 'asc-hub-step-body' },
        h('p', { className: 'asc-hub-hint' }, t('loginIntro1')),
        h('p', { className: 'asc-hub-hint' }, t('loginIntro2')),
        h('p', { className: 'asc-hub-hint' }, t('loginIntro3')),
        h(ActionRow, null,
          h('button', {
            type: 'button',
            className: 'asc-hub-btn',
            onClick: () => { window.open(APPLE_KEYS_URL, '_blank', 'noopener,noreferrer') },
          }, t('openAppleKeys'))),
        h('p', { className: 'asc-hub-hint' }, t('appleKeysNote')),
        h('label', { className: 'asc-hub-field' },
          h('span', null, t('keyId')),
          h('input', { className: 'asc-hub-input', type: 'text', value: keyId, autoComplete: 'off', spellCheck: false, onChange: event => setKeyId(event.target.value) })),
        h('label', { className: 'asc-hub-field' },
          h('span', null, t('issuerId')),
          h('input', { className: 'asc-hub-input', type: 'text', value: issuerId, autoComplete: 'off', spellCheck: false, onChange: event => setIssuerId(event.target.value) })),
        h('label', { className: 'asc-hub-field' },
          h('span', null, t('keyPath')),
          h('input', { className: 'asc-hub-input', type: 'text', value: keyPath, placeholder: t('keyPathHint'), autoComplete: 'off', spellCheck: false, onChange: event => setKeyPath(event.target.value) })),
        h('label', { className: 'asc-hub-field' },
          h('span', null, t('profileNameOptional')),
          h('input', { className: 'asc-hub-input', type: 'text', value: profileName, placeholder: t('profileNameHint'), autoComplete: 'off', spellCheck: false, onChange: event => setProfileName(event.target.value) })),
        h('input', {
          ref: fileInput,
          className: 'asc-hub-file-input',
          type: 'file',
          accept: '.p8',
          tabIndex: -1,
          'aria-hidden': 'true',
          onChange: event => {
            const picked = event.target.files && event.target.files[0]
            readFile(picked)
            event.target.value = ''
          },
        }),
        h('button', {
          type: 'button',
          className: 'asc-hub-drop',
          'data-dragging': dragging ? 'true' : 'false',
          'aria-label': t('dropAria'),
          onClick: () => { if (fileInput.current) fileInput.current.click() },
          onDragOver: event => { event.preventDefault(); setDragging(true) },
          onDragLeave: () => setDragging(false),
          onDrop: event => {
            event.preventDefault()
            setDragging(false)
            const dropped = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
            readFile(dropped)
          },
        },
          h('span', null, t('dropZone')),
          h('span', null, t('dropNote'))),
        file ? h('p', { className: 'asc-hub-hint' }, t('keyFileLoaded', { name: file.name })) : null,
        file ? h(ActionRow, null,
          h('button', {
            type: 'button',
            className: 'asc-hub-btn',
            disabled: busy !== '',
            'aria-busy': busy === 'import' ? 'true' : undefined,
            onClick: () => { void importKey(file.text, keyId, issuerId) },
          }, busy === 'import' ? t('importingKey') : t('importKey'))) : null,
        h(ActionRow, null,
          h('button', {
            type: 'button',
            className: 'asc-hub-btn asc-hub-btn-primary',
            disabled: busy !== '' || !keyId || !issuerId || !keyPath,
            'aria-busy': busy === 'login' ? 'true' : undefined,
            onClick: () => { void signIn() },
          }, busy === 'login' ? t('verifying') : t('verifySignIn'))),
        message ? h('p', { className: 'asc-hub-error-msg', role: 'alert' }, message) : null,
        notice ? h('p', { className: 'asc-hub-hint', role: 'status' }, notice) : null,
        h(ErrorNote, { t, error }))
    }

    function ReadyStep({ t, engine, auth, onConsole }) {
      const profiles = auth && Array.isArray(auth.profiles) ? auth.profiles : []
      return h('div', { className: 'asc-hub-step-body' },
        h('p', { className: 'asc-hub-hint' }, t('readySummary')),
        h('dl', { className: 'asc-hub-summary' },
          SummaryRow({ label: t('engineLabel'), value: (engine && engine.version) || t('unknown') }),
          SummaryRow({ label: t('profileLabel'), value: (auth && auth.activeProfile) || t('none') }),
          SummaryRow({ label: t('storageLabel'), value: (auth && auth.storage) || t('unknown') })),
        profiles.length ? h('ul', { className: 'asc-hub-rows' },
          profiles.map((profile, index) => h('li', { key: String(profile && (profile.name || profile.keyId) || index), className: 'asc-hub-row' },
            h('span', null, String((profile && profile.name) || t('unknown'))),
            h('span', { className: 'asc-hub-mono' }, shortId(profile && profile.keyId))))) : null,
        h(ActionRow, null,
          h('button', { type: 'button', className: 'asc-hub-btn asc-hub-btn-primary', onClick: onConsole }, t('openConsole'))))
    }

    function Onboarding({ t, store, engine, auth, engineReady, authReady, onConsole, keepOnboarding }) {
      const engineState = engineReady ? 'done' : 'current'
      const loginState = authReady ? 'done' : engineReady ? 'current' : 'pending'
      const readyState = engineReady && authReady ? 'current' : 'pending'
      return h('section', { className: 'asc-hub-onboarding' },
        h('p', { className: 'asc-hub-intro' }, t('onboardingIntro')),
        h('ol', { className: 'asc-hub-steps' },
          h(Step, { t, number: 1, title: t('stepEngine'), state: engineState, current: engineState === 'current' },
            engineState === 'current'
              ? h(EngineStep, { t, store, engine, engineReady, keepOnboarding })
              : h('p', { className: 'asc-hub-step-summary' }, t('engineDetected', {
                version: (engine && engine.version) || t('unknown'),
                path: (engine && engine.path) || '',
              }))),
          h(Step, { t, number: 2, title: t('stepLogin'), state: loginState, current: loginState === 'current' },
            loginState === 'current'
              ? h(LoginStep, { t, store, keepOnboarding })
              : h('p', { className: 'asc-hub-step-summary' }, loginState === 'done' ? t('signedIn') : t('loginPending'))),
          h(Step, { t, number: 3, title: t('stepReady'), state: readyState, current: readyState === 'current' },
            readyState === 'current'
              ? h(ReadyStep, { t, engine, auth, onConsole })
              : h('p', { className: 'asc-hub-step-summary' }, t('readyPending')))))
    }

    /* ------------------------------------------------------------------ *
     * Console
     * ------------------------------------------------------------------ */

    function AppPicker({ t, query, apps, appId, onChange }) {
      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('appTitle')),
          query.loading ? h('span', { className: 'asc-hub-hint' }, t('loading')) : null),
        query.error ? h(ErrorNote, { t, error: query.error }) : null,
        !query.error && !query.loading && apps.length === 0 ? h('p', { className: 'asc-hub-hint' }, t('noApps')) : null,
        apps.length > 0 ? h('label', { className: 'asc-hub-field' },
          h('span', null, t('appChoose')),
          h('select', {
            className: 'asc-hub-select',
            value: appId,
            onChange: event => onChange(event.target.value),
            'aria-label': t('appChoose'),
          },
            h('option', { value: '' }, t('appNone')),
            apps.map(app => h('option', { key: app.id, value: app.id },
              String(app.name || app.id) + ' · ' + String(app.bundleId || ''))))) : null,
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appHint')) : null)
    }

    function BuildsCard({ t, store, appId, query, reload, builds }) {
      const [ipaPath, setIpaPath] = React.useState('')
      const [version, setVersion] = React.useState('')
      const [buildNumber, setBuildNumber] = React.useState('')
      const [wait, setWait] = React.useState(true)
      const [confirm, setConfirm] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState('')

      const upload = async () => {
        if (!appId || !ipaPath) return
        setBusy(true)
        setError(null)
        setNotice('')
        const input = { appId, ipaPath, confirm: true }
        if (version) input.version = version
        if (buildNumber) input.buildNumber = buildNumber
        if (wait) input.wait = true
        const result = await store.perform('builds.upload', input)
        setBusy(false)
        if (!result.ok) { setError(result.error); return }
        setIpaPath('')
        setVersion('')
        setBuildNumber('')
        setConfirm(false)
        setNotice(t('uploadDone'))
        reload()
      }

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('buildsTitle')),
          h('button', { type: 'button', className: 'asc-hub-btn', disabled: !appId || query.loading, onClick: reload }, t('refresh'))),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        query.error ? h(ErrorNote, { t, error: query.error }) : null,
        appId && !query.error && !query.loading && builds.length === 0 ? h('p', { className: 'asc-hub-hint' }, t('noBuilds')) : null,
        builds.length > 0 ? h('ul', { className: 'asc-hub-rows' },
          builds.map(build => h('li', { key: build.id, className: 'asc-hub-row' },
            h('span', { className: 'asc-hub-row-main' },
              h('strong', null, String(build.version || '—')),
              h('span', { className: 'asc-hub-mono' }, String(build.buildNumber || ''))),
            h('span', { className: 'asc-hub-chip', 'data-state': chipState(build.processingState) }, String(build.processingState || t('unknown'))),
            h('span', { className: 'asc-hub-mono' }, formatDate(build.uploadedDate))))) : null,
        appId ? h('details', { className: 'asc-hub-log' },
          h('summary', null, t('uploadTitle')),
          h('div', { className: 'asc-hub-step-body' },
            h('label', { className: 'asc-hub-field' },
              h('span', null, t('ipaPath')),
              h('input', {
                className: 'asc-hub-input',
                type: 'text',
                value: ipaPath,
                placeholder: t('ipaPathHint'),
                spellCheck: false,
                onChange: event => setIpaPath(event.target.value),
              })),
            h('label', { className: 'asc-hub-field' },
              h('span', null, t('versionOptional')),
              h('input', { className: 'asc-hub-input', type: 'text', value: version, spellCheck: false, onChange: event => setVersion(event.target.value) })),
            h('label', { className: 'asc-hub-field' },
              h('span', null, t('buildNumberOptional')),
              h('input', { className: 'asc-hub-input', type: 'text', value: buildNumber, spellCheck: false, onChange: event => setBuildNumber(event.target.value) })),
            h('label', { className: 'asc-hub-check' },
              h('input', { type: 'checkbox', checked: wait, onChange: event => setWait(event.target.checked) }),
              h('span', null, t('waitForProcessing'))),
            h('label', { className: 'asc-hub-check' },
              h('input', { type: 'checkbox', checked: confirm, onChange: event => setConfirm(event.target.checked) }),
              h('span', null, t('confirmUpload'))),
            h(ActionRow, null,
              h('button', {
                type: 'button',
                className: 'asc-hub-btn asc-hub-btn-primary',
                disabled: busy || !confirm || !ipaPath,
                'aria-busy': busy ? 'true' : undefined,
                onClick: () => { void upload() },
              }, busy ? t('uploading') : t('uploadIpa'))),
            notice ? h('p', { className: 'asc-hub-hint', role: 'status' }, notice) : null,
            h(ErrorNote, { t, error }))) : null)
    }

    function TestFlightCard({ t, store, appId, builds, buildsLoading }) {
      const groupsQuery = useQuery(store.probe, 'testflight.groups', appId ? { appId } : undefined, !!appId)
      const groups = normalizeGroups(groupsQuery[0].data)
      const latest = pickLatestValid(builds)
      const [selected, setSelected] = React.useState([])
      const [whatsNew, setWhatsNew] = React.useState('')
      const [confirmDistribute, setConfirmDistribute] = React.useState(false)
      const [confirmBeta, setConfirmBeta] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState(null)

      React.useEffect(() => { setSelected([]) }, [appId])

      const toggle = id => {
        setSelected(current => current.indexOf(id) === -1 ? current.concat([id]) : current.filter(item => item !== id))
      }

      const distribute = async () => {
        if (!appId || !latest) return
        setBusy('distribute')
        setError(null)
        const input = { appId, buildId: latest.id, groupIds: selected, confirm: true }
        if (whatsNew) input.whatsNew = whatsNew
        const result = await store.perform('testflight.distribute', input)
        setBusy('')
        if (!result.ok) { setError(result.error); return }
        setConfirmDistribute(false)
      }

      const submitBeta = async () => {
        if (!appId || !latest) return
        setBusy('beta')
        setError(null)
        const result = await store.perform('testflight.submitBeta', { appId, buildId: latest.id, confirm: true })
        setBusy('')
        if (!result.ok) { setError(result.error); return }
        setConfirmBeta(false)
      }

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('testflightTitle')),
          h('button', { type: 'button', className: 'asc-hub-btn', disabled: !appId || groupsQuery[0].loading, onClick: groupsQuery[1] }, t('refresh'))),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        groupsQuery[0].error ? h(ErrorNote, { t, error: groupsQuery[0].error }) : null,
        appId && !groupsQuery[0].loading && groups.length === 0 && !groupsQuery[0].error
          ? h('p', { className: 'asc-hub-hint' }, t('noGroups')) : null,
        groups.length > 0 ? h('fieldset', { className: 'asc-hub-field' },
          h('span', null, t('groupsTitle')),
          groups.map(group => h('label', { key: group.id, className: 'asc-hub-check' },
            h('input', { type: 'checkbox', checked: selected.indexOf(group.id) !== -1, onChange: () => toggle(group.id) }),
            h('span', null, String(group.name || group.id)),
            h('span', { className: 'asc-hub-chip', 'data-state': group.internal === true ? 'ok' : 'idle' },
              group.internal === true ? t('internalGroup') : t('externalGroup')),
            typeof group.testerCount === 'number'
              ? h('span', { className: 'asc-hub-mono' }, String(group.testerCount)) : null))) : null,
        latest
          ? h('p', { className: 'asc-hub-hint' }, t('latestBuild', {
            version: String(latest.version || '—'),
            build: String(latest.buildNumber || '—'),
          }))
          : appId ? h('p', { className: 'asc-hub-hint' }, buildsLoading ? t('loading') : t('noValidBuild')) : null,
        latest ? h('label', { className: 'asc-hub-field' },
          h('span', null, t('whatsNew')),
          h('textarea', {
            className: 'asc-hub-textarea',
            value: whatsNew,
            placeholder: t('whatsNewHint'),
            onChange: event => setWhatsNew(event.target.value),
          })) : null,
        latest ? h('label', { className: 'asc-hub-check' },
          h('input', { type: 'checkbox', checked: confirmDistribute, onChange: event => setConfirmDistribute(event.target.checked) }),
          h('span', null, t('confirmDistribute'))) : null,
        latest ? h(ActionRow, null,
          h('button', {
            type: 'button',
            className: 'asc-hub-btn asc-hub-btn-primary',
            disabled: busy !== '' || !confirmDistribute || selected.length === 0,
            'aria-busy': busy === 'distribute' ? 'true' : undefined,
            onClick: () => { void distribute() },
          }, busy === 'distribute' ? t('distributing') : t('distribute'))) : null,
        latest ? h('label', { className: 'asc-hub-check' },
          h('input', { type: 'checkbox', checked: confirmBeta, onChange: event => setConfirmBeta(event.target.checked) }),
          h('span', null, t('confirmBeta'))) : null,
        latest ? h(ActionRow, null,
          h('button', {
            type: 'button',
            className: 'asc-hub-btn',
            disabled: busy !== '' || !confirmBeta,
            'aria-busy': busy === 'beta' ? 'true' : undefined,
            onClick: () => { void submitBeta() },
          }, busy === 'beta' ? t('submittingBeta') : t('betaReview'))) : null,
        h(ErrorNote, { t, error }))
    }

    function ReviewCard({ t, store, appId }) {
      const readiness = useQuery(store.probe, 'release.readiness', appId ? { appId } : undefined, !!appId)
      const release = useQuery(store.probe, 'release.status', appId ? { appId } : undefined, !!appId)
      const readinessData = readiness[0].data && typeof readiness[0].data === 'object' ? readiness[0].data : null
      const releaseData = release[0].data && typeof release[0].data === 'object' ? release[0].data : null
      const blockers = readinessData && Array.isArray(readinessData.blockers) ? readinessData.blockers : []
      const version = (readinessData && readinessData.version) || (releaseData && releaseData.version) || ''
      const releaseState = releaseData && releaseData.state ? String(releaseData.state) : ''
      const [confirm, setConfirm] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const ready = !!(readinessData && readinessData.ready === true)

      React.useEffect(() => { setConfirm(false); setError(null) }, [appId])

      const reloadBoth = () => { readiness[1](); release[1]() }

      const submit = async () => {
        if (!appId) return
        setBusy(true)
        setError(null)
        const input = { appId, confirm: true }
        if (version) input.version = version
        const result = await store.perform('release.submit', input)
        setBusy(false)
        if (!result.ok) { setError(result.error); return }
        setConfirm(false)
        reloadBoth()
      }

      return h('section', { className: 'asc-hub-card' },
        h('div', { className: 'asc-hub-card-head' },
          h('h3', { className: 'asc-hub-card-title' }, t('reviewTitle')),
          h('button', { type: 'button', className: 'asc-hub-btn', disabled: !appId || readiness[0].loading, onClick: reloadBoth }, t('recheck'))),
        !appId ? h('p', { className: 'asc-hub-hint' }, t('appRequired')) : null,
        readiness[0].error ? h(ErrorNote, { t, error: readiness[0].error }) : null,
        release[0].error ? h(ErrorNote, { t, error: release[0].error }) : null,
        readinessData ? h('dl', { className: 'asc-hub-summary' },
          SummaryRow({ label: t('readiness'), value: ready ? t('readyYes') : t('readyNo') }),
          version ? SummaryRow({ label: t('versionLabel'), value: version }) : null,
          releaseState ? SummaryRow({ label: t('releaseState'), value: releaseState }) : null) : null,
        releaseData && releaseData.submittedDate
          ? h('p', { className: 'asc-hub-hint' }, t('submittedOn', { date: formatDate(releaseData.submittedDate) })) : null,
        blockers.length > 0 ? h('div', null,
          h('p', { className: 'asc-hub-hint' }, t('blockersTitle')),
          h('ul', { className: 'asc-hub-rows' },
            blockers.map((blocker, index) => h('li', { key: String((blocker && blocker.code) || index), className: 'asc-hub-row' },
              h('span', { className: 'asc-hub-row-main' }, String((blocker && blocker.message) || '')),
              h('span', { className: 'asc-hub-chip', 'data-state': 'error' }, String((blocker && blocker.code) || '')))))) : null,
        readinessData && blockers.length === 0 ? h('p', { className: 'asc-hub-hint' }, t('noBlockers')) : null,
        appId ? h('label', { className: 'asc-hub-check' },
          h('input', { type: 'checkbox', checked: confirm, onChange: event => setConfirm(event.target.checked) }),
          h('span', null, t('confirmSubmit'))) : null,
        appId ? h(ActionRow, null,
          h('button', {
            type: 'button',
            className: 'asc-hub-btn asc-hub-btn-primary',
            disabled: busy || !confirm || !ready,
            'aria-busy': busy ? 'true' : undefined,
            onClick: () => { void submit() },
          }, busy ? t('submittingReview') : t('submitReview'))) : null,
        h(ErrorNote, { t, error }))
    }

    function SalesCard({ t, store, appId }) {
      const [period, setPeriod] = React.useState('day')
      const [date, setDate] = React.useState('')
      const [vendorNumber, setVendorNumber] = React.useState(() => readStored(VENDOR_KEY))
      const [editingVendor, setEditingVendor] = React.useState(false)
      const [vendorDraft, setVendorDraft] = React.useState(() => readStored(VENDOR_KEY))

      // CONTRACT §Sales: `appId` is required and the report is vendor-scoped.
      const input = { appId, period }
      if (date) input.date = date
      if (vendorNumber) input.vendorNumber = vendorNumber
      const query = useQuery(store.probe, 'sales.summary', input, !!appId)
      const data = query[0].data && typeof query[0].data === 'object' ? query[0].data : null
      const rows = data && Array.isArray(data.rows) ? data.rows : null
      const totals = data && data.totals && typeof data.totals === 'object' ? data.totals : null
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

    function AnalyticsCard({ t, store, appId }) {
      const query = useQuery(store.probe, 'analytics.reports', appId ? { appId } : undefined, !!appId)
      const data = query[0].data && typeof query[0].data === 'object' ? query[0].data : null
      const requests = data && Array.isArray(data.requests) ? data.requests : []
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
            const record = request && typeof request === 'object' ? request : {}
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

    function LogArea({ t, log }) {
      const entries = Array.isArray(log) ? log : []
      return h('details', { className: 'asc-hub-log' },
        h('summary', null, t('logTitle')),
        entries.length === 0
          ? h('p', { className: 'asc-hub-hint' }, t('logEmpty'))
          : h('pre', { className: 'asc-hub-log-text' }, entries.map(entry => '[' + entry.action + '] ' + entry.text).join('\n\n')))
    }

    function Console({ t, store }) {
      const [appId, setAppId] = React.useState(() => readStored(APP_KEY))
      const appsQuery = useQuery(store.probe, 'apps.list', {}, true)
      const buildsQuery = useQuery(store.probe, 'builds.list', appId ? { appId } : undefined, !!appId)
      const apps = normalizeApps(appsQuery[0].data)
      const builds = appId ? normalizeBuilds(buildsQuery[0].data) : []

      const chooseApp = next => {
        setAppId(next)
        writeStored(APP_KEY, next)
      }

      return h('div', { className: 'asc-hub-console' },
        h(AppPicker, { t, query: appsQuery[0], apps, appId, onChange: chooseApp }),
        h(BuildsCard, { t, store, appId, query: buildsQuery[0], reload: buildsQuery[1], builds }),
        h(TestFlightCard, { t, store, appId, builds, buildsLoading: buildsQuery[0].loading }),
        h(ReviewCard, { t, store, appId }),
        h(SalesCard, { t, store, appId }),
        h(AnalyticsCard, { t, store, appId }))
    }

    /* ------------------------------------------------------------------ *
     * Panel body
     * ------------------------------------------------------------------ */

    function PanelBody(props) {
      const { t, store, locale, useTabInfo } = props
      useLocaleTick(locale)
      const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot)
      const info = useTabInfo()
      const tab = info && info.tab ? info.tab : null
      const actions = tab && tab.actions ? tab.actions : null
      const [view, setView] = React.useState('auto')

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
      const mode = status
        ? (typeof status.mode === 'string' ? status.mode : (status.config && typeof status.config.mode === 'string' ? status.config.mode : ''))
        : ''
      const modeLabel = mode === 'write' ? t('modePublish') : mode === 'read-only' ? t('modeReadOnly') : t('modeUnknown')
      const onboarding = view === 'onboarding'
        || (view === 'auto' && (!status || phase === 'start' || phase === 'engine' || phase === 'login'))
      const keepOnboarding = () => setView('onboarding')
      const onConsole = () => setView('console')
      const live = state.busyAction ? t('working') : ''

      const body = !status && state.statusError
        ? h('section', { className: 'asc-hub-card' }, h(ErrorNote, { t, error: state.statusError }))
        : onboarding
          ? h(Onboarding, { t, store, engine, auth, engineReady, authReady, onConsole, keepOnboarding })
          : h(Console, { t, store })

      return h('div', { 'data-asc-hub': '', className: 'asc-hub-root' },
        h('style', null, STYLES),
        h('div', { className: 'asc-hub-panel', 'aria-busy': state.busyAction ? 'true' : undefined },
          h('header', { className: 'asc-hub-head' },
            h('div', { className: 'asc-hub-head-main' },
              h('h2', { className: 'asc-hub-title' }, t('title')),
              h('p', { className: 'asc-hub-sub' }, engine && engine.version
                ? t('versionLine', { version: engine.version })
                : t('versionUnknown')),
              h('span', { className: 'asc-hub-mode' }, modeLabel)),
            h('div', { className: 'asc-hub-head-actions' },
              h('button', {
                type: 'button',
                className: 'asc-hub-icon-btn',
                'aria-label': t('refresh'),
                title: t('refresh'),
                disabled: state.loading || state.busyAction !== '',
                onClick: () => { void store.refresh() },
              }, '↻'),
              h('button', {
                type: 'button',
                className: 'asc-hub-icon-btn',
                'aria-label': t('close'),
                title: t('close'),
                onClick: close,
              }, '×'))),
          h('p', { className: 'asc-hub-live', role: 'status', 'aria-live': 'polite' }, live),
          state.actionError ? h(ErrorNote, { t, error: state.actionError }) : null,
          body,
          h(LogArea, { t, log: state.log })))
    }

    /* ------------------------------------------------------------------ *
     * Plugin body
     * ------------------------------------------------------------------ */

    function apply(ctx) {
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

      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'asc-hub-status',
        order: 50,
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
