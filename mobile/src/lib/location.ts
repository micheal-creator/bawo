import * as Location from 'expo-location';
import { Platform } from 'react-native';
import {
  countryByCode,
  countryFromLocale,
  countryForTimezone,
  DEFAULT_COUNTRY,
  deviceTimezone,
  type Country,
} from './phone';

export type DetectionSource = 'gps' | 'timezone' | 'locale' | 'default';

export interface DetectedCountry {
  country: Country;
  source: DetectionSource;
}

function fromTimezone(): DetectedCountry | null {
  const country = countryForTimezone(deviceTimezone());
  return country ? { country, source: 'timezone' } : null;
}

function fromLocale(): DetectedCountry | null {
  const country = countryFromLocale();
  return country ? { country, source: 'locale' } : null;
}

function fromDefault(): DetectedCountry {
  return { country: DEFAULT_COUNTRY, source: 'default' };
}

export function detectCountryWithoutPermission(): DetectedCountry {
  return fromTimezone() ?? fromLocale() ?? fromDefault();
}

async function fromGps(): Promise<DetectedCountry | null> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.geolocation) {
    return null;
  }

  const existing = await Location.getForegroundPermissionsAsync();
  if (!existing.granted) {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (!requested.granted) return null;
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Lowest,
  });

  if (Platform.OS === 'web') return null;

  const places = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  const iso = places[0]?.isoCountryCode ?? null;
  const country = countryByCode(iso);
  return country ? { country, source: 'gps' } : null;
}

export async function detectCountry(preferGps: boolean): Promise<DetectedCountry> {
  if (preferGps) {
    try {
      const detected = await fromGps();
      if (detected) return detected;
    } catch {
      // fall through to offline detection
    }
  }
  return detectCountryWithoutPermission();
}

export function dialFor(country: Country): string {
  return country.dial;
}
