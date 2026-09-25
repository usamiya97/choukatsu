# 腸活アプリ（v1・実装中）

食物繊維だけに絞ったトラッカー。プリセット178品目の1タップ入力で、腸のキャラクターが育つ。
企画の背景は [腸活アプリ_企画メモ.md](腸活アプリ_企画メモ.md)、v1の仕様は [DESIGN.md](DESIGN.md)、
進行は [TODO.md](TODO.md)。

## 動かす

```bash
npm install                # 初回。peer依存の衝突があるときは --legacy-peer-deps
npm start                  # data/generated を作ってから Expo を起動する（prestart）
npm test                   # ロジックのテスト（68件・端末不要）
npm run typecheck          # tsc --noEmit
npm run dryrun             # 画面に出る文言と数字を4シナリオぶん表示（端末不要）
```

`npm run build:data` が `data/*.csv` → `data/generated/*.json` を生成する。
**CSVは実行時に読まない**（パース失敗を実行時エラーにしないため）。生成物はコミットしない。

## 構成

```
app/                     Expo Router
├── (tabs)/index.tsx     ホーム（キャラ＋メーター＋提案1つ）
├── (tabs)/log.tsx       記録（よく食べるもの／カテゴリ／検索）
├── (tabs)/dex.tsx       図鑑（減らない軸）
├── (tabs)/settings.tsx  設定（苦手な食べもの・出典・データ削除）
├── onboarding.tsx       初回診断10問（スキップ可）
└── food/[label].tsx     食品詳細（根拠の開示）

components/              GutCharacter(静止SVG) / GutCharacterLive(動き) / Meter / CoachCard
                         ServingChip / QuantitySheet / QuantityStepper / Toast / TabIcon / Icons
lib/                     state(状態モデル) coach(提案選択) format(表示) diagnosis(採点)
                         dataset(生成JSONの入口) store(Context) storage(AsyncStorage)
                         theme(デザイントークン) motion(アニメ・触覚)
scripts/build-data.mjs   CSV → JSON ＋ 相互参照の検証
scripts/expand-servings.mjs  プリセット品目の追加（成分表から値を計算）
scripts/dryrun.ts        画面の文言と数字を端末なしで確認
data/                    出典データ。詳細は data/README.md
```

## 実装が守っている決まり

| 決まり | 場所 |
|---|---|
| 数値はデータから決定論的に出す。LLMに計算させない | `lib/state.ts` / `lib/coach.ts` |
| 段階は7日平均・ヒステリシス1.5g。**今日は平均に入れない** | `lib/state.ts` `stageScore` / `resolveStage` |
| 未記録日を0として数えない。`streak` を持たない | `lib/state.ts` |
| 提案は1日1つ。同じ日は何度開いても同じもの | `lib/coach.ts` `dailyIndex` |
| 苦手（診断q10）と軸ごとの禁止リストを必ず外す | `lib/coach.ts` / `lib/format.ts` `bannedLabels` |
| 小数点を出さない。「8割くらい」「あと納豆1パック分」 | `lib/format.ts` |
| 専門語（水溶性/不溶性）をUIに出さない | `lib/format.ts` `AXIS_LABEL` |
| 出典を画面に出す（成分表の利用条件） | `app/(tabs)/settings.tsx` / `app/food/[label].tsx` |
| 色・余白・文字サイズは必ずトークン経由。コントラスト比はテストで固定 | `lib/theme.ts` / `lib/theme.test.ts` |
| 動きは transform/opacity のみ。「視差効果を減らす」ONで全部止める | `lib/motion.ts` / `components/GutCharacterLive.tsx` |
| 絵文字をアイコンに使わない（自前SVG・線幅1.8） | `components/TabIcon.tsx` / `components/Icons.tsx` |
| 分析法(`method`)が違う食品同士で置き換えを出さない | `scripts/build-data.mjs` / `app/food/[label].tsx` |
| 繊維量は成分表から計算。品目追加でも手入力しない | `scripts/expand-servings.mjs` |
| 量は常用量の0.5刻み。g入力は置かない | `components/QuantitySheet.tsx` |

## まだ無いもの

- AI（LLM）の食事パース … プリセットだけで3指標に到達できるので後回し（TODO 19〜20）
- 成分表フル2,393件は**検索の参考表示だけ**。常用量が無いので記録には足せない（TODO 21〜22）
- 通知、2軸の見た目（v2）、気分スコア・排便記録（v1.5以降）
