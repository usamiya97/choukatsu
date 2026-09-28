# 腸活アプリ（chokatsu）

食物繊維だけに絞った記録アプリ。プリセット178品目の1タップ入力で、腸のキャラクターが7日平均で育つ。
サーバを持たず端末内で完結する。v1実装中。

- 設計の正典: [DESIGN.md](DESIGN.md)（**ここが最も正確**）
- 進行: [TODO.md](TODO.md) / 背景: [腸活アプリ_企画メモ.md](腸活アプリ_企画メモ.md)
- Expo/EAS の一般的な作法は [AGENTS.md](AGENTS.md) を見る。ただし**ルートは `src/app/` ではなく `app/`**

## Tech Stack

TypeScript (strict) / Expo SDK 57 + Expo Router / React Native 0.86 / react-native-svg /
AsyncStorage / expo-secure-store / expo-notifications（お通じの記録をうながす時刻・§15）/
テストは `node:test` + tsx。**ESLint・Prettier・CI は未設定**（`npx expo lint` は設定がないため使わない）。

## Build & Run

```bash
npm start           # prestart で build:data が走ってから Expo 起動
npm run build:data  # data/*.csv → data/generated/*.json ＋ 相互参照の検証
npm test            # 168件・端末不要
npm run typecheck   # tsc --noEmit
npm run dryrun      # 6シナリオ分の画面文言と数字を表示（引数で目標値を変えられる）
npm run dryrun:parse # 自由文入力が辞書だけでどこまで解けるか（LLMを呼ばない）
```

**作業を終える前に `npm test` と `npm run typecheck` を必ず通す。**
画面の文言や数値を変えたら `npm run dryrun` で目視確認する。

## アーキテクチャ — 一方通行を壊さない

```
data/*.csv → (build時) data/generated/*.json → lib/dataset.ts
  → lib/state · targets · format · coach（純粋関数・副作用なし）
  → lib/store.tsx（Context。配るだけで計算しない）
  → app/**（値をもらって描くだけ）
```

- `data/generated/*.json` を知るのは `lib/dataset.ts` **だけ**。ロジック層はデータを引数で受け取る
- 画面に計算を書かない。数値の言語化は必ず `lib/format.ts` を通す
- CSVを実行時に読まない（パース失敗を実行時エラーにしない）

## Project Structure

```
app/(tabs)/index.tsx   ホーム（キャラ＋メーター＋提案1つ）
app/(tabs)/log.tsx     記録（よく食べるもの／カテゴリ／検索）
app/(tabs)/review.tsx  ふりかえり（日ごとの繊維とお通じ・前の7日との比較・テキスト共有）
app/(tabs)/dex.tsx     図鑑（減らない軸）
app/(tabs)/settings.tsx 設定（目標値・苦手な食べもの・出典・削除）
app/onboarding.tsx     初回診断10問（スキップ可）＋ お通じを記録する時刻を1つ聞く
app/stool.tsx          お通じの記録（回数＋便の形7段階）。**キャラには効かせない**
app/food/[label].tsx   食品詳細（根拠の開示）。ルートキーは code ではなく label
lib/types.ts           語彙の定義。まずここを読む
lib/state.ts           7日平均・ヒステリシス・段階の閾値（中核）
lib/targets.ts         2軸の目標(1:2)と偏り判定
lib/format.ts          数値→日本語。小数点を出さない
lib/coach.ts           提案の選択（LLMは使わない・カタログ37件から決定論的に選ぶ）
lib/stool.ts           お通じの語彙・数え方・言い方＋うながす時刻（純粋関数・DESIGN §15）
lib/review.ts          週の振り返り（直近7日ローリング・前週比・共有テキスト・DESIGN §16）
lib/reminder.ts        通知を触る唯一の場所。使えない端末では動かないだけで落とさない
lib/lexicon.ts         自由文→プリセットの辞書（549キーを最長一致で走査・LLMなし）
lib/mealparse.ts       自由文のLLM名寄せ。クライアントは注入する（DESIGN §14）
lib/coachllm.ts        コーチ提案のLLM化。カタログから選ばせるだけで文は作らせない
lib/safety.ts          禁止語と数字の検査。カタログのビルド検査と実行時検査で共有する
lib/apikey.ts          BYOKの保管（expo-secure-store）。バンドルに鍵を入れない
lib/anthropic.ts       SDKを触る唯一の場所。プロキシに移すときはここだけ差し替える
lib/theme.ts           デザイントークン。生の色・生の数値を書かない唯一の出口
scripts/expand-servings.mjs  食品の追加（繊維量は成分表から計算・手入力しない）
```

