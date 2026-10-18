# DemoCommerce：チーム共有・デモ実行ガイド

## 今回の成果物

DemoCommerceの既存ストアに、Supabaseに保存する架空の氏名、生年月日、住所、郵便番号、電話、メール、勤務先、免許証番号、免許証SVG画像を追加しました。画像は「SAMPLE / 架空・無効」と明示した独自デザインで、実際の証明書として使用できません。画像もDBの`demo_customers.license_svg`に保存するため、Storage bucketは不要です。

通常APIはユーザーJWTとRLSで本人だけを許可します。専用LabのGETだけが、固定4注文に限定して所有者確認を省略し、他人の情報が表示される認可不備を再現します。これはSupabase自体の脆弱性ではなく、サーバー秘密キーを使うアプリ側の認可不備です。RLSを無効化しません。

実装範囲は注文閲覧、架空顧客情報、Lab比較とJSON保存です。カート・新規注文・決済は今回追加していません。クラウド環境の作成と2004atcit側へのデプロイは完了しています。公開URLは https://democommerce-lab.democommerce.workers.dev です。GitHubへのpushは未実施です。詳しくは [公開設定](docs/CLOUD_DEPLOYMENT.md) を参照してください。

## 現在の公開環境

Cloudflare Accessなしで全員がストアを閲覧できます。顧客デモにはA/Bアカウントのログインが必要です。クラウド用パスワードは `.fixtures/cloud-test-users.env` に保存済みで、ローカル用とは別です。ZIPにはパスワードを含めません。再デプロイは `wrangler.public.example.json` と `docs/CLOUD_DEPLOYMENT.md` を使用します。以下のAccess手順は、将来チーム限定公開へ切り替える場合の参考です。

## チーム内で共有するもの

| 項目 | 共有方法 |
|---|---|
| このコード、migration、操作手順、テスト結果 | GitHubの作業ブランチ／PR |
| デモURL、SupabaseプロジェクトURL、Access Team Domain/AUD、担当者 | チームの設定台帳。未作成の値は未設定と記載 |
| テストメール | A: `buyer-a@example.test`、B: `buyer-b@example.test` |
| Aの注文ID | `2000000a-0000-4000-8000-000000000001` |
| Bの注文ID | `2000000b-0000-4000-8000-000000000001` |
| パスワード、Supabase secret、Access service token | チームのパスワードマネージャー等で必要な担当者に共有。Git/チャット本文/スライドには入れない |
| 発表用画像・JSON | 架空データのみ。認証情報を含まない画面から保存 |

コードのレビュー後、チームの通常フローでブランチにcommit/pushしてください。`.env.local`、`.dev.vars`、`.fixtures/`、`node_modules/`は共有しません。

## ローカルの通常画面（アカウント不要で開始）

### ローカルで情報流出デモまで動かす

Supabase起動・fixture投入後に`npm run dev:demo`を実行し、`http://127.0.0.1:5188/login`を開きます。
`buyer-b@example.test`と`.fixtures/test-users.env`の`TEST_BUYER_B_PASSWORD`でログインしてください。
通常のA注文は404、LabのA注文は架空顧客情報と免許証画像を表示します。以下の「発表当日の操作」がこのローカルでも利用できます。

このモードはVite開発時のみ、127.0.0.1のSupabaseのみ、localhost/127.0.0.1宛のリクエストのみ許可します。Supabaseの実ユーザー認証は必須です。インターネットへトンネル公開しないでください。クラウドLabのAccess認証には影響しません。
`npm run db:configure`で通常モードに戻せます。ローカルデモ有効時は`npm run build`を拒否します。

Node 24推奨、最低22.12。リポジトリ直下で実行します。

```sh
npm ci
npm run dev
```

`http://localhost:5173`はカタログMockです。ログインや流出を実認証済みとして表示しません。

Docker Desktopを起動したローカルSupabaseの手順：

```sh
npm run db:start
npm run db:reset
npm run db:configure
npm run fixtures:provision
npm run db:test
npm run fixtures:verify
npm run dev
```

`db:reset`はこのローカルDBを消去します。既存データが必要ならバックアップしてから実行してください。リモートには実行しません。パスワードは`.fixtures/test-users.env`へ生成されます。設定変更後はdevサーバーを再起動します。ログイン後「注文履歴・お客様情報」から本人のデータを確認できます。ローカル通常環境ではLabは404です。流出比較には上記`dev:demo`を使います。

## デモ専用Supabaseを新規作成する担当者

1. 実データを入れない専用プロジェクトを作り、URL、publishable key、secret keyを取得します。
2. Supabase SQL Editorで`supabase/migrations/20261018000000_initial.sql`、`20261018010000_synthetic_customers.sql`の順に実行します。既存本番DBには適用しません。
3. `.env.example`を`.env.local`へコピーし、次を設定します。秘密値は各自のローカルファイルのみです。

```dotenv
APP_ENV=lab
LAB_ENABLED=true
SUPABASE_URL=<専用プロジェクトのhttpsオリジン・末尾スラッシュなし>
SUPABASE_PUBLISHABLE_KEY=<publishable key>
SUPABASE_SECRET_KEY=<secret key>
FIXTURES_ALLOW_REMOTE=true
FIXTURES_SYNTHETIC_ONLY=true
FIXTURES_ALLOWED_SUPABASE_URL=<SUPABASE_URLと同じ値>
```

