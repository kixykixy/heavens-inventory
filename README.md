# ヘブンズ在庫管理アプリ

## セットアップ

```bash
# 依存パッケージをインストール
npm install

# 開発サーバーを起動
npm start
```

## Vercelにデプロイする方法

1. [GitHub](https://github.com)にこのリポジトリをアップロード
2. [Vercel](https://vercel.com)にサインアップ
3. 「New Project」→ GitHubリポジトリを選択
4. 「Deploy」をクリック
5. 発行されたURLをスマホのホーム画面に追加

## 機能

- パスワード保護（muddy）
- 在庫管理（180件以上対応）
- 店舗出庫（ヘブンズキッチン・ブースト・マディー）
- Googleスプレッドシート連携
- CSVインポート・エクスポート
- スマホ対応
- 10人でリアルタイム共有

## データ保存

- **Claudeで使う場合**：Claudeストレージに自動保存・共有
- **Vercelで使う場合**：ブラウザのlocalStorageに保存（各端末で個別）

## 注意事項

Vercelでデプロイした場合、データはブラウザのlocalStorageに保存されます。
複数人でリアルタイム共有するには、FirebaseやSupabaseなどのデータベース連携が必要です。
