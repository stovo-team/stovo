import { describe, expect, it } from "vitest";
import {
  englishStrings,
  getAppStrings,
  getSystemLanguage,
  resolveLanguage,
  russianStrings
} from "./index";

function firstShapeDifference(en: unknown, ru: unknown, path = "strings"): string | null {
  const enIsObject = typeof en === "object" && en !== null;
  const ruIsObject = typeof ru === "object" && ru !== null;
  if (enIsObject !== ruIsObject) return path;
  if (!enIsObject || !ruIsObject) {
    return typeof en === typeof ru ? null : path;
  }
  const enObject = en as Record<string, unknown>;
  const ruObject = ru as Record<string, unknown>;
  const keys = new Set([...Object.keys(enObject), ...Object.keys(ruObject)]);
  for (const key of [...keys].sort()) {
    if (!(key in enObject) || !(key in ruObject)) return `${path}.${key}`;
    const difference = firstShapeDifference(enObject[key], ruObject[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

describe("i18n strings and language resolution", () => {
  it("keeps English and Russian catalogs in recursive key and value-kind parity", () => {
    expect(firstShapeDifference(englishStrings, russianStrings)).toBeNull();
  });

  it("reports the first nested catalog mismatch", () => {
    expect(firstShapeDifference({ auth: { profile: "text", count: () => "" } }, { auth: { profile: "текст" } }))
      .toBe("strings.auth.count");
  });

  it("resolves explicit languages correctly", () => {
    expect(resolveLanguage("en", "ru")).toBe("en");
    expect(resolveLanguage("ru", "en")).toBe("ru");
  });

  it("resolves system language correctly", () => {
    expect(resolveLanguage("system", "en")).toBe("en");
    expect(resolveLanguage("system", "ru")).toBe("ru");
  });

  it("returns appropriate string bundle", () => {
    const en = getAppStrings("en");
    const ru = getAppStrings("ru");

    expect(en.nav.chats).toBe("Chats");
    expect(ru.nav.chats).toBe("Чаты");
    expect(en.nav.storage).toBe("Files");
    expect(ru.nav.storage).toBe("Файлы");

    expect(en.settings.language).toBe("Language");
    expect(ru.settings.language).toBe("Язык");

    expect(en.settings.notifications).toBe("Notifications");
    expect(ru.settings.notifications).toBe("Уведомления");

    expect(en.settings.privacyAndSecurity).toBe("Privacy and Security");
    expect(ru.settings.privacyAndSecurity).toBe("Конфиденциальность и безопасность");

    expect(en.settings.appearance).toBe("Appearance");
    expect(ru.settings.appearance).toBe("Оформление");

    expect(en.notifications.messages).toBe("Messages");
    expect(ru.notifications.messages).toBe("Сообщения");
    expect(en.notifications.messageNotifications).toBe("Message notifications");
    expect(ru.notifications.messageNotifications).toBe("Уведомления о сообщениях");
    expect(en.notifications.quietHours).toBe("Quiet hours");
    expect(ru.notifications.quietHours).toBe("Тихие часы");

    expect(en.privacy.profileVisibility).toBe("Profile visibility");
    expect(ru.privacy.profileVisibility).toBe("Видимость профиля");
    expect(en.privacy.readReceipts).toBe("Read receipts");
    expect(ru.privacy.readReceipts).toBe("Отчёты о прочтении");
    expect(en.privacy.blockedMembers).toBe("Blocked members");
    expect(ru.privacy.blockedMembers).toBe("Заблокированные участники");

    expect(en.appearance.theme).toBe("Theme");
    expect(ru.appearance.theme).toBe("Тема");
    expect(en.appearance.themes.system).toBe("System");
    expect(ru.appearance.themes.system).toBe("Системная");
    expect(en.appearance.accents.blue).toBe("Blue");
    expect(ru.appearance.accents.blue).toBe("Синий");
    expect(en.appearance.wallpapers.dots).toBe("Dots");
    expect(ru.appearance.wallpapers.dots).toBe("Точки");
    expect(en.appearance.bubbleShapes.rounded).toBe("Rounded");
    expect(ru.appearance.bubbleShapes.rounded).toBe("Закругленный");
    expect(en.appearance.messageFonts.system).toBe("System");
    expect(ru.appearance.messageFonts.system).toBe("Системный");
    expect(en.appearance.densities.comfortable).toBe("Comfortable");
    expect(ru.appearance.densities.comfortable).toBe("Комфортная");

    expect(en.nav.unreadMessages(1)).toBe("1 unread messages");
    expect(ru.nav.unreadMessages(1)).toBe("1 непрочитанное сообщение");
    expect(ru.nav.unreadMessages(2)).toBe("2 непрочитанных сообщения");
    expect(ru.nav.unreadMessages(5)).toBe("5 непрочитанных сообщений");
    expect(en.nav.unreadMessages(11)).toBe("11 unread messages");
    expect(ru.nav.unreadMessages(11)).toBe("11 непрочитанных сообщений");
    expect(ru.nav.unreadMessages(21)).toBe("21 непрочитанное сообщение");

    expect(en.chats.sections.archive).toBe("Message Archive");
    expect(ru.chats.sections.archive).toBe("Архив сообщений");
    expect(en.chats.types.messageArchive).toBe("Message Archive");
    expect(ru.chats.types.messageArchive).toBe("Архив сообщений");

    expect(en.callHistory.completed("1:23")).toBe("Call completed · 1:23");
    expect(ru.callHistory.completed("1:23")).toBe("Звонок завершён · 1:23");
    expect(en.callHistory.completedLabel).toBe("Call completed");
    expect(ru.callHistory.completedLabel).toBe("Звонок завершён");
    expect(en.callHistory.declined).toBe("Call declined");
    expect(ru.callHistory.declined).toBe("Звонок отклонён");
    expect(en.callHistory.canceled).toBe("Call canceled");
    expect(ru.callHistory.canceled).toBe("Звонок отменён");
    expect(en.callHistory.missed).toBe("Missed call");
    expect(ru.callHistory.missed).toBe("Пропущенный звонок");
    expect(en.callHistory.failed).toBe("Call failed");
    expect(ru.callHistory.failed).toBe("Сбой звонка");
    expect(en.callHistory.videoCall).toBe("Video call");
    expect(ru.callHistory.videoCall).toBe("Видеозвонок");
    expect(en.callHistory.audioCall).toBe("Audio call");
    expect(ru.callHistory.audioCall).toBe("Аудиозвонок");

    expect(en.settings.general).toBe("General");
    expect(ru.settings.general).toBe("Общие");
    expect(en.settings.statistics).toBe("Statistics");
    expect(ru.settings.statistics).toBe("Статистика");

    expect(en.audioPlayer.text).toBe("Text");
    expect(ru.audioPlayer.text).toBe("Текст");
    expect(en.audioPlayer.hide).toBe("Hide");
    expect(ru.audioPlayer.hide).toBe("Скрыть");
    expect(en.audioPlayer.transcript).toBe("Transcript");
    expect(ru.audioPlayer.transcript).toBe("Расшифровка");

    expect(en.chats.composer.messagePlaceholder).toBe("Message");
    expect(ru.chats.composer.messagePlaceholder).toBe("Сообщение");
  });

  it("exports valid English and Russian dictionaries with matching recursive key and value-kind shape", () => {
    expect(firstShapeDifference(englishStrings, russianStrings)).toBeNull();
  });
});
