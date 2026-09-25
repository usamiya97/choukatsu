/**
 * 遅延読み込み用の require。
 * foods.json(326KB) は検索で必要になるまで読み込まないため、静的 import を使わない。
 */
declare function require(path: string): unknown;
