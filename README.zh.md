<p align="center">
  <img src="https://raw.githubusercontent.com/sleep9ull/dsh-asc-hub/main/icon.svg" width="88" alt="dsh-asc-hub 图标">
</p>

<h1 align="center">dsh-asc-hub</h1>

<p align="center">
  <strong>DeepSeek Harness 里的 App Store Connect 控制台。</strong><br>
  在当前会话的工作目录里构建、发 TestFlight、提交审核、发布上线 —— 都在侧边面板里，就在写出这段代码的会话旁边。
</p>

<p align="center">
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.md">English</a> | 简体中文 | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.ko.md">한국어</a> | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.zh.md#%E7%8E%AF%E5%A2%83%E8%A6%81%E6%B1%82"><img alt="DSH" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsleep9ull%2Fdsh-asc-hub%2Fmain%2Fpackage.json&query=%24.engines.dsh&label=DSH&style=flat-square&color=4c6ef5&labelColor=454a54"></a>
  <a href="https://nodejs.org/"><img alt="Node" src="https://img.shields.io/node/v/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&label=Node&logo=node.js&logoColor=white&color=339933"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/tsconfig.json"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&color=263146"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/sleep9ull/dsh-asc-hub?style=flat-square&color=4b6fff"></a>
  <a href="https://www.npmjs.com/package/@sleep9ull/dsh-asc-hub"><img alt="npm" src="https://img.shields.io/npm/v/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&label=npm&color=cb3837"></a>
</p>

<p align="center">
  <b>引擎：</b><a href="https://github.com/rorkai/App-Store-Connect-CLI"><code>asc</code></a> —— Rudrank Riyam 的开源 App Store Connect CLI。<br>
  独立安装、作为外部程序调用，不打包、不内联、不 fork。
</p>

<div align="center">

