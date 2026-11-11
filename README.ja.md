<p align="center">
  <img src="https://raw.githubusercontent.com/sleep9ull/dsh-asc-hub/main/icon.svg" width="88" alt="dsh-asc-hub アイコン">
</p>

<h1 align="center">dsh-asc-hub</h1>

<p align="center">
  <strong>DeepSeek Harness の中の App Store Connect コンソール。</strong><br>
  いまのセッションの作業ディレクトリをビルドし、TestFlight に送り、審査に提出し、リリースします — このコードを書いたセッションの隣のサイドパネルで。
</p>

<p align="center">
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.md">English</a> | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.zh.md">简体中文</a> | <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.ko.md">한국어</a> | 日本語
</p>

<p align="center">
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/README.ja.md#%E5%8B%95%E4%BD%9C%E7%92%B0%E5%A2%83"><img alt="DSH" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsleep9ull%2Fdsh-asc-hub%2Fmain%2Fpackage.json&query=%24.engines.dsh&label=DSH&style=flat-square&color=4c6ef5&labelColor=454a54"></a>
  <a href="https://nodejs.org/"><img alt="Node" src="https://img.shields.io/node/v/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&label=Node&logo=node.js&logoColor=white&color=339933"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/tsconfig.json"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/npm/l/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&color=263146"></a>
  <a href="https://github.com/sleep9ull/dsh-asc-hub/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/sleep9ull/dsh-asc-hub?style=flat-square&color=4b6fff"></a>
  <a href="https://www.npmjs.com/package/@sleep9ull/dsh-asc-hub"><img alt="npm" src="https://img.shields.io/npm/v/%40sleep9ull%2Fdsh-asc-hub?style=flat-square&label=npm&color=cb3837"></a>
</p>

<p align="center">
  <b>エンジン:</b> <a href="https://github.com/rorkai/App-Store-Connect-CLI"><code>asc</code></a> — Rudrank Riyam によるオープンソースの App Store Connect CLI。<br>
  別途インストールし外部プログラムとして実行します。同梱・内蔵・フォークはしません。
</p>

<div align="center">

