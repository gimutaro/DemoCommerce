# 検証記録（2026-10-18）

基点：DemoCommerce `04a3cf4`。この作業コピーは未commit・未pushです。

| 検証 | 結果 |
|---|---|
| TypeScript | 成功 |
| ESLint | 成功 |
| Vitest | 32件成功。通常／Lab比較、未知ID拒否、Access署名・issuer・audience・期限を含む |
| Vite build | client / Workerとも成功 |
| PC／モバイル画面E2E | 14件成功。うち新規顧客画面は通信stubで確認 |
| 実ローカルSupabase E2E | PC／モバイル2件成功。実ログイン・本人の顧客画像・他人の注文404・ログアウト |
| pgTAP（実ローカルDB） | 76件成功。注文・プロフィール・顧客情報のRLS／GRANT |
| fixtures:verify | 実Auth／REST経由のA/B隔離、本人の免許証画像、他人の顧客情報非表示を確認 |
| クラウドLab | 初回時点では未実施。現在の公開環境の検証は下記を参照 |
| LeakReplayからの実接続 | 未実施。現行mainはMock専用 |

初回の実認証E2Eは5173番の既存Mockサーバーを参照し失敗しました。`E2E_PORT=5187`で専用サーバーを起動して再実行し、両画面で成功しました。別の開発作業と競合する場合は`E2E_PORT`を指定してください。

`demo-preview.png`は架空レスポンスを利用した画面見本です。実クラウドへの侵入成功の証拠ではありません。実環境でのLab有効化にはTEAM_DEMO_GUIDEの設定が必要です。

WindowsのSupabase起動・設定スクリプトもNode経由のCLI起動とDocker named pipeへ対応しました。実DBにはこの作業で作成したローカル`democommerce`スタックのみ使用しています。

## ローカルLab追加検証

`dev:demo`を追加。実ローカルSupabaseのBログインで、通常A注文404／Lab A注文200・架空氏名と免許証画像の表示をPC・モバイル2件で確認。Vitestは33件成功、型・lint成功。この時点ではクラウドLab未接続。現在は下記の公開環境で検証済みです。

## 公開環境の検証（2026-10-18）
- URL: https://democommerce-lab.democommerce.workers.dev
- 通常HTTPSの /api/health: 200、lab / supabase。
- 公開サイトの実Supabase Bログイン→A通常注文404→A Lab注文の架空氏名・画像表示: PC/モバイルとも成功（2 passed）。
- 画像: docs/cloud-demo.png（公開サイト実データの画面）。
- 公開モード追加後: typecheck、lint、build成功、unit 34 passed。


## 架空顧客100件の追加（2026-10-18）
専用クラウドSupabaseの public.demo_customers に100件を追加し、合計102件です。全件に氏名、生年月日、住所、郵便番号、電話、メール、勤務先、無効な免許証番号、SAMPLE画像があります。実在の個人情報は含みません。
追加メール: customer-001@example.test ～ customer-100@example.test。追加Authレコードはログイン禁止のデータ用です。A/Bログインは従来どおりです。通常のRLSは維持し、公開Lab画面の対象は既存A/B・4注文のままです。
再現: migration 20261018020000_customer_batch.sql 適用後、専用環境のサーバーキーをローカル設定し、npx tsx scripts/provision-customer-batch.ts。再実行は同じ100件をupsertします。スクリプトは専用プロジェクトURLに固定しています。
検証: API再読込で102件、追加100件すべてsynthetic=trueかつSAMPLE画像あり。既存 fixtures:verify 成功。
