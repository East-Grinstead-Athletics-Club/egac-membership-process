// ============================================================
// EGAC Platform — System Configuration
// src/lib/config.ts
//
// Config values are stored in Cloudflare KV for fast reads.
// On a cache miss they fall back to hard-coded defaults.
// KV writes are conservative (1k/day free tier limit) —
// only performed when an admin explicitly updates a value.
//
// All values are strings in KV. Callers cast to the type they need.
// ============================================================

import type { Env, SystemConfig, SystemConfigKey } from './db/schema.js';

// ------------------------------------------------------------
// Default values
// Defined here so the system works on first boot before any
// admin has touched the config panel.
// ------------------------------------------------------------
const CONFIG_DEFAULTS: SystemConfig = {
  academy_max_age: '10',
  weeks_ahead_booking: '8',
  capacity_per_slot: '2',
  site_name: 'East Grinstead Athletics Club',
  site_url: 'https://egac.pages.dev',
  email_from: 'no-reply@updates.eastgrinsteadac.co.uk',
  venue_name: 'East Grinstead Leisure Centre',
  venue_address: 'King Street, East Grinstead, RH19 3DJ',
  admin_email: '',
  location_tuesday: '',
  location_thursday: '',
  location_saturday: '',
};

// Cache key and TTL constants
const CONFIG_CACHE_KEY = 'config:system';
const _CONFIG_TTL_SECONDS = 300; // 5 minutes

// ------------------------------------------------------------
// getSystemConfig
// Returns the full config object, reading from KV if cached
// or returning defaults if not. Never writes to D1 — config
// is managed purely via KV to keep D1 request count low.
// ------------------------------------------------------------
export async function getSystemConfig(env: Env): Promise<SystemConfig> {
  try {
    const cached = await env.KV.get(CONFIG_CACHE_KEY);
    if (cached) {
      return { ...CONFIG_DEFAULTS, ...JSON.parse(cached) } as SystemConfig;
    }
  } catch {
    // KV unavailable (e.g., in unit tests without a KV binding) — fall through to defaults
  }

  return { ...CONFIG_DEFAULTS };
}

// ------------------------------------------------------------
// getConfigValue
// Reads a single config key. Cheaper than fetching the whole
// object when only one value is needed.
// ------------------------------------------------------------
export async function getConfigValue(key: SystemConfigKey, env: Env): Promise<string> {
  const config = await getSystemConfig(env);
  return config[key] ?? CONFIG_DEFAULTS[key] ?? '';
}

// ------------------------------------------------------------
// setSystemConfig
// Updates one or more config values. Merges with current config,
// then writes the merged object back to KV.
// Only called from the admin config endpoint — not during requests.
// ------------------------------------------------------------
export async function setSystemConfig(
  updates: Partial<SystemConfig>,
  env: Env
): Promise<SystemConfig> {
  const current = await getSystemConfig(env);
  const next = { ...current, ...updates };

  // Store without TTL — KV is the persistent store for config, not just a cache.
  await env.KV.put(CONFIG_CACHE_KEY, JSON.stringify(next));

  return next;
}

// ------------------------------------------------------------
// clearConfigCache
// Deletes the KV cache entry so the next read picks up changes.
// Called after a config update to ensure immediate consistency.
// ------------------------------------------------------------
export async function clearConfigCache(env: Env): Promise<void> {
  try {
    await env.KV.delete(CONFIG_CACHE_KEY);
  } catch {
    // Non-fatal — cache will expire naturally
  }
}

// ------------------------------------------------------------
// Typed convenience parsers
// Convert string config values to the types callers actually need.
// ------------------------------------------------------------
export function parseIntConfig(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

export function getAcademyMaxAge(config: SystemConfig): number {
  return parseIntConfig(config.academy_max_age, 10);
}

export function getWeeksAhead(config: SystemConfig): number {
  return parseIntConfig(config.weeks_ahead_booking, 8);
}

export function getCapacityPerSlot(config: SystemConfig): number {
  return parseIntConfig(config.capacity_per_slot, 2);
}

// ------------------------------------------------------------
// validateConfigUpdate
// Called before saving to catch bad values early.
// Returns an array of error strings (empty = valid).
// ------------------------------------------------------------
export function validateConfigUpdate(updates: Partial<SystemConfig>): string[] {
  const errors: string[] = [];

  if (updates.capacity_per_slot !== undefined) {
    const n = parseInt(updates.capacity_per_slot, 10);
    if (isNaN(n) || n < 1 || n > 10) {
      errors.push('capacity_per_slot must be an integer between 1 and 10');
    }
  }

  if (updates.weeks_ahead_booking !== undefined) {
    const n = parseInt(updates.weeks_ahead_booking, 10);
    if (isNaN(n) || n < 1 || n > 16) {
      errors.push('weeks_ahead_booking must be an integer between 1 and 16');
    }
  }

  if (updates.academy_max_age !== undefined) {
    const n = parseInt(updates.academy_max_age, 10);
    if (isNaN(n) || n < 5 || n > 16) {
      errors.push('academy_max_age must be an integer between 5 and 16');
    }
  }

  if (updates.email_from !== undefined && updates.email_from.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email_from)) {
      errors.push('email_from must be a valid email address');
    }
  }

  if (updates.site_url !== undefined && updates.site_url.trim()) {
    try {
      new URL(updates.site_url);
    } catch {
      errors.push('site_url must be a valid URL');
    }
  }

  return errors;
}

// ------------------------------------------------------------
// resolveVenueForDate
// Returns the configured location for the day of the week of
// dateIso (YYYY-MM-DD). Falls back to venue_name when no
// day-specific location is set.
// ------------------------------------------------------------
export function resolveVenueForDate(dateIso: string, config: SystemConfig): string {
  const fallback = config.venue_name ?? 'East Grinstead Leisure Centre';
  const d = new Date(dateIso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return fallback;
  const day = d.getUTCDay();
  if (day === 2 && config.location_tuesday) return config.location_tuesday;
  if (day === 4 && config.location_thursday) return config.location_thursday;
  if (day === 6 && config.location_saturday) return config.location_saturday;
  return fallback;
}

export { CONFIG_DEFAULTS };

// Alias used by API handlers — resolves to getSystemConfig.
export const getConfig = getSystemConfig;