4. `npm run fixtures:provision`で商品10件、A/B、注文4件、架空顧客2件と画像を作成します。Auth Admin APIで作成するので確認メールは送りません。パスワードの保存先は上記と同じです。
5. 以降のprovision再実行はA/Bのパスワードとfixtureを更新します。既存の生成パスワードファイルを保管し、チームで意図せずパスワードを変更しないよう担当者を決めてください。

## CloudflareのLab環境を作る担当者

1. 専用Workerと独自ホストを準備し、Worker全体をCloudflare Accessでチームメンバーだけに許可します。`workers.dev`とpreviewは現在の設定どおり無効を維持します。公開前にAccess側の保護も準備します。
2. `lab-settings.example.json`の値を実値に置換し、`wrangler.jsonc`の`vars`に設定します。`SUPABASE_URL`と`LAB_SUPABASE_URL`は同一の専用URLです。`ACCESS_TEAM_DOMAIN`は`https://チーム名.cloudflareaccess.com`、`ACCESS_AUD`はAccessアプリのAudienceです。末尾スラッシュを付けません。
3. `SUPABASE_SECRET_KEY`だけは`vars`に書かず、`npx wrangler secret put SUPABASE_SECRET_KEY`の対話入力で登録します。
4. ローカル用`.dev.vars`がある場合はLabビルドで混ざらないよう別のクリーンなcheckoutで`npm ci`、`npm run typecheck`、`npm test`、`npm run build`を実行します。
5. チームで公開設定をレビューしてから`npx wrangler deploy`。必要に応じてCloudflare側で低いレート制限を適用します。アプリは固定ID・1注文ずつのGETに限定していますが、分散レート制限はインフラ側の設定が必要です。
6. 認証なしのトップ・API・assetが拒否されること、AccessありでA/Bがログインできることを確認します。Worker自身でもAccess JWTの署名・issuer・audience・期限を検証します。設定不足は404、Access未検証は403です。

公式資料：[Access JWT検証](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 発表当日の操作（約3分）

1. 公開ストアの`/login`を開く。Aのメールと共有ストア内のパスワードでログイン。
2. マイページ→注文履歴→Aの注文。氏名・住所・生年月日・免許証サンプルを紹介。
3. マイページでログアウトし、Bでログイン。
4. 注文履歴の「Aの注文：通常API」をクリック。HTTP 404で情報が見えないことを確認。
5. 「Aの注文：Lab API」をクリック。同じA注文が表示され、「認可不備を再現：他の顧客の情報を取得しました」が出る。
6. 「取得した架空データをJSON保存」で情報取得の証拠を保存。JSONにはサンプル画像のSVGも含まれます。
7. 説明：「ログイン確認だけでは不十分。サーバー側の所有者チェックを省略すると、秘密キーを持つアプリがRLSを迂回してしまう」。

## LeakReplay側に入力する内容と現在の制限

確認したmainでは「ローカルデモを開く」→「プロジェクトを追加」のリポジトリ名に **`gimutaro/DemoCommerce`** と入力します。フルURLではなくowner/repo形式です。

ただし現在のLeakReplayはM0/M1のMock実装です。「ローカル検証環境」は`http://localhost:4174`で読み取り専用、許可パスは`/items/`固定です。リポジトリ名を変えてもDemoCommerceへの実通信や実コード走査にはなりません。Mockのconfirmedをこの実サイトの検査結果として発表しないでください。

実接続を担当するチームメンバーには以下の契約を共有してください（`integrations/leakreplay-fixtures.json`も参照）。

| 項目 | 実接続時の設定 |
|---|---|
| repo | `gimutaro/DemoCommerce` |
| base URL | `https://democommerce-lab.democommerce.workers.dev` |
| A/B認証 | Supabase Auth。資格情報はTool Gatewayが保持 |
| Access | 現在の公開環境では不要 |
| 正常比較 | Bの`GET /api/orders/2000000a-0000-4000-8000-000000000001` →404 |
| 再現 | Bの`GET /api/lab/orders/2000000a-0000-4000-8000-000000000001` →200 |
| 画面証拠 | `/lab/orders/2000000a-0000-4000-8000-000000000001` |
| 証拠マーカー | `DEMO_ONLY_ORDER_A_1`、`SAMPLE / 架空・無効` |

LeakReplay本体への実HTTP Gateway、実セッション、allowlist、証拠収集の実装はこの変更に含めていません。

## 検証

`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`、`npm run test:e2e`。
顧客UIのE2Eは通信をstubした画面検証であり、実DBでの流出確認とは区別します。`docs/demo-preview.png`も合成テストレスポンスによる見本です。実DBの権限確認には`npm run db:test`、接続後のA/B操作が必要です。


## 架空顧客100件の追加（2026-10-18）
専用クラウドSupabaseの public.demo_customers に100件を追加し、合計102件です。全件に氏名、生年月日、住所、郵便番号、電話、メール、勤務先、無効な免許証番号、SAMPLE画像があります。実在の個人情報は含みません。
追加メール: customer-001@example.test ～ customer-100@example.test。追加Authレコードはログイン禁止のデータ用です。A/Bログインは従来どおりです。通常のRLSは維持し、公開Lab画面の対象は既存A/B・4注文のままです。
再現: migration 20261018020000_customer_batch.sql 適用後、専用環境のサーバーキーをローカル設定し、npx tsx scripts/provision-customer-batch.ts。再実行は同じ100件をupsertします。スクリプトは専用プロジェクトURLに固定しています。
検証: API再読込で102件、追加100件すべてsynthetic=trueかつSAMPLE画像あり。既存 fixtures:verify 成功。
