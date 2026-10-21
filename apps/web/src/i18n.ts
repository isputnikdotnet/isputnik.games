import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

export const LANGUAGES = ["en", "ru"] as const;
export type Language = (typeof LANGUAGES)[number];

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
    returnNull: false;
  }
}

// The home app keeps the member's interface language under this key on the same
// origin, so the games open in the right language before /api/me has answered.
const HOME_LANGUAGE_KEY = "isputnik-language";

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

export function storedLanguage(): Language | null {
  try {
    const saved = localStorage.getItem(HOME_LANGUAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    /* private mode */
  }
  return null;
}

function browserLanguage(): Language {
  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export async function setAppLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
}

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

export const i18nReady: Promise<void> = i18n
  .use(initReactI18next)
  .init({
    lng: storedLanguage() ?? browserLanguage(),
    fallbackLng: "en",
    defaultNS: "translation",
    resources: { en: { translation: en }, ru: { translation: ru } },
    interpolation: { escapeValue: false },
    returnNull: false
  })
  .then(() => undefined);

export default i18n;
