# Canon

古文（助動詞・助詞・敬語・和歌・一橋二次向け近代文語文）と漢文（再読文字・句法・助字）を統合した学習リファレンス＋演習・進捗グラフPWA。

## 構成
- バックエンド: FastAPI (`main.py`, `database.py`)
- DB: 環境変数 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` があれば Turso (`libsql`)、未設定ならローカル `data.db` (SQLite)
- フロントエンド: `static/index.html`, `static/style.css`, `static/app.js`, `static/changelog.js`, `static/data/*.js`
- デプロイ: Vercel (東京リージョン `hnd1`, `vercel.json`)

## ローカル起動
```powershell
uvicorn main:app --reload --port 8010
```
- 起動前に `Get-NetTCPConnection -LocalPort 8010 -State Listen` でポート空きを確認する（FocusGuardの8765・Compassの8000と被らないポートを使う）。

## データ再抽出
デスクトップの元HTML（`古文助動詞・助詞まとめ.html` / `漢文句法まとめ.html`）を更新した場合は以下で `static/data/` を再生成する。
```powershell
python scripts/extract_data.py
```

## 共通ルール
- アプリ名: `Canon`（英語1語・画面内絵文字なし・Lucide線画アイコン）
- テーマ: ライト/ダーク/自動切替
- ショートカット: `Alt+1`〜`Alt+4`（古文/漢文/クイズ/グラフ）、`,`（設定）、`/`（検索）、`?`（一覧）、`Esc`（閉じる）
- 新機能デプロイ時は `static/changelog.js` の `RELEASES` 先頭にエントリを追加する。
