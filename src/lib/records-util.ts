// src/lib/records-utils.ts
// Shared utility logic for both Admin and Public projects
// This should be identical in both projects or shared via npm package

/**
 * Unit types for records
 */
export type UnitType = 'time' | 'distance' | 'height' | 'count';

/**
 * Parse a display string to raw value (single source of formatting logic)
 * 
 * @param value - Display string (e.g., "12:34.56" for time, "5.45" for distance)
 * @param unitType - The unit type: 'time', 'distance', 'height'
 * @returns Raw value (milliseconds for time, centimeters for distance/height)
 * @throws Error if value cannot be parsed
 */
export function parseToRaw(value: string | number, unitType: UnitType): number {
  if (!value) {
    throw new Error('Value is required');
  }

  // Convert to string if number
  const strValue = typeof value === 'number' ? String(value) : value.trim();

  if (unitType === 'time') {
    return parseTimeToMilliseconds(strValue);
  }

  if (unitType === 'distance' || unitType === 'height') {
    return parseDistanceToCentimeters(strValue);
  }

  if (unitType === 'count') {
    const num = parseInt(strValue, 10);
    if (isNaN(num)) {
      throw new Error(`Cannot parse "${strValue}" as count`);
    }
    return num;
  }

  throw new Error(`Unknown unit type: ${unitType}`);
}

/**
 * Format a raw value to display string (single source of formatting logic)
 * 
 * @param value - Raw value (milliseconds for time, centimeters for distance)
 * @param unitType - The unit type
 * @returns Formatted display string (e.g., "12:34.56", "5.45m")
 */
export function formatFromRaw(value: number, unitType: UnitType): string {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Invalid value: ${value}`);
  }

  if (unitType === 'time') {
    return formatTimeFromMilliseconds(value);
  }

  if (unitType === 'distance' || unitType === 'height') {
    return formatDistanceFromCentimeters(value);
  }

  if (unitType === 'count') {
    return String(Math.round(value));
  }

  throw new Error(`Unknown unit type: ${unitType}`);
}

// ============================================================================
// TIME PARSING & FORMATTING
// ============================================================================

/**
 * Parse time string in format "MM:SS.hh" or "M:SS.hh" to milliseconds
 * Examples:
 *   "12:34.56" → 754560 ms
 *   "4:12.34" → 252340 ms
 *   "0:56.78" → 56780 ms
 *   "1:00.00" → 60000 ms
 */
function parseTimeToMilliseconds(timeStr: string): number {
  const timeRegex = /^(\d+):(\d{2})\.(\d{2})$/;
  const match = timeStr.match(timeRegex);

  if (!match) {
    throw new Error(
      `Invalid time format: "${timeStr}". Expected format: MM:SS.hh or M:SS.hh`
    );
  }

  const [, minutesStr, secondsStr, centisecondsStr] = match;
  const minutes = parseInt(minutesStr, 10);
  const seconds = parseInt(secondsStr, 10);
  const centiseconds = parseInt(centisecondsStr, 10);

  if (seconds > 59) {
    throw new Error(`Invalid seconds: ${seconds} (must be 0-59)`);
  }
  if (centiseconds > 99) {
    throw new Error(`Invalid centiseconds: ${centiseconds} (must be 0-99)`);
  }

  const totalMs = minutes * 60000 + seconds * 1000 + centiseconds * 10;
  return totalMs;
}

/**
 * Format milliseconds to time string in format "MM:SS.hh"
 * Examples:
 *   754560 → "12:34.56"
 *   252340 → "04:12.34"
 *   56780 → "00:56.78"
 */
function formatTimeFromMilliseconds(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.round((ms % 1000) / 10);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

// ============================================================================
// DISTANCE PARSING & FORMATTING
// ============================================================================

/**
 * Parse distance string in format "M.cc" to centimeters
 * Examples:
 *   "5.45" → 545 cm
 *   "12.34" → 1234 cm
 *   "2.50" → 250 cm
 */
function parseDistanceToCentimeters(distanceStr: string): number {
  const distanceRegex = /^(\d+)\.(\d{2})$/;
  const match = distanceStr.match(distanceRegex);

  if (!match) {
    throw new Error(
      `Invalid distance format: "${distanceStr}". Expected format: M.cc (e.g., 5.45)`
    );
  }

  const [, metersStr, centimetersStr] = match;
  const meters = parseInt(metersStr, 10);
  const centimeters = parseInt(centimetersStr, 10);

  if (centimeters > 99) {
    throw new Error(`Invalid centimeters: ${centimeters} (must be 0-99)`);
  }

  const totalCm = meters * 100 + centimeters;
  return totalCm;
}

/**
 * Format centimeters to distance string in format "M.cc"
 * Examples:
 *   545 → "5.45"
 *   1234 → "12.34"
 *   250 → "2.50"
 */
function formatDistanceFromCentimeters(cm: number): string {
  const meters = Math.floor(cm / 100);
  const centimeters = cm % 100;

  return `${meters}.${String(centimeters).padStart(2, '0')}`;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate that a value matches a unit type
 * Useful for form validation before submission
 */
export function validateValue(value: string, unitType: UnitType): {
  valid: boolean;
  error?: string;
  parsed?: number;
} {
  try {
    const parsed = parseToRaw(value, unitType);
    return { valid: true, parsed };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get a placeholder/example for a given unit type
 */
export function getPlaceholder(unitType: UnitType): string {
  switch (unitType) {
    case 'time':
      return '01:23.45';
    case 'distance':
    case 'height':
      return '5.45';
    case 'count':
      return '100';
    default:
      return '';
  }
}

/**
 * Get human-readable unit label
 */
export function getUnitLabel(unitType: UnitType): string {
  switch (unitType) {
    case 'time':
      return 'MM:SS.hh';
    case 'distance':
      return 'meters (M.cc)';
    case 'height':
      return 'meters (M.cc)';
    case 'count':
      return 'count';
    default:
      return '';
  }
}

// ============================================================================
// COMPARISON HELPERS (for determining new records)
// ============================================================================

/**
 * Compare two raw values to determine if one is better than another
 * @param newValue - New result raw value
 * @param currentBest - Current best raw value
 * @param sortOrder - 'ASC' (lower is better, like times) or 'DESC' (higher is better, like distances)
 * @returns true if newValue is better than currentBest
 */
export function isBetter(
  newValue: number,
  currentBest: number,
  sortOrder: 'ASC' | 'DESC'
): boolean {
  if (sortOrder === 'ASC') {
    return newValue < currentBest;
  } else {
    return newValue > currentBest;
  }
}

/**
 * Calculate improvement between two values
 * @param newValue - New result
 * @param previousValue - Previous result
 * @param sortOrder - 'ASC' or 'DESC'
 * @returns Object with improvement delta and percentage
 */
export function calculateImprovement(
  newValue: number,
  previousValue: number,
  sortOrder: 'ASC' | 'DESC'
): { delta: number; percentage: number; isImprovement: boolean } {
  const delta =
    sortOrder === 'ASC'
      ? previousValue - newValue // Lower is better
      : newValue - previousValue; // Higher is better

  const percentage = (delta / previousValue) * 100;
  const isImprovement = delta > 0;

  return { delta: Math.abs(delta), percentage: Math.abs(percentage), isImprovement };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type RecordValue = {
  raw: number;
  display: string;
  unitType: UnitType;
};

export type ParseError = {
  field: string;
  message: string;
};