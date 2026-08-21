import type { AppStrings, LanguageChoice } from "../../config/strings";

type Props = {
  strings: AppStrings;
  language: LanguageChoice;
  systemLanguage: "en" | "ru";
  onChange: (language: LanguageChoice) => void;
};

export function LanguageSettings({ strings, language, systemLanguage, onChange }: Props) {
  const options = [
    { value: "system" as const, label: strings.settings.languageSystem, subtext: strings.settings.languageSystemSubtext(systemLanguage === "ru" ? strings.settings.languageRussian : strings.settings.languageEnglish) },
    { value: "en" as const, label: strings.settings.languageEnglish, subtext: "English" },
    { value: "ru" as const, label: strings.settings.languageRussian, subtext: "Русский" }
  ];

  return (
    <div className="settings-toggle-groups">
      <section className="choice-page">
        <h3>{strings.settings.language}</h3>
        {options.map((option) => {
          const isSelected = language === option.value;
          return (
            <button type="button" className={`privacy-choice${isSelected ? " is-selected" : ""}`} key={option.value} onClick={() => onChange(option.value)}>
              <span className="privacy-choice-copy"><strong>{option.label}</strong><small>{option.subtext}</small></span>
              {isSelected && <span className="privacy-choice-check">✓</span>}
            </button>
          );
        })}
      </section>
    </div>
  );
}
