import { describe, expect, it } from "vitest";
import {
  englishStrings,
  getAppStrings,
  getSystemLanguage,
  resolveLanguage,
  russianStrings
} from "./index";

describe("i18n strings and language resolution", () => {
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

    expect(en.settings.language).toBe("Language");
    expect(ru.settings.language).toBe("Язык");

    expect(en.nav.unreadMessages(1)).toBe("1 unread messages");
    expect(ru.nav.unreadMessages(1)).toBe("1 непрочитанное сообщение");
    expect(ru.nav.unreadMessages(2)).toBe("2 непрочитанных сообщения");
    expect(ru.nav.unreadMessages(5)).toBe("5 непрочитанных сообщений");
    expect(ru.nav.unreadMessages(11)).toBe("11 непрочитанных сообщений");
    expect(ru.nav.unreadMessages(21)).toBe("21 непрочитанное сообщение");
  });

  it("exports valid english and russian string dictionaries with matching keys", () => {
    expect(Object.keys(russianStrings.brand)).toEqual(Object.keys(englishStrings.brand));
    expect(Object.keys(russianStrings.nav)).toEqual(Object.keys(englishStrings.nav));
    expect(Object.keys(russianStrings.auth)).toEqual(Object.keys(englishStrings.auth));
    expect(Object.keys(russianStrings.settings)).toEqual(Object.keys(englishStrings.settings));
    expect(Object.keys(russianStrings.appearance)).toEqual(Object.keys(englishStrings.appearance));
    expect(Object.keys(russianStrings.notifications)).toEqual(Object.keys(englishStrings.notifications));
    expect(Object.keys(russianStrings.privacy)).toEqual(Object.keys(englishStrings.privacy));
    expect(Object.keys(russianStrings.errors)).toEqual(Object.keys(englishStrings.errors));
  });
});
