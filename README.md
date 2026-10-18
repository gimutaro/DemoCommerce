# DemoCommerce — 日々に、いいもの。

> **ハッカソン用追加実装（2026-10-18）**：注文閲覧、架空顧客情報・免許証サンプル、隔離Lab比較、JSON保存を追加しました。最新の構成・チーム共有・セットアップ・LeakReplay入力は **[TEAM_DEMO_GUIDE.md](TEAM_DEMO_GUIDE.md)** を参照してください。以下のM0/M1説明は元の基盤実装の記録で、今回追加した注文/Labの状態は同ガイドが優先です。

LeakReplayの検査対象として開発する架空の通販サイトです。React / Vite / TypeScriptの画面とHono APIを、Cloudflare Vite pluginを通して同じWorkersランタイムで動かします。認証とDBはSupabase Auth / PostgreSQLを使用します。

実装範囲は **M0 + M1** です。ローカルSVG画像付きの商品10点、JPY価格、検索・カテゴリ、商品詳細、ログイン、本人プロフィール、スマホ対応、DB migration / seed / RLS、A・Bテストデータ作成を含みます。カート・注文作成・注文履歴UI/APIはM2、意図的なLab脆弱性はM3の対象です。クラウドへのデプロイは行っていません。

## 画面を起動する

Node.js **24**（`.node-version`、最低22.12）とnpmを使用します。

```bash
npm ci
npm run dev
```

`http://localhost:5173` を開きます。初期状態は `APP_ENV=local` / `DATA_MODE=mock` / `LAB_ENABLED=false` で、外部アカウントやDockerなしで商品を閲覧できます。Mockではログインフォームを無効にし、架空の認証成功を作りません。

`npm run build` でビルドし、`npm run preview` で `http://localhost:4173` を確認できます。ビルド時にはLab無効・Mockがローカル限定であることを検査します。

## ローカルSupabaseとA・Bアカウント

Docker Engineが起動し、コンテナを実行できることが前提です。Supabase CLIはnpm依存として導入されます。

ディスク容量が限られるクラウド環境では、先に後述のキャッシュ設定と `SUPABASE_USE_SLIM_IMAGES=true` を適用してください。既定ECRを利用できない環境では `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` も設定します。

```bash
npm run db:start
npm run db:reset
npm run db:configure
npm run fixtures:provision
npm run db:test
npm run fixtures:verify
npm run dev
```

- `db:start` はDB・Auth・RESTを使う構成で起動し、Studio、Storage、Realtimeなど今回不要なコンテナを除外します。軽量公式イメージと書き込み可能なCLI保存先を既定で選択します。
- `db:reset` は **`supabase db reset --local`** を実行し、ローカルDBを作り直してmigrationと商品seedを適用します。既存のローカルデータも削除します。リモートDBはリセットしません。
- `db:configure` は実行中のローカルCLI設定から、公開接続情報を `.dev.vars`、fixture用サーバーキーを `.env.local` に保存します。両方Git対象外・権限0600で、値は表示しません。既存ファイルがリモート環境を指す場合は上書きを拒否します。**設定後はdevサーバーを再起動**してください。
- `fixtures:provision` は `buyer-a@example.test` / `buyer-b@example.test` と、各2件の固定ダミー注文・各4件の明細を作ります。未指定のパスワードは安全に生成し、Git対象外の `.fixtures/test-users.env` に0600で保存します。再実行時は同じテストデータを更新します。
- `db:test` はpgTAPでGRANT・RLSを検査します。`fixtures:verify` は実際のAuth / RESTを通し、公開商品、本人プロフィール・注文・明細、他人のデータの非表示、匿名の拒否、直接注文書き換えの拒否を確認します。

ブラウザではテストメールとローカルの資格情報管理ファイルから取得したパスワードでログインします。値をチャット・ログ・スクリーンショットへ貼り付けないでください。注文データだけ初期化する場合は `npm run fixtures:reset`、停止は `npm run db:stop` です。DBリセット後は `fixtures:provision` を再実行します。

サンドボックスで既定のキャッシュ先に書けない場合は、インストールや起動の前に次を設定できます。

```bash
export NPM_CONFIG_CACHE="$PWD/.cache/npm"
export XDG_CONFIG_HOME="$PWD/.cache/config"
export SUPABASE_HOME="$PWD/.cache/supabase"
export SUPABASE_TELEMETRY_DISABLED=true
export WRANGLER_SEND_METRICS=false
export SUPABASE_USE_SLIM_IMAGES=true
```

クラウド環境では、標準PostgreSQLイメージがディスクを大きく消費するため、`SUPABASE_USE_SLIM_IMAGES=true` を `db:start` より前に設定してください。公式CLIが固定digestを指定する `ghcr.io/supabase/cli/` の軽量公式イメージを使います。コンテナ取得先の既定ECRがネットワーク規則で拒否される場合は、公式CLIが対応する `export SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` でDocker Hubへ切り替えられます（Kongなどの取得に使用）。Dockerと両取得先のネットワークアクセスが必要です。TLS検証などは無効化しません。