[概述](#概述) · [安装](#安装) · [功能](#功能) · [工作流程](#工作流程) · [首次配置](#首次配置) ·
[环境要求](#环境要求) · [安全](#安全) · [配置](#配置) · [开发](#开发) ·
[已知限制](#已知限制) · [文档](#文档)

</div>

## 概述

发一个 iOS 应用，大部分时间并不花在写代码上。花在：把刚构建出来的东西打包归档、上传、给对的
TestFlight 分组挑对的构建、写清楚测试人员该看什么、等审核、再发布。这些事通常发生在 Xcode
Organizer、一个浏览器标签和终端之间，而且往往就在 agent 写完代码的几分钟后。

`dsh-asc-hub` 把这一半放进 Harness 的侧边面板，并且按它实际发生的顺序排列。它**把
[`asc`](https://github.com/rorkai/App-Store-Connect-CLI) 作为外部引擎继承进来** —— 安装它、
运行它、读它的输出 —— 自己负责控制台、状态机和安全护栏。它不 fork、不内联、不重新实现 CLI，
所以升级 `asc` 就是升级产品能力。

两扇门、一个 dispatcher：面板和 `asc_hub` 模型工具调用同一套 Host 操作，因此共享分类、门禁与
脱敏。

> **版本 0.1.1** —— 已在 DeepSeek Harness 0.2.2-rc.1 与 `asc` 6.5.3 上验证。

## 安装

安装走 Harness 自带的插件管理器 —— 不需要 `git clone`，不需要敲 shell，也不需要下载 tarball：

### Plugins → Add plugin（插件 → 添加插件）

打开 **Plugins → Add plugin（插件 → 添加插件）**，粘贴 spec 并确认：

```
@sleep9ull/dsh-asc-hub
```

需要固定版本就写 `@sleep9ull/dsh-asc-hub@0.1.1`。之后 **Plugins → Installed → Versions（插件 → 已安装 → 版本）** 负责升级。

然后启用 `asc-hub` 这一行（插件管理器里标题是 **App Store Connect Hub（App Store Connect 控制台）**），在右侧栏打开
**ASC Hub（ASC 控制台）** 标签页。

> 桌面版的 profile 由 app 自己管理。在 shell 里往 `profiles/<name>` 安装可能报告成功，却不会出现
> 在 app 里 —— 请通过 app 的插件页面安装。

## 功能

| 区块 | 做什么 | 背后的 `asc` |
|---|---|---|
| **App & Bundle** | 选择应用，按浏览器记住选择 | `asc apps list` |
| **Working directory** | 会话在哪里工作：路径、分支、与 `origin/main` 的差距、未提交文件，以及**这份代码能不能构建** —— 不能时给出原因 | `git status --porcelain=v1 --branch`、`xcode-select -p` |
| **Build** | 归档会话工作目录里的代码、导出 `.ipa`、上传；版本号与构建号是两个字段 | `asc xcode archive` → `asc xcode export` → `asc builds upload --wait` |
| **Builds** | 最新构建每页三个，底部固定一行 release 构建，带 `Internal` / `External` / `Release` 标签 | `asc builds list` |
| **TestFlight** | 选构建、选分组、写 *What to Test*、发出去 | `asc builds test-notes create`、`asc builds add-groups` |
| **Review** | 选构建；版本已发布则显示 `Reviewed`，否则给出 readiness、阻塞项与 `Submit for review` | `asc validate`、`asc versions create`、`asc review submit` |
| **Release** | 发布一个已通过审核的版本 | `asc versions release` |
| **Skills** | 报告继承来的 `asc` 技能包，按需安装 | `asc install-skills` |

此外还有面板不画、但模型可用的能力：销售汇总、analytics 报告请求、受围栏保护的只读 `asc`
argv 逃生口，以及通过 `asc_hub` 工具调用全部面板动作。

几个值得知道的设计决定：

- **Build 构建的是目录，不是你挑的文件。** 工作单位是会话正在看的代码；产物落在临时目录，版本号
  通过构建设置（`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`）传入，绝不改写你的工程文件。
- **没走过审核的构建不会声称走过。** 审核针对的是版本，所以面板会问"哪个版本承载这个构建"：
  只发过 TestFlight 的构建会正确显示为"未提交审核"。
- **只有一个刷新按钮**，一次重读全部区块；每个步骤拥有自己的构建菜单，因为"发给测试员"和
  "提交审核"是同一份列表上的两个不同决定。

## 工作流程

```
工作目录  →  Build  →  Builds  →  TestFlight  →  Review  →  Release
 能构建吗？  归档      挑一个      发给分组       交苹果      上线商店
            导出
            上传
```

每一步都是真实的 `asc` 调用，无论由面板还是模型发起，门禁完全一致。

## 首次配置

两步都是**本地动作**，在默认的 `read-only` 模式下即可完成 —— 只有向 App Store Connect 写入才需要
`mode: write`。

**1. 安装 `asc` 引擎。** 面板会先探测（`asc version`），然后通过 Homebrew（`brew install asc`）或
官方脚本（`curl -fsSL https://asccli.sh/install | bash`）安装，并展示脱敏后的日志。

**2. 用 App Store Connect API Key 登录。** 在
[App Store Connect → 用户和访问 → 集成](https://appstoreconnect.apple.com/access/integrations/api)
创建密钥，记下 **Key ID** 与 **Issuer ID**，一次性下载 `AuthKey_XXXXXXXXXX.p8`，把它和两个 id
一起拖进面板。Host 会把 PEM 写成私有 `0600` 临时文件，交给
`asc auth login --private-key …`，然后删除它 —— 凭据由 `asc` 存进 macOS Keychain。登录是
**面板专属**的：模型只会拿到 `CLIENT_ONLY`，凭据交接只发生在人这一侧。

密钥的角色决定你能做什么（上传、TestFlight 与提交需要 Admin 或 App Manager；销售数据需要报表权限）。
Apple 会强制执行，控制台只报告拒绝，不绕过它。完整流程与排错见
[docs/ONBOARDING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ONBOARDING.md)。

## 环境要求

| | |
|---|---|
| **宿主** | 支持插件的 DeepSeek Harness，`>=0.2.2-rc.1 <0.3.0`（写在 `engines.dsh`，不兼容时插件管理器会拒绝安装） |
| **Node** | 22 或更新 |
| **系统** | macOS —— 凭据在 Keychain，Build 需要 Xcode |
| **Build** | 完整版 Xcode（`xcode-select -p` 必须指向 `Xcode.app/Contents/Developer`）；只有 Command Line Tools 时面板显示 *cannot build: Xcode is not installed*，其余功能照常可用 |
| **引擎** | `asc` 6.5.x，运行时探测；命令面就是兼容性契约（[docs/UPSTREAM-ASC.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/UPSTREAM-ASC.md)） |
| **账号** | 具有 App Store Connect 访问权限的 Apple Developer Program 会员 |

## 安全

- **永远不要 Apple ID 密码。** App Store Connect API Key 签发 JWT；没有密码、没有 2FA 需要穿过插件。
- **密钥材料从不落盘、不写日志、不回显。** PEM 只存在于 `0600` 临时文件里，并在 `finally` 中删除；
  所有出站文本都会脱敏（私钥块、`ASC_*` 赋值、`AuthKey_*.p8` 路径、JWT），id 只保留末四位。
- **默认只读。** 任何 App Store Connect 写入都需要 `mode: write` **和** `input.confirm: true`，
  由模型发起时还要经过 Host 审批。安装引擎与登录是本地动作，刻意允许在 `read-only` 下完成。
- **逃生口有围栏。** 原始 `run` 动作拒绝 `auth`、`web`、`install-skills` 以及会改状态的那几族命令，
  且在 `read-only` 下子进程会带 `asc --read-only`。
- **遥测关闭。** 默认以 `ASC_TELEMETRY_DISABLED=1` 运行 `asc`。
- **面板路径不写会话日志或模型历史** —— 它走 Fetch 路由，不是会话命令。

## 配置

这一行的 `config` 由 Host 读取；类型不对的值会回落到安全默认值。与
[docs/CONTRACT.md § Configuration](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/CONTRACT.md) 保持一致。

| 键 | 默认值 | 含义 |
|---|---|---|
| `ascPath` | `asc` | 要运行的二进制：`PATH` 上的名字或绝对路径。 |
| `profile` | `null` | 通过 `--profile` 传入的命名登录配置；空则用 `asc` 默认。 |
| `mode` | `read-only` | 以 `READ_ONLY_MODE` 拒绝 App Store Connect 写入；设为 `write` 才能发布。 |
| `requireApproval` | `true` | 模型发起的写入前询问人类；面板自己的写入用确认步骤。 |
| `timeoutMs` | `60000` | 普通 `asc` 调用的超时。 |
| `longTimeoutMs` | `1800000` | `run` 超时与工具执行预算的上界。 |
| `maxOutputBytes` | `262144` | 返回给面板或模型的日志/stdout 文本上限。 |
| `telemetryDisabled` | `true` | 以 `ASC_TELEMETRY_DISABLED=1` 运行 `asc`。 |
| `bypassKeychain` | `false` | 以 `ASC_BYPASS_KEYCHAIN=1` 运行，凭据落到配置文件而非 Keychain。不推荐。 |
| `defaultAppId` | `null` | 动作未提供 `appId` 时使用的应用 id。 |
| `vendorNumber` | `null` | 销售报表用的 vendor number，来自 Sales and Trends 页面 URL。 |

> `mode` 有两条路。面板页脚的 `read-only mode` / `write mode` 徽标就是开关，点一下只改**本次会话**
> 的门禁（`mode.set`，不写盘）；要下次启动仍然生效，在插件管理器里把这一行的 `config.mode` 改成
> `write`，或在 profile 的 `cordis.patch.yml` 里覆盖 —— 插件不会自己改写 profile 补丁。

面板把选中的应用 id 存在 `localStorage`（`dsh.asc-hub.v1.app`）；Host 不保存选择状态。

## 开发

代码是 TypeScript。两个 `tsc` 项目构建 `dist/`：Host 输出 ESM 与声明文件，client 输出单个脚本
（`module: none`）—— 也就是 Harness 模块加载器实际求值的那一个文件。

```
src/index.ts            Host 入口：apply(ctx, config)
src/host/*.ts           config、exec、asc 缝合层、engine、auth、ops、dispatch、rpc、tool、skills、
                        workspace、build、redact，以及 types.ts（DSH 未公开的那层表面）
src/client.ts           面板：状态按钮、onboarding、控制台
test/*.ts               host 测试，编译后对着 dist/ 运行
client/__smoke__.mts    client 测试台：按加载器的方式加载 dist/client.js
```

```sh
npm run build      # dist/（host + client）
npm run check      # 四个项目 tsc --noEmit
npm test           # 61 项 host 测试，跑 dist/
npm run smoke      # 248 项 client 检查，跑 dist/client.js
npm run verify     # 以上全部
```

要在 Harness 里跑自己的 checkout：`plugin_manager` → `install_bundle`，传本目录的绝对路径 ——
那是 `link:` 安装，只用于开发，无法原地升级。改完 `src/**` 需要 `npm run build` 面板才会看到；Host 侧
还要重装这一行，让模块代际重新加载。
约定、不变量与模块图见 [AGENTS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/AGENTS.md)、
[docs/WORKFLOW.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/WORKFLOW.md)。

## 已知限制

- **Build 需要完整 Xcode。** 没有时面板给出 `cannot build` 及原因，控制台其余部分照常工作。
- **销售与 analytics 只有 Host 动作，还没有卡片。** `sales.summary` 与 `analytics.reports` 已实现、
  模型可用；面板卡片暂未启用。
- **不支持月周期销售与原始 TSV 导出**（`analytics sales --output` 是文件路径）。
- **上传与等待只有一个翻转的 `busy` 状态**，没有流式进度。
- **页脚的更新标记是惰性的**：`status.update` 目前是常量，通知与动作由 **Plugins → Installed（插件 → 已安装）** 负责。
- **本文件刻意不放截图。** 面板跟随 Harness 主题渲染，静态图片比这段文字过期得更快。

## 文档

| | |
|---|---|
| [docs/CONTRACT.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/CONTRACT.md) | 线协议：传输、动作、门禁、Hub 状态、错误码、脱敏、配置 —— 权威文档 |
| [docs/ARCHITECTURE.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ARCHITECTURE.md) | 流水线、模块图、构建 |
| [docs/ONBOARDING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ONBOARDING.md) | 引擎、API Key、密钥角色、排错 |
| [docs/OPERATIONS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/OPERATIONS.md) | 每个控制台动作实际跑什么、怎么读输出 |
| [docs/UPSTREAM-ASC.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/UPSTREAM-ASC.md) | 从 `asc` 继承了什么、升级如何流动 |
| [docs/RELEASING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/RELEASING.md) | 分发、发现、升级矩阵、上架检查 |
| [docs/WORKFLOW.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/WORKFLOW.md) | 日常节奏：何时构建、何时升版本、何时发布 |
| [AGENTS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/AGENTS.md) | 给在本仓库工作的 agent 的不变量与模块图 |

## 许可证

插件以 MIT 许可发布 —— 见 [LICENSE](https://github.com/sleep9ull/dsh-asc-hub/blob/main/LICENSE)。`asc` CLI 同为 MIT 许可，Copyright (c) 2026
Rudrank Riyam；它独立安装、不随本插件分发 —— 见 [THIRD_PARTY_NOTICES.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/THIRD_PARTY_NOTICES.md)。

本项目独立且非官方，与 Apple Inc. 无隶属、背书或赞助关系。App Store Connect、TestFlight、
Xcode Cloud 与 Apple 是 Apple Inc. 的商标。