[概要](#概要) · [インストール](#インストール) · [機能](#機能) · [ワークフロー](#ワークフロー) ·
[初回セットアップ](#初回セットアップ) · [動作環境](#動作環境) · [セキュリティ](#セキュリティ) ·
[設定](#設定) · [開発](#開発) · [制限事項](#制限事項) · [ドキュメント](#ドキュメント)

</div>

## 概要

iOS アプリを世に出す時間の大半は、コードを書くことではありません。直前にビルドしたものをアーカイブ
してアップロードし、正しい TestFlight グループに正しいビルドを選び、テスターが何を見るべきかを書き、
審査を待ち、リリースする。たいていは Xcode Organizer とブラウザのタブとターミナルの間を行き来しながら、
しかもエージェントがコードを書き終えた数分後に起きます。

`dsh-asc-hub` はその後半を Harness のサイドパネルに置き、実際に起きる順番に並べます。オープンソースの
[`asc`](https://github.com/rorkai/App-Store-Connect-CLI) CLI を**外部エンジンとして継承**します — インストールし、
実行し、出力を読みます — コンソール、状態機械、安全装置はこのプラグインが持ちます。CLI をフォークも
同梱も再実装もしないので、`asc` のアップグレードがそのまま製品能力のアップグレードになります。

扉は 2 つ、ディスパッチャは 1 つ。パネルと `asc_hub` モデルツールは同じ Host 操作を呼ぶため、分類・
ゲート・マスキングを共有します。

> **バージョン 0.1.0** — DeepSeek Harness 0.2.2-rc.1 と `asc` 6.5.3 で検証済みです。

## インストール

インストールは Harness 自身のプラグインマネージャで行います — `git clone` も、シェル操作も、tarball の
取得も要りません。

### Plugins → Add plugin（プラグイン → プラグインを追加）

**Plugins → Add plugin（プラグイン → プラグインを追加）**を開き、spec を貼り付けて確定します:

```
@sleep9ull/dsh-asc-hub
```

バージョンを固定するなら `@sleep9ull/dsh-asc-hub@0.1.0` と書きます。以後の更新は
**Plugins → Installed → Versions（プラグイン → インストール済み → バージョン）**が担当します。

次に `asc-hub` の行を有効にし（プラグインマネージャでの表示名は **App Store Connect hub（App Store Connect コンソール）**）、
右サイドバーで **ASC Hub（ASC コンソール）** タブを開きます。

> デスクトップアプリの profile はアプリ自身が管理します。シェルから `profiles/<name>` にインストール
> すると成功と表示されてもアプリに出てこないことがあります — アプリのプラグインページから
> インストールしてください。

## 機能

| 区画 | すること | 裏で動く `asc` |
|---|---|---|
| **App & Bundle** | アプリを選び、ブラウザごとに記憶 | `asc apps list` |
| **Working directory** | セッションがどこで作業しているか: パス、ブランチ、`origin/main` との差、未コミットのファイル、そして**このコードがビルドできるか** — できないときは理由も | `git status --porcelain=v1 --branch`、`xcode-select -p` |
| **Build** | セッションの作業ディレクトリのコードをアーカイブし、`.ipa` に書き出してアップロード。バージョンとビルド番号は 2 つのフィールド | `asc xcode archive` → `asc xcode export` → `asc builds upload --wait` |
| **Builds** | 最新ビルドを 3 件ずつ、最下部にリリースビルドの固定行、`Internal` / `External` / `Release` タグ | `asc builds list` |
| **TestFlight** | ビルドを選び、グループを選び、*What to Test* を書いて送信 | `asc builds test-notes create`、`asc builds add-groups` |
| **Review** | ビルドを選ぶ。バージョンが公開済みなら `Reviewed`、そうでなければ readiness と阻害要因、`Submit for review` | `asc validate`、`asc versions create`、`asc review submit` |
| **Release** | 審査を通過したバージョンを公開 | `asc versions release` |
| **Skills** | 継承した `asc` スキルパックを報告し、必要ならインストール | `asc install-skills` |

パネルが描かないがモデルが使えるものもあります: 売上サマリ、analytics レポート要求、フェンス付きの
読み取り専用 `asc` argv 脱出口、そして `asc_hub` ツール経由のすべてのパネル操作。

知っておくと良い設計判断:

- **Build がビルドするのはファイルではなくディレクトリ。** 作業単位はセッションが見ているコードで、
  生成物は一時ディレクトリに置かれ、バージョンはビルド設定（`MARKETING_VERSION` /
  `CURRENT_PROJECT_VERSION`）として渡るので、プロジェクトファイルは決して書き換えません。
- **審査を通っていないビルドが通ったとは言わない。** 審査はバージョンに対して行われるので、パネルは
  「どのバージョンがこのビルドを載せているか」を尋ねます。TestFlight にだけ出たビルドは正しく
  「審査未提出」と表示されます。
- **更新ボタンは 1 つ**で、全区画をまとめて読み直します。各ステップは自分のビルドメニューを持ちます。
  「テスターに送る」と「審査に出す」は同じ一覧上での別の判断だからです。

## ワークフロー

```
作業ディレクトリ  →  Build  →  Builds  →  TestFlight  →  Review  →  Release
 ビルドできる？     アーカイブ  1 つ選ぶ   グループへ送信  Apple へ提出   ストア公開
                  書き出し
                  アップロード
```

どのステップも実際の `asc` 呼び出しで、パネルから始めてもモデルから始めてもゲートは同じです。

## 初回セットアップ

どちらも**ローカル動作**で、既定の `read-only` モードのまま完了できます — App Store Connect への書き込み
だけが `mode: write` を必要とします。

**1. `asc` エンジンをインストール。** パネルがまず検出し（`asc version`）、Homebrew
（`brew install asc`）または公式スクリプト（`curl -fsSL https://asccli.sh/install | bash`）でインストール
し、マスキング済みのログを見せます。

**2. App Store Connect API Key でサインイン。**
[App Store Connect → ユーザとアクセス → 統合](https://appstoreconnect.apple.com/access/integrations/api)で
キーを作り、**Key ID** と **Issuer ID** を控え、`AuthKey_XXXXXXXXXX.p8` を一度だけダウンロードして、
2 つの id と一緒にパネルへドロップします。Host は PEM を `0600` の一時ファイルに書き、
`asc auth login --private-key …` に渡してから削除します — 資格情報は `asc` が macOS Keychain に保管
します。サインインは**パネル専用**です: モデルは `CLIENT_ONLY` しか受け取らないので、資格情報の受け渡しは
人だけが行えます。

キーのロールができることを決めます（アップロード、TestFlight、提出には Admin か App Manager、売上
データにはレポート権限）。Apple がそれを強制し、コンソールは拒否を報告するだけで回避しません。全体の流れと
トラブルシューティングは [docs/ONBOARDING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ONBOARDING.md) にあります。

## 動作環境

| | |
|---|---|
| **ホスト** | プラグイン対応の DeepSeek Harness、`>=0.2.2-rc.1 <0.3.0`（`engines.dsh` に宣言。非対応ならプラグインマネージャがインストールを拒否します） |
| **Node** | 22 以上 |
| **OS** | macOS — 資格情報は Keychain、Build には Xcode が必要 |
| **Build** | フルの Xcode（`xcode-select -p` が `Xcode.app/Contents/Developer` を指すこと）。Command Line Tools だけの場合はパネルが *cannot build: Xcode is not installed* と表示し、他の機能はそのまま動きます |
| **エンジン** | `asc` 6.5.x、実行時に検出。コマンド面がそのまま互換性の契約です（[docs/UPSTREAM-ASC.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/UPSTREAM-ASC.md)） |
| **アカウント** | App Store Connect へのアクセス権を持つ Apple Developer Program のメンバーシップ |

## セキュリティ

- **Apple ID のパスワードは決して使いません。** App Store Connect API Key が JWT を署名します。プラグインを
  通るパスワードも 2FA もありません。
- **鍵素材は保存も記録もエコーもしません。** PEM は `0600` の一時ファイルにだけ存在し、`finally` で
  削除されます。出ていく文字列はすべてマスキングされ（秘密鍵ブロック、`ASC_*` の代入、`AuthKey_*.p8`
  のパス、JWT）、id は末尾 4 文字だけ残します。
- **既定は読み取り専用。** App Store Connect への書き込みには `mode: write` **と**
  `input.confirm: true` が必要で、モデルが起点なら Host の承認も要ります。エンジンのインストールと
  サインインはローカル動作なので `read-only` でも意図的に許可しています。
- **脱出口にはフェンスがあります。** 生の `run` は `auth`、`web`、`install-skills` と状態を変えるコマンド
  群を拒否し、`read-only` では子プロセスに `asc --read-only` が付きます。
- **テレメトリは無効。** 既定で `ASC_TELEMETRY_DISABLED=1` を付けて `asc` を実行します。
- **パネルの経路はセッションログもモデル履歴も書きません** — Fetch ルートであって、セッションコマンド
  ではありません。

## 設定

この行の `config` は Host が読み、型が違う値は安全な既定値に戻ります。
[docs/CONTRACT.md § Configuration](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/CONTRACT.md) と一致しています。

| キー | 既定値 | 意味 |
|---|---|---|
| `ascPath` | `asc` | 実行するバイナリ: `PATH` 上の名前か絶対パス。 |
| `profile` | `null` | `--profile` に渡す名前付きログイン設定。空なら `asc` の既定。 |
| `mode` | `read-only` | `READ_ONLY_MODE` で App Store Connect への書き込みを拒否。公開するには `write`。 |
| `requireApproval` | `true` | モデル起点の書き込み前に人へ確認。パネル自身の書き込みは確認ステップを使います。 |
| `timeoutMs` | `60000` | 通常の `asc` 呼び出しの制限時間。 |
| `longTimeoutMs` | `1800000` | `run` の制限時間とツール実行予算の上限。 |
| `maxOutputBytes` | `262144` | パネルやモデルへ返すログ/stdout テキストの上限。 |
| `telemetryDisabled` | `true` | `ASC_TELEMETRY_DISABLED=1` で `asc` を実行。 |
| `bypassKeychain` | `false` | `ASC_BYPASS_KEYCHAIN=1` で実行し、資格情報を設定ファイルに置く。非推奨。 |
| `defaultAppId` | `null` | 操作が `appId` を省略したときに使うアプリ id。 |
| `vendorNumber` | `null` | Sales and Trends ページの URL にある vendor number。売上サマリに必要。 |

> `mode` には二つの経路があります。パネル下部の `read-only mode` / `write mode` バッジがスイッチで、
> クリックすると**このセッションだけ**切り替わります（`mode.set`、ディスクには書きません）。次回起動でも
> 有効にするには、プラグインマネージャーでこの行の `config.mode` を `write` にするか、profile の
> `cordis.patch.yml` で上書きしてください。プラグインが profile パッチを書き換えることはありません。

パネルは選んだアプリ id を `localStorage`（`dsh.asc-hub.v1.app`）に置きます。Host は選択状態を
保存しません。

## 開発

コードは TypeScript です。2 つの `tsc` プロジェクトが `dist/` を作ります: Host は ESM と宣言ファイルに、
client は単一スクリプト（`module: none`）に — Harness のモジュールローダが実際に評価するその 1 ファイル
です。

```
src/index.ts            Host エントリ: apply(ctx, config)
src/host/*.ts           config、exec、asc の継ぎ目、engine、auth、ops、dispatch、rpc、tool、skills、
                        workspace、build、redact、そして types.ts（DSH が公開していない面）
src/client.ts           パネル: 状態ボタン、オンボーディング、コンソール
test/*.ts               host テスト、コンパイル後に dist/ を対象に実行
client/__smoke__.mts    client テストハーネス: ローダと同じ方法で dist/client.js を読み込む
```

```sh
npm run build      # dist/（host + client）
npm run check      # 4 プロジェクトの tsc --noEmit
npm test           # host テスト 61 件、dist/ 対象
npm run smoke      # client チェック 248 件、dist/client.js 対象
npm run verify     # 上記すべて
```

自分の checkout を Harness で動かすには: `plugin_manager` → `install_bundle` にこのディレクトリの絶対
パスを渡します — `link:` インストールで開発専用、その場でのアップグレードはできません。`src/**` を変えたら
`npm run build` をしないとパネルには出ず、Host 側はこの行を再インストールしてモジュール世代を読み直す
必要があります。規約、不変条件、モジュールマップは [AGENTS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/AGENTS.md)、
[docs/ARCHITECTURE.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ARCHITECTURE.md) にあります。

## 制限事項

- **Build にはフルの Xcode が必要です。** 無い場合、パネルは `cannot build` と理由を表示し、コンソールの
  残りはそのまま動きます。
- **売上と analytics は Host 操作だけで、カードはまだありません。** `sales.summary` と
  `analytics.reports` は実装済みでモデルから使えますが、パネルのカードは保留です。
- **月単位の売上と生の TSV エクスポートには対応していません**（`analytics sales --output` はファイル
  パスです）。
- **アップロードと待機は 1 つの反転する `busy` 状態**で、ストリーミングの進捗はありません。
- **フッタの更新表示は無効です**: `status.update` は現在ただの定数で、通知と操作は
  **Plugins → Installed（プラグイン → インストール済み）**が担当します。
- **この文書にスクリーンショットは載せません。** パネルは Harness のテーマで描画され、静止画はこの文章より
  早く古くなります。

## ドキュメント

| | |
|---|---|
| [docs/CONTRACT.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/CONTRACT.md) | ワイヤ契約: 転送、操作、ゲート、Hub 状態、エラーコード、マスキング、設定 — 正典 |
| [docs/ARCHITECTURE.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ARCHITECTURE.md) | パイプライン、モジュールマップ、ビルド |
| [docs/ONBOARDING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/ONBOARDING.md) | エンジン、API Key、キーのロール、トラブルシューティング |
| [docs/OPERATIONS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/OPERATIONS.md) | 各コンソール操作が実際に何を実行し、出力をどう読むか |
| [docs/UPSTREAM-ASC.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/UPSTREAM-ASC.md) | `asc` から何を継承し、アップグレードがどう流れるか |
| [docs/RELEASING.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/RELEASING.md) | 配布、発見、アップグレードのマトリクス、掲載チェック |
| [docs/WORKFLOW.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/docs/WORKFLOW.md) | 日々のリズム: いつビルドし、いつバージョンを上げ、いつ公開するか |
| [AGENTS.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/AGENTS.md) | このリポジトリで作業するエージェント向けの不変条件とモジュールマップ |

## ライセンス

プラグインは MIT ライセンスです — [LICENSE](https://github.com/sleep9ull/dsh-asc-hub/blob/main/LICENSE) を参照。`asc` CLI も MIT（Copyright (c) 2026
Rudrank Riyam）で、別途インストールされこのプラグインには同梱されません —
[THIRD_PARTY_NOTICES.md](https://github.com/sleep9ull/dsh-asc-hub/blob/main/THIRD_PARTY_NOTICES.md) を参照。

このプロジェクトは独立した非公式のものです。Apple Inc. との提携、承認、後援関係はありません。
App Store Connect、TestFlight、Xcode Cloud、Apple は Apple Inc. の商標です。
