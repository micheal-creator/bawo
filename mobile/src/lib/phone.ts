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

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

const TIMEZONE_COUNTRY: Record<string, string> = {
  'Africa/Lagos': 'NG',
  'Africa/Accra': 'GH',
  'Africa/Nairobi': 'KE',
  'Africa/Johannesburg': 'ZA',
  'Africa/Cairo': 'EG',
  'Europe/London': 'GB',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
};

export const DEFAULT_COUNTRY: Country = COUNTRIES[0] as Country;

export function countryByCode(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.toUpperCase());
}

export function countryForTimezone(timeZone: string | null | undefined): Country | undefined {
  if (!timeZone) return undefined;
  const code = TIMEZONE_COUNTRY[timeZone];
  if (code) return countryByCode(code);
  const region = timeZone.split('/')[0];
  if (region === 'Africa') return countryByCode('NG');
  return undefined;
}

export function countryFromLocale(): Country | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split('-')[1]?.toUpperCase();
    return countryByCode(region ?? null);
  } catch {
    return undefined;
  }
}

export function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function detectCountryFallback(): Country {
  return countryForTimezone(deviceTimezone()) ?? countryFromLocale() ?? DEFAULT_COUNTRY;
}

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

export function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, '');
}

export function toE164(country: Country, input: string): string | null {
  const digits = digitsOnly(input);
  const national = stripLeadingZeros(digits);
  if (national.length < 6 || national.length > 14) return null;
  return `${country.dial}${national}`;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export function formatDisplay(phone: string, nationalPhone?: string | null): string {
  if (nationalPhone && nationalPhone.length > 0) return nationalPhone;
  const split = splitDial(phone);
  if (split && split.national.length > 0) return split.national;
  return phone;
}

export function formatWithDial(phone: string, nationalPhone?: string | null): string {
  const split = splitDial(phone);
  const dial = split?.dial;
  const national = formatDisplay(phone, nationalPhone).replace(/^0+/, '');
  if (!dial || national.length === 0) return formatDisplay(phone, nationalPhone);
  return `${dial} ${national}`;
}

export function splitDial(phone: string): { dial: string; national: string } | null {
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const country of sorted) {
    if (phone.startsWith(country.dial)) {
      return { dial: country.dial, national: phone.slice(country.dial.length) };
    }
  }
  return null;
}