Supabase CLI 2.121の軽量Authのヘルスチェックは、BusyBox `wget`が`NO_PROXY`を無視する環境でlocalhostのプローブをプロキシへ送り、誤って失敗します。`db:start`のヘルパーは該当する既知のプローブだけを、localhost限定で`wget -Y off`を使う形に補正します。Authのイメージdigest・設定・外部通信用プロキシを維持してステートレスなAuthコンテナを再作成し、DB/Auth/Gatewayすべてのhealthy状態と実際のAuth HTTP応答を確認してから成功します。設定や秘密値はログに出しません。

## 設定とAPI

| ファイル・変数 | 用途 |
| --- | --- |
| `.dev.vars.example` → `.dev.vars` | Worker用ローカル設定。`APP_ENV=local`、`LAB_ENABLED=false`、`DATA_MODE=mock` または `supabase` |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Supabaseモードの商品取得・認証。公開可能なキーのみ |
| `.env.example` → `.env.local` | fixture CLI専用設定。`SUPABASE_SECRET_KEY` はここで管理 |
| `.fixtures/test-users.env` | 生成したローカルテストパスワード。`TEST_BUYER_A_PASSWORD` / `TEST_BUYER_B_PASSWORD` 環境変数でも指定可能（12文字以上） |

Workerにサーバー秘密キーは不要です。ブラウザは `/api/config` から公開接続情報だけを取得します。公開キー設定に `sb_secret_` または旧形式の `service_role` キーを指定した場合は拒否します。秘密キーに `VITE_` 接頭辞を付けないでください。未設定または不正なSupabase接続はエラーになり、Mockへ暗黙に切り替えません。

| API | 動作 |
| --- | --- |
| `GET /api/health` | 起動状態とデータモード |
| `GET /api/config` | 公開設定のみ |
| `GET /api/products` / `GET /api/products/:slug` | 有効商品の一覧・詳細、不存在は404 |
| `GET /api/me` | Bearerトークンを `auth.getUser(token)` で検証し、RLSを通した本人プロフィールのみ返す |

`products` は有効商品の匿名SELECTだけを許可し、`profiles` は本人のみSELECT・表示名更新、`orders` / `order_items` は本人のみSELECTを許可します。一般クライアントの注文書き込み権限は付与しません。通常の注文APIはM2で実装するため、現時点では未定義APIとして404です。`/lab`・`/lab/*`・`/api/lab/*` も常に404です。

## 検証コマンド

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

PlaywrightはPC / モバイルで商品一覧・画像・絞り込み・詳細・404・エラー再試行・Lab非公開などを検査します。`/usr/bin/chromium` があれば使用し、それ以外は `npx playwright install chromium` で導入するか `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` に既存ブラウザを指定してください。

実認証のE2EにはローカルSupabase設定とfixture作成を終え、devサーバーを再起動してから次を実行します。通常実行では実認証テストを明示的にskipします。

```bash
E2E_WITH_SUPABASE=true npm run test:e2e
```

認証情報の記録を避けるため、Playwrightのtrace・video・自動スクリーンショットは無効です。DB検証は `npm run db:test` / `npm run fixtures:verify` を使用します。将来のM2〜M5を含む `TEST_MATRIX.md` 全体の完了を意味するものではありません。

## 構成・参照資料

- `src/react-app/`: React画面・スタイル、`public/`: ローカルSVG画像
- `src/worker/`: Hono API・設定検証、`src/shared/`: 商品・型・固定fixture
- `supabase/migrations/`, `supabase/seed.sql`, `supabase/tests/`: DB・seed・pgTAP
- `scripts/`: 接続設定、テストデータ作成・初期化・検証、ビルド時Lab検査
- `CODEX_START.md`, `AGENTS.md`, `SPEC.md`: 実装範囲と固定条件
- `TEST_MATRIX.md`, `DEPLOY_CLOUDFLARE_SUPABASE.md`, `integrations/leakreplay-fixtures.json`: 将来の検査・外部設定・LeakReplay統合契約

Cloudflareの現行構成に合わせて [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/) とWorkers Static Assetsを使用しています。CLIでローカル接続設定を読み取り、fixture用秘密キーをWorkerから分離しました。Supabase公開ドキュメントへ到達できない環境では、[公式CLIソース](https://github.com/supabase/cli)で設定・実行オプションを確認しました。DB権限は[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、トークン検証は[`auth.getUser`](https://supabase.com/docs/reference/javascript/auth-getuser)、ローカルDB操作は[CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows)を参照してください。

実在顧客の情報・住所・カード番号・実決済・実配送・メール送信を扱いません。秘密キー、パスワード、認証トークンはGit・UI・ログ・スクリーンショット・LLM入力に含めないでください。将来の意図的な不備は、別Supabaseプロジェクトの合成データを使用し、Cloudflare AccessでWorker全体を保護した専用Labに限ります。外部へのデプロイには別途明示的な承認と外部設定が必要です。
