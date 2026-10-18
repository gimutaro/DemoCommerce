# DemoCommerce 公開攻撃Lab

ユーザー指定の意図的な脆弱性デモ。公開UIは脆弱版のみ。
URL: https://democommerce-lab.democommerce.workers.dev/login
ワークベンチ: https://democommerce-lab.democommerce.workers.dev/lab/workbench

既存の架空顧客PR #1を土台にしています。PR #1のSupabase顧客102件とは別に、攻撃用SQLite内にも架空顧客102件を生成します。件数が同じでも接続先は別です。SQLiteは毎リクエスト作り直し、外部DB・実ファイル・外部ネットワークへ接続しません。

## 10ケース

| ケース | 攻撃面 | 結果 |
|---|---|---|
| SQLI-LOGIN | ログインフォーム | 文字列連結した実SQLiteの条件を変更してLabへログイン |
| SQLI-SEARCH | 顧客メール検索 | 条件変更・UNIONで架空顧客の情報を取得 |
| IDOR | 顧客ID | 所有者でない顧客情報を取得 |
| ROLE-TAMPERING | 管理者エクスポートのrole | 一般ユーザーが架空顧客102件を取得 |
| EXCESSIVE-DATA | プロフィールAPI | 住所、生年月日、架空メモまで返却 |
| PATH-TRAVERSAL | 仮想ファイル名 | reports外の架空バックアップを取得 |
| WEAK-PASSWORD | デモ管理者 | admin@example.test / admin でログイン |
| PUBLIC-BACKUP | 公開バックアップ | 認証なしで架空顧客102件を取得 |
| DEBUG-CONFIG | デバッグAPI | デモ専用パスワード、無効な見本キー、テーブル名を表示 |
| REFLECTED-XSS | HTML直接出力 | sandbox内でJavaScriptが実行され、成功マーカーを表示 |

`SQLI-LOGIN`と`SQLI-SEARCH`は同じSQLi分類の異なる入口です。「10種類の異なる脆弱性分類」ではなく10の攻撃ケースです。パストラバーサルは仮想ファイルだけで再現します。

## 動かす

通常のLabユーザーは buyer-a@example.test / demo-password、buyer-b@example.test / demo-password。ここに記載するものは全て公開用のデモ資格情報で、Supabaseの本当のA/Bパスワードとは無関係です。

ログイン画面の「SQLiの入力例を入れる」→「ログインを検証する」で実SQLiteを使った認証突破を確認できます。顧客検索・管理者エクスポート・バックアップの結果はJSON保存できます。全件にsynthetic=1、example.test、架空の住所を使用します。実在顧客を入力しないでください。

公開バックアップ、設定漏洩、XSSはログイン不要です。その他は署名されたLab専用セッションが必要です。セッションは30分、通常のSupabase認証とは共有しません。

XSSのJavaScriptは隔離フレーム内のみ。CSP sandboxとiframe sandboxの両方を使用し、cookieアクセス、外部通信、親画面DOMアクセス、トップ画面への遷移を許可しません。サーバーのコード実行、任意URLへのSSRF、実ファイルの読み取り、実DBへの書き込みはありません。

## 有効化・デプロイ

`wrangler.attack-lab.json`は既存の専用公開Workerを指定します。`ATTACK_LAB_ENABLED=true`、`LAB_SYNTHETIC_ONLY=true`、既存Labの公開設定と完全一致ホストを要求します。`ATTACK_LAB_SESSION_SECRET`は32文字以上のランダム値をWorker Secretに登録してください。設定ファイル、ソース、ブラウザーに秘密値を入れません。

ビルドしてから `wrangler deploy --config wrangler.attack-lab.json`。通常の `wrangler.jsonc` はLab無効のままです。ローカル開発は `.dev.vars` に APP_ENV=local / DATA_MODE=mock / LAB_ENABLED=false / LAB_SYNTHETIC_ONLY=true / ATTACK_LAB_ENABLED=true / ATTACK_LAB_SESSION_SECRET を設定し、localhostのみで実行できます。

SQLiteのWasmは固定したnpm依存からWorkerへ同梱し、URLから取得・動的コンパイルしません。Worker用バンドルではEmscriptenのスクリプト位置判定だけを定数化します。最大入力4KiB、SQL各入力256文字、取得102行、SQLite heap 4MiBで制限します。

## 検証

`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。追加テストでは実SQLiteのOR・UNION・コメント、通常ログイン、SQLパラメーター化、IDOR、権限改ざん、バックアップ、設定漏洩、XSSの隔離、Lab設定不備、入力上限、セッション署名を確認します。

API内部の `mode=fixed` は回帰検証用です。公開UIには切替を表示しません。

LeakReplayの現行Computer Useはログイン・フォーム送信・攻撃を禁止しています。このLabの公開だけではLeakReplayが自動で攻撃するようにはなりません。
