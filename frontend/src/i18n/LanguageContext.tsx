import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  AppStrings,
  getAppStrings,
  getSystemLanguage,
  LanguageChoice,
  ResolvedLanguage,
  resolveLanguage
} from "../config/strings";
import {
  readDevicePreferences,
  writeDevicePreferences
} from "../settings/devicePreferences";

export interface LanguageContextValue {
  language: LanguageChoice;
  resolvedLanguage: ResolvedLanguage;
  systemLanguage: ResolvedLanguage;
  strings: AppStrings;
  setLanguage: (choice: LanguageChoice) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageChoice>(() => {
    return readDevicePreferences().language;
  });
  const [systemLanguage, setSystemLanguage] = useState<ResolvedLanguage>(() => {
    return getSystemLanguage();
  });

  // Listen to browser / system language changes if supported
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleLanguageChange = () => {
      setSystemLanguage(getSystemLanguage());
    };
    window.addEventListener("languagechange", handleLanguageChange);
    return () => window.removeEventListener("languagechange", handleLanguageChange);
  }, []);

  const resolvedLanguage = useMemo(() => {
    return resolveLanguage(language, systemLanguage);
  }, [language, systemLanguage]);

  const strings = useMemo(() => {
    return getAppStrings(resolvedLanguage);
  }, [resolvedLanguage]);

  const setLanguage = useCallback((choice: LanguageChoice) => {
    setLanguageState(choice);
    writeDevicePreferences({ language: choice });
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      resolvedLanguage,
      systemLanguage,
      strings,
      setLanguage
    }),
    [language, resolvedLanguage, systemLanguage, strings, setLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

export function useStrings(): AppStrings {
  const context = useContext(LanguageContext);
  if (!context) {
    return getAppStrings(getSystemLanguage());
  }
  return context.strings;
}

export function useResolvedLanguage(): ResolvedLanguage {
  return useContext(LanguageContext)?.resolvedLanguage ?? getSystemLanguage();
}
