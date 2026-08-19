import { strings as englishStrings } from "./english";
import { strings as russianStrings } from "./russian";
import type { AppStrings } from "./english";

export { englishStrings, russianStrings };
export { englishStrings as strings };
export type { AppStrings };

export type LanguageChoice = "system" | "en" | "ru";
export type ResolvedLanguage = "en" | "ru";

/**
 * Detects the system/browser language, falling back to English.
 */
export function getSystemLanguage(): ResolvedLanguage {
  if (typeof navigator === "undefined" || !navigator.language) {
    return "en";
  }
  const lang = navigator.language.toLowerCase();
  if (
    lang.startsWith("ru") ||
    lang.startsWith("be") ||
    lang.startsWith("uk") ||
    lang.startsWith("kk")
  ) {
    return "ru";
  }
  return "en";
}

/**
 * Resolves a LanguageChoice to a concrete ResolvedLanguage ("en" | "ru").
 */
export function resolveLanguage(
  choice: LanguageChoice,
  systemLang = getSystemLanguage()
): ResolvedLanguage {
  if (choice === "system") {
    return systemLang;
  }
  return choice;
}

/**
 * Returns the strings object for a resolved language.
 */
export function getAppStrings(resolvedLang: ResolvedLanguage): AppStrings {
  return resolvedLang === "ru" ? russianStrings : englishStrings;
}
