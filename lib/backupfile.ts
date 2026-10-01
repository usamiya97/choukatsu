/**
 * バックアップのファイル入出力（DESIGN.md §17）。
 * **ここだけが expo-file-system と expo-sharing を触る**（lib/reminder.ts と同じ方針）。
 *
 * 書き出しはキャッシュに1ファイル作って共有シートに渡すだけ。端末に残し続けない
 * （保存先はユーザーが選ぶ＝ファイルアプリ・iCloud・メール・LINEなど）。
 *
 * ファイル選択に expo-document-picker を足していないのは、
 * expo-file-system の `File.pickFileAsync` で足りるため（依存を1つ減らす）。
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** JSONのMIME。iOSは UTI も要る（これが無いとメールに添付できない端末がある） */
const MIME = 'application/json';
const UTI = 'public.json';

export type ExportOutcome =
  /** 共有シートまで開いた（保存したかどうかはOS側の話なので分からない） */
  | { ok: true }
  | { ok: false; reason: string };

export async function shareBackup(fileName: string, text: string): Promise<ExportOutcome> {
  try {
    const file = new File(Paths.cache, fileName);
    // 同じ日に2回書き出すと同名になる。前のものは消してから作る
    if (file.exists) file.delete();
    file.create({ overwrite: true });
    file.write(text);

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'この端末では共有が使えません' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: MIME,
      UTI,
      dialogTitle: '記録の書き出し',
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: '書き出せませんでした' };
  }
}

export type PickOutcome =
  | { ok: true; text: string; name: string }
  /** ユーザーが閉じた。エラー扱いにしない（何も言わずに終わる） */
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; reason: string };

export async function pickBackup(): Promise<PickOutcome> {
  try {
    const picked = await File.pickFileAsync({ mimeTypes: [MIME] });
    if (picked.canceled) return { ok: false, canceled: true };
    const file = picked.result;
    return { ok: true, text: await file.text(), name: file.name };
  } catch {
    return { ok: false, reason: 'ファイルを開けませんでした' };
  }
}
