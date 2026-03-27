/**
 * i18n configuration for Table Salt
 *
 * Usage pattern for developers:
 *   import { useTranslation } from 'react-i18next';
 *   function MyComponent() {
 *     const { t } = useTranslation('common');   // for common strings
 *     const { t: tPos } = useTranslation('pos'); // for POS-specific strings
 *     return <button>{t('save')}</button>;
 *   }
 *
 * Available namespaces: common, pos, orders, kitchen, billing, inventory, staff, settings, reports, account, layout
 * Supported languages: en (English), es (Spanish), ar (Arabic), fr (French)
 * RTL is handled via dir="rtl" on <html> when Arabic is active (see App.tsx)
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enPos from "./locales/en/pos.json";
import enOrders from "./locales/en/orders.json";
import enKitchen from "./locales/en/kitchen.json";
import enBilling from "./locales/en/billing.json";
import enInventory from "./locales/en/inventory.json";
import enStaff from "./locales/en/staff.json";
import enSettings from "./locales/en/settings.json";
import enReports from "./locales/en/reports.json";
import enAccount from "./locales/en/account.json";
import enLayout from "./locales/en/layout.json";
import enModules from "./locales/en/modules.json";

import esCommon from "./locales/es/common.json";
import esPos from "./locales/es/pos.json";
import esOrders from "./locales/es/orders.json";
import esKitchen from "./locales/es/kitchen.json";
import esBilling from "./locales/es/billing.json";
import esInventory from "./locales/es/inventory.json";
import esStaff from "./locales/es/staff.json";
import esSettings from "./locales/es/settings.json";
import esReports from "./locales/es/reports.json";
import esAccount from "./locales/es/account.json";
import esLayout from "./locales/es/layout.json";
import esModules from "./locales/es/modules.json";

import arCommon from "./locales/ar/common.json";
import arPos from "./locales/ar/pos.json";
import arOrders from "./locales/ar/orders.json";
import arKitchen from "./locales/ar/kitchen.json";
import arBilling from "./locales/ar/billing.json";
import arInventory from "./locales/ar/inventory.json";
import arStaff from "./locales/ar/staff.json";
import arSettings from "./locales/ar/settings.json";
import arReports from "./locales/ar/reports.json";
import arAccount from "./locales/ar/account.json";
import arLayout from "./locales/ar/layout.json";
import arModules from "./locales/ar/modules.json";

import frCommon from "./locales/fr/common.json";
import frPos from "./locales/fr/pos.json";
import frOrders from "./locales/fr/orders.json";
import frKitchen from "./locales/fr/kitchen.json";
import frBilling from "./locales/fr/billing.json";
import frInventory from "./locales/fr/inventory.json";
import frStaff from "./locales/fr/staff.json";
import frSettings from "./locales/fr/settings.json";
import frReports from "./locales/fr/reports.json";
import frAccount from "./locales/fr/account.json";
import frLayout from "./locales/fr/layout.json";
import frModules from "./locales/fr/modules.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" as const },
  { code: "es", label: "Español", dir: "ltr" as const },
  { code: "ar", label: "العربية", dir: "rtl" as const },
  { code: "fr", label: "Français", dir: "ltr" as const },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export function isRTL(lang: string): boolean {
  return lang === "ar";
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        pos: enPos,
        orders: enOrders,
        kitchen: enKitchen,
        billing: enBilling,
        inventory: enInventory,
        staff: enStaff,
        settings: enSettings,
        reports: enReports,
        account: enAccount,
        layout: enLayout,
        modules: enModules,
      },
      es: {
        common: esCommon,
        pos: esPos,
        orders: esOrders,
        kitchen: esKitchen,
        billing: esBilling,
        inventory: esInventory,
        staff: esStaff,
        settings: esSettings,
        reports: esReports,
        account: esAccount,
        layout: esLayout,
        modules: esModules,
      },
      ar: {
        common: arCommon,
        pos: arPos,
        orders: arOrders,
        kitchen: arKitchen,
        billing: arBilling,
        inventory: arInventory,
        staff: arStaff,
        settings: arSettings,
        reports: arReports,
        account: arAccount,
        layout: arLayout,
        modules: arModules,
      },
      fr: {
        common: frCommon,
        pos: frPos,
        orders: frOrders,
        kitchen: frKitchen,
        billing: frBilling,
        inventory: frInventory,
        staff: frStaff,
        settings: frSettings,
        reports: frReports,
        account: frAccount,
        layout: frLayout,
        modules: frModules,
      },
    },
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: ["en", "es", "ar", "fr"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Initial detection order for cold-start (before auth): localStorage → browser navigator.
      // After login, the user's DB-persisted preferred_language is fetched via /api/auth/me
      // and applied via i18n.changeLanguage(), which also writes back to localStorage.
      // This means DB preference effectively wins for authenticated users on every session.
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18n_language",
    },
  });

export default i18n;
