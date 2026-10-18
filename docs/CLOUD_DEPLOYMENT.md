# 公開デモ

URL: https://democommerce-lab.democommerce.workers.dev

Cloudflareアカウント: 2004atcit@gmail.com
Worker: democommerce-lab
Supabase: dmagegescrocnfwffxog / Tokyo

ユーザーの指定により、Cloudflare Accessを使用しない一般公開です。データ取得にはSupabaseのA/Bログインが必要です。新規登録は無効化済み。Labは固定4注文と専用プロジェクトに限定し、通常テーブルのRLSは維持しています。

クラウドのパスワードはローカルとは別です。Git対象外の `.fixtures/cloud-test-users.env` から確認して、チームのパスワード管理ツールで共有してください。

操作: Bでログイン → 注文履歴 → Aの注文：通常API（404） → Aの注文：Lab API（架空情報と免許証画像を表示） → JSON保存。

デプロイ設定例は `wrangler.public.example.json`。Supabase秘密キーはWorker Secretとして登録済みで、クライアントへ配信しません。デプロイ用のクリーンなcheckoutで設定例をwrangler.jsoncにコピーしてnpm ci、npm run build、npx wrangler deployを実行します。ローカルデモ用の.dev.varsは持ち込まないでください。

以前の2004tomita側Workerは404固定・Lab無効のままです。チームには上記の新URLだけを共有してください。