## 譲れない不変条件（変更前に DESIGN.md と該当テストを読む）

- **数値はデータから決定論的に出す。LLMに計算させない**
- 段階は7日平均・ヒステリシス1.5g。**今日は平均に入れない**
- 7日の窓が空（空白8日以上）になったら平均で段階を決めない。**空白1週ごとに上限を1段**下げる
  （`idleStageCeiling`）。前回の段階から引く形にすると二重に落ちる。DESIGN §2
- **未記録日を0として数えない。`streak` を実装しない**（切れるものを作らない）
- 提案は1日1つ。同じ日は何度開いても同じもの
- **お通じはキャラの段階に影響させない。** キャラは食物繊維だけで育つ（体の反応を罰しない）
- お通じの **0回（出なかった）と未記録を区別する**。平均や「1日あたり」を出さない
- 記録をうながす時刻は**選択式**（自由入力しない）。通知は前提にしない（無くても催促の行が出る）
- 苦手（診断q10）と軸ごとの禁止リストを必ず提案から外す
- 小数点を出さない
- 平均は**記録した日だけ**で出す（未記録日を0gとして割らない）。週の振り返りも同じ
- 記録を端末の外に出すのは共有テキストだけ。**数字を外に出すときは出典を必ず添える**
- 軸の呼び名は `lib/format.ts` の `AXIS`／`axisName` 経由。「菌のごはん（水溶性）」の併記形
  （2026-09-26まではニックネームだけ。DESIGN §5-2 に方針転換の理由あり）
- **LLMに数値を返させない。** 出力スキーマに g も繊維量も置かない（`PARSE_SCHEMA`）
- 自由文入力は辞書で解けたらLLMを呼ばない（呼び出し回数＝費用）
- **コーチは1日1回だけ呼ぶ**（`UiState.llmCoach.date`）。何度開いても課金しない
- **LLMが書いた文に数字を許さない。** 数値を含む主張はカタログ／データから
- APIキーはバンドルに入れない。`app.json` の extra や `EXPO_PUBLIC_*` は使わない
- 読み取り結果をそのまま記録しない。必ず確認を挟む
- `method`（分析法）が違う食品同士で置き換えを出さない
- 動きは transform/opacity のみ。「視差効果を減らす」ONで全部止める
- 絵文字をアイコンに使わない（自前SVG・線幅1.8）。ライト固定

## Code Style

- ファイル名: lib は camelCase 単語1つ、components は PascalCase、ルートは Expo Router 規約
- **コメントは「なぜそうしたか」と「なぜそうしなかったか」を書く。** 棄却した案・トレードオフまで残す
- マジックナンバーは `export const` にして根拠をコメントする（例: `STAGE_HYSTERESIS_G`）
- エラーは落とさない方向に寄せる（壊れた保存値は初期値に、消えたラベルは無視）
- 色・余白・文字サイズは `lib/theme.ts` 経由。例外は塗りボタン上の `#FFFFFF` のみ

## Testing

- `lib/<name>.test.ts` に置く。`node:test` の `test()` + `assert`。**モックなし・UIを描かない**
- テスト名は日本語で仕様として読める形にする（「ヒステリシスのちらつきなし」等）
- 仕様を変えたらテストも変える。逆に**テストを緩めて通すのは禁止**（コントラスト比・禁止語・到達性はここで縛っている）

## Git

- コミットは `[update] 日本語の要約`
- `main` に直接コミットしている（feature branch 運用なし）
- `data/generated/` はコミットしない（`.gitignore` 済み）
