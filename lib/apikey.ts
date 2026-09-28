/**
 * APIキーの保管（BYOK）。**端末のセキュアストレージにだけ置く。**
 *
 * バンドルにもリポジトリにも鍵を入れない。Expoのバンドルは展開すれば読めるので、
 * `app.json` の extra や `EXPO_PUBLIC_*` に置いた鍵は配布した時点で取り出せる。
 * 設定画面から本人が入れたものを expo-secure-store（iOS: Keychain / Android: Keystore）に保存する。
 *
 * ⚠️ この形は**一般ユーザーには配れない**（Anthropicのアカウントを持っていない）。
 * 配布するならプロキシに差し替える。差し替え先は lib/anthropic.ts だけで済む。
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'chokatsu.anthropic_api_key';

/** 保存されたキー。無ければ null（＝LLMを使わない構成として動く） */
export async function loadApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    // 端末がセキュアストレージを使えない場合。鍵が無い扱いにして起動は続ける
    return null;
  }
}

export async function saveApiKey(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, value.trim());
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

/**
 * 形だけの検査。**有効かどうかは叩くまで分からない**ので、
 * ここで弾くのは明らかな貼り間違い（空・別サービスの鍵・前後の空白）だけにする。
 */
export function looksLikeApiKey(value: string): boolean {
  const v = value.trim();
  return v.startsWith('sk-ant-') && v.length >= 20;
}

/** 画面に出す用。全部は出さない（肩越しに見られる場所で開くことがある） */
export function maskApiKey(value: string): string {
  const v = value.trim();
  if (v.length <= 12) return '••••';
  return `${v.slice(0, 7)}…${v.slice(-4)}`;
}
