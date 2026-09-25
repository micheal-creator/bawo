export interface Country {
  code: string;
  name: string;
  dial: string;
}

export const COUNTRIES: Country[] = [
  { code: 'NG', name: 'Nigeria', dial: '+234' },
  { code: 'GH', name: 'Ghana', dial: '+233' },
  { code: 'KE', name: 'Kenya', dial: '+254' },
  { code: 'ZA', name: 'South Africa', dial: '+27' },
  { code: 'EG', name: 'Egypt', dial: '+20' },
  { code: 'GB', name: 'United Kingdom', dial: '+44' },
  { code: 'US', name: 'United States', dial: '+1' },
  { code: 'CA', name: 'Canada', dial: '+1' },
  { code: 'IN', name: 'India', dial: '+91' },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971' },
];

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

const BY_DIAL = new Map<string, Country>();
for (const country of COUNTRIES) {
  if (!BY_DIAL.has(country.dial)) BY_DIAL.set(country.dial, country);
}

const DIALS_BY_LENGTH = Array.from(BY_DIAL.keys()).sort((a, b) => b.length - a.length);

export function countryByCode(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.toUpperCase());
}

export function countryByDial(dial: string): Country | undefined {
  return BY_DIAL.get(dial);
}

export function defaultCountry(): Country {
  return COUNTRIES[0] as Country;
}

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '');
}

export function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, '');
}

export function normalizeNational(input: string): string {
  return stripLeadingZeros(digitsOnly(input));
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export function resolveE164(country: Country | undefined, input: string): string | null {
  if (!country) return null;
  const digits = digitsOnly(input);

  if (digits.startsWith(country.dial.slice(1)) && !/^0/.test(digits)) {
    const candidate = `+${digits}`;
    if (isValidE164(candidate) && parseE164(candidate)?.dial === country.dial) return candidate;
  }

  const national = stripLeadingZeros(digits);
  if (national.length < 6 || national.length > 14) return null;
  return `${country.dial}${national}`;
}

export function parseE164(phone: string): { dial: string; national: string; country?: Country } | null {
  if (typeof phone !== 'string' || !phone.startsWith('+')) return null;
  for (const dial of DIALS_BY_LENGTH) {
    if (!phone.startsWith(dial)) continue;
    const national = phone.slice(dial.length);
    if (!/^\d{4,14}$/.test(national)) continue;
    return { dial, national, country: BY_DIAL.get(dial) };
  }
  return null;
}

export interface PhoneInput {
  e164: string;
  nationalPhone: string;
  countryCode: string;
  explicitLocal: boolean;
}

export function resolvePhoneInput(
  input: string,
  fallbackCountry: Country | undefined,
): PhoneInput | null {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith('+')) {
    const parsed = parseE164(trimmed.replace(/[\s()-]/g, ''));
    if (!parsed) return null;
    return {
      e164: `+${parsed.dial.slice(1)}${parsed.national}`,
      nationalPhone: parsed.national,
      countryCode: parsed.country?.code ?? fallbackCountry?.code ?? 'NG',
      explicitLocal: false,
    };
  }

  const country = fallbackCountry ?? defaultCountry();
  const e164 = resolveE164(country, trimmed);
  if (!e164) return null;
  const nationalPhone = digitsOnly(trimmed);
  return { e164, nationalPhone, countryCode: country.code, explicitLocal: true };
}

export function formatDisplay(phone: string, nationalPhone?: string | null): string {
  if (nationalPhone && nationalPhone.length > 0) return nationalPhone;
  const parsed = parseE164(phone);
  if (!parsed) return phone;
  return parsed.national;
}

export function formatWithDial(phone: string, nationalPhone?: string | null): string {
  const parsed = parseE164(phone);
  if (!parsed) return phone;
  return `${parsed.dial} ${formatDisplay(phone, nationalPhone)}`;
}
