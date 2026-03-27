import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import uk from './locales/uk.json';

const noop = () => {};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      uk: { translation: uk },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// Silence the i18next promotional log (added in v23, unrelated to debug mode)
(i18n as any).logger.log = noop;

export default i18n;
