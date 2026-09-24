export interface Country {
  code: string;
  name: string;
  dial: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana', dial: '+233', flag: '🇬🇭' },
  { code: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { code: 'EG', name: 'Egypt', dial: '+20', flag: '🇪🇬' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0] as Country;

export function detectCountry(): Country {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split('-')[1]?.toUpperCase();
    const match = COUNTRIES.find((country) => country.code === region);
    if (match) return match;
  } catch {
    // ignore unsupported Intl
  }
  return DEFAULT_COUNTRY;
}

export function normalizeNational(input: string): string {
  return input.replace(/\D/g, '').replace(/^0+/, '');
}

export function toE164(country: Country, nationalInput: string): string | null {
  const national = normalizeNational(nationalInput);
  if (national.length < 6 || national.length > 14) return null;
  return `${country.dial}${national}`;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export function formatPhoneForDisplay(phone: string): string {
  const country = COUNTRIES.find((entry) => phone.startsWith(entry.dial));
  if (!country) return phone;
  const rest = phone.slice(country.dial.length);
  return `${country.dial} ${rest.replace(/(\d{3})(?=\d)/g, '$1 ').trim()}`;
}
