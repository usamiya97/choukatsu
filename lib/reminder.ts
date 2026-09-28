/**
 * 時刻に声をかける側（端末の通知）。**ここだけが expo-notifications を触る**
 * （lib/anthropic.ts が SDK を触る唯一の場所なのと同じ方針。差し替えるならこの1枚）。
 *
 * 通知は「あれば助かるもの」であって前提にしない。使えない環境が実際にある:
 *  - Expo Go の Android（SDK 53 以降でサポートが外れた）
 *  - Web
 *  - 通知を断られた・OSの設定で切られた端末
 * どれも**動かないだけで落ちない**ようにしてあり、ホームの催促の行が残る（DESIGN §15-3）。
 *
 * モジュールを静的 import にしないのは、ネイティブ側が無い環境では
 * 読み込んだ瞬間に例外になるため。require を try で包んで1度だけ解決する。
 */
import { Platform } from 'react-native';
import { REMINDER_TEXT, parseHm } from './stool';

/** 予約の識別子。**固定にして毎回置き換える**（時刻を変えるたびに増えると二重に鳴る） */
const ID = 'chokatsu-stool-daily';
/** Android の通知チャンネル。ここを分けておくとOS側で個別にオフにできる */
const CHANNEL = 'stool-reminder';

type Mod = typeof import('expo-notifications');

let cached: Mod | null | undefined;

function mod(): Mod | null {
  if (cached === undefined) {
    try {
      cached = require('expo-notifications') as Mod;
    } catch {
      // ネイティブ側が無い環境。以降は毎回 null を返す（再試行しない）
      cached = null;
    }
  }
  return cached;
}

/**
 * アプリを開いている間に来た通知も見えるようにする。起動時に1度呼ぶ。
 * 音を鳴らすのは、Android では `shouldPlaySound: false` にすると
 * ドロップダウンの表示自体が出なくなるため（expo-notifications の仕様）。
 */
export function configureReminderPresentation(): void {
  const n = mod();
  if (!n) return;
  try {
    n.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // 表示の設定に失敗しても予約自体は動く。落とさない
  }
}

/**
 * 通知を出す許可。まだ聞いていなければ1度だけ聞く。
 * 断られた後に聞き直さない（`canAskAgain` が false のときは黙って false を返す）。
 */
export async function ensureReminderPermission(): Promise<boolean> {
  const n = mod();
  if (!n) return false;
  try {
    const current = await n.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await n.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * 毎日その時刻に1回だけ鳴らす予約。予約し直すと前の予約は消える。
 *
 * OS側に残る予約なのでアプリを起こしておく必要はない。ただし
 * 「許可が後から切られた」「OSが予約を落とした」ことがあるので、
 * 起動時にもう一度この関数を呼んで貼り直している（lib/store.tsx）。
 */
export async function scheduleReminder(at: string): Promise<boolean> {
  const n = mod();
  const hm = parseHm(at);
  if (!n || !hm) return false;
  try {
    if (Platform.OS === 'android') {
      await n.setNotificationChannelAsync(CHANNEL, {
        name: 'お通じの記録',
        importance: n.AndroidImportance.DEFAULT,
      });
    }
    await cancelReminder();
    await n.scheduleNotificationAsync({
      identifier: ID,
      content: {
        title: REMINDER_TEXT.title,
        body: REMINDER_TEXT.body,
        // 押されたときにどこを開くか。文言と一緒にここで持つ（lib/stool.ts REMINDER_TEXT）
        data: { route: '/stool' },
      },
      trigger: {
        type: n.SchedulableTriggerInputTypes.DAILY,
        hour: hm.hour,
        minute: hm.minute,
        channelId: CHANNEL,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelReminder(): Promise<void> {
  const n = mod();
  if (!n) return;
  try {
    await n.cancelScheduledNotificationAsync(ID);
  } catch {
    // 予約が無いときにも投げる端末がある。無いなら目的は達成されている
  }
}

/**
 * 通知を押して開いたときに呼ばれる。返り値で購読を解除する。
 * 別の通知（将来足すもの）で誤って開かないよう、識別子か data で絞る。
 */
export function onReminderTap(handler: () => void): () => void {
  const n = mod();
  if (!n) return () => {};
  try {
    const sub = n.addNotificationResponseReceivedListener((res) => {
      const req = res.notification.request;
      const route = (req.content.data as { route?: string } | null)?.route;
      if (req.identifier === ID || route === '/stool') handler();
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
