import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { th } from './locales/th'
import { en } from './locales/en'

export const NAMESPACES = [
  'common',
  'menu',
  'build',
  'cart',
  'checkout',
  'tracking',
  'admin',
] as const

void i18n.use(initReactI18next).init({
  lng: 'th',
  fallbackLng: 'th',
  ns: NAMESPACES,
  defaultNS: 'common',
  resources: {
    th: th as unknown as Record<string, object>,
    en: en as unknown as Record<string, object>,
  },
  interpolation: {
    // React already escapes.
    escapeValue: false,
  },
  returnNull: false,
})

export default i18n

/** Dates and money go through Intl with an explicit locale, never by hand. */
export const money = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const timeOfDay = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
})

export const dayAndMonth = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Bangkok',
})
