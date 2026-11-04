# AGENTS.md

天気図よみ：架空の天気図（等圧線・高気圧・低気圧・前線）を読んで、季節・風の強さ・風向き・天気を当てる1日5問のクイズ。`index.html` と `gen.js`（天気図と問題の作り方）・`japan.js`（日本の形）を GitHub Pages で公開する。

## 準備（最初に一度）

```bash
bash scripts/setup.sh   # Node.js（版は .nvmrc）を確かめ、検査の依存とブラウザを入れる。何度実行してもよい
```

## push する前の確認

```bash
node qa/run.mjs   # 風と気圧の向き（北半球）・問題の作り方（5種類×1500問、答えを天気図から計算し直す）・5問の組み方（1年分）・答える・続きから・上級・読めた数・Ko-fi・スマホ幅・PWA（CI の QA と同じ）
```

## このリポジトリの決まり

- 天気図は架空。実際の天気・予報として出さない（遊び方と README に書く）。形は本物によくある型（冬・夏・梅雨・春・秋）を `gen.js` の `makeMap` に置く。
- 風は `gen.js` の `wind`：気圧の傾きから等圧線に沿う向きを出し、低気圧の側へ30度まわす（北半球）。高気圧は時計回りに吹き出し、低気圧へ反時計回りに吹き込む。強さは気圧の傾き。向きを変えるときは気象庁などの一次資料で確かめ、QA の東西南北の見本も直す。
- 天気の答え（`weather`）：冬型は日本海側（`SEA_J`）が雪・太平洋側（`SEA_P`）が晴れ。ほかは低気圧・前線に近いと雨、遠いと晴れ。答えはどれも天気図から計算し、手で書かない（QA が計算し直す）。
- 問題を作るとき、答えが迷う所（風が弱すぎる・2地点の強さが近い・4択に45度となりの方角）は出さない（QA が見る）。
- 今日の5問は「季節・風の強さ・風向き・天気・天気」、上級は「風向き（8方位）・風の強さ・風向き・天気・天気」で説明は結果でまとめて出す。日本時間の日付から作る種（`seedOf`）で決まり、だれでも同じ。`Math.random()` は練習の問題の種だけ（QA が数を見る）。`gen.js` を変えると過去の日の問題も変わるので、変えた PR に一言書く。
- 点は正解の数（n/5）。時間制限は付けない。今日の5問・上級は1日1回で、途中で閉じても答えた問題の次から。途中経過はモードごとに分けて保存し（`runs.d`・`runs.h`・`runs.p`）、練習で今日・上級の途中を消さない。答えを入れる前に、保存した進み具合が画面と同じ問題か確かめる。記録は保存の前に読み直す。保存に失敗したあとは、途中経過を時刻でなく進み具合で選び、正解の数は多いほうを残す（shared-workflows `incidents/2026-11-04-daily-game-save-gaps.md`）。
- 幅320pxでも地図の字は9px以上（QA が見る）。
- 共有は遊ぶ人が押したときに開くリンク（X・LINE・Web Share・コピー）だけ。シェアの文に地名・答えを出さない（🟩正解・🟥まちがい）。
- 文字は少なめ・一画面一問。お笑いの言葉は入れない（QA が見る）。ほかの作品の名前・キャラ・見た目は使わない。
- 感想は「感想を送る」から GitHub の Issue フォーム（`.github/ISSUE_TEMPLATE/feedback.yml`、ラベル「感想」）を開くだけ。項目は shared-workflows の `template/.github/ISSUE_TEMPLATE/feedback.yml` と同じにし、名前・メールは聞かない。週1で shared-workflows `routines/game-feedback.md` が読んで直す。
- 応援は Ko-fi（https://ko-fi.com/satouaaaaa）へのただのリンクだけ。今日の5問・上級を初めて終えて全問正解のときだけ、結果の画面の下に1行（共有フォルダ kofi/app-guide.md）。遊ぶのは無料のまま、有料版は置かない。
- 外へ通信しない。外から読むのは Google Fonts の文字だけ（CSP の `connect-src 'self'` を広げない）。記録は遊ぶ人のブラウザ（localStorage）だけ。
- 同じ日はどの端末でも同じ問題にする：乱数は `sort` の比較の中で引かない（QA が見る）。少し遅れて動く処理（setTimeout）は、画面が替わっていたら何もしない。
- 押せる所は高さ44px以上（QA が見る）。機能を足す・直すたびに `qa/run.mjs` に検査を足す。乱数で組む部分は何千回も作って確かめる（shared-workflows `incidents/2026-10-31-roppo-empty-village.md`）。
- PWA（`manifest.webmanifest`・`sw.js`・`icon-*.png`）：画面のファイルを足したら `sw.js` の `SHELL` にも足し、中身を大きく変えたら `CACHE` の版を上げる。アイコンと SNS 用の絵 `og.png` は `node tools/make-icons.cjs`（今日の問題を入れない）。
- 公開リポジトリなので、個人情報・鍵を入れない。

## 公開

- GitHub Pages は `main` のルート（`/`）を公開する。PR の QA と Secret scan が ✅ になると `automerge.yml` が自動でマージする。止めたいときは下書きにするか、ラベル「自動マージしない」を付ける。
- `sw.js`・`manifest.webmanifest` を変える PR は自動ではマージされない（`hold_paths`）。CodeRabbit のレビューを待ち、手でマージする直前に今の head へのレビューを読み直す（shared-workflows `incidents/2026-11-01-roppo-merged-before-review.md`）。CodeRabbit は PR に `@coderabbitai review` とコメントして頼む。

## 共通のきまり

- PR の作り方・マージの仕方は satou-aaaaa/shared-workflows の `routines/pr.md`、全体のきまりは `routines/common.md` に従う。
- CI の部品は shared-workflows の共通部品を呼ぶ。リポジトリ側の .github/workflows には呼び出しと設定値だけを書く。
- Claude 以外の AI・人が作業するときは、shared-workflows の `routines/tool-map.md` と `routines/without-claude.md` を読む。
