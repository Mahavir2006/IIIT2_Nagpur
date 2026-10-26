const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const CACHE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

const forecastPoint = { name: "Marine Lines", city: "Mumbai", latitude: 18.943, longitude: 72.823 };

export interface WeatherForecastHour {
  validAt: string;
  precipitationMm: number | null;
  rainMm: number | null;
  precipitationProbabilityPct: number | null;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeedKmh: number | null;
}

export interface WeatherForecast {
  sourceId: "open-meteo";
  provider: "Open-Meteo Forecast API";
  attributionUrl: "https://open-meteo.com/en/docs";
  license: "CC BY 4.0";
  licenseUrl: "https://open-meteo.com/en/terms";
  dataClass: "forecast";
  location: typeof forecastPoint & { timezone: "Asia/Kolkata"; elevationMeters: number | null };
  modelSelection: "best_match";
  retrievedAt: string;
  units: { precipitation: "mm"; temperature: "°C"; humidity: "%"; windSpeed: "km/h" };
  quality: { status: "complete" | "partial"; expectedHours: 72; returnedHours: number; missingValues: number };
  hours: WeatherForecastHour[];
}

type ProviderPayload = {
  latitude?: unknown;
  longitude?: unknown;
  elevation?: unknown;
  timezone?: unknown;
  hourly?: Record<string, unknown>;
  hourly_units?: Record<string, unknown>;
};

type ArchivePayload = ProviderPayload & { utc_offset_seconds?: unknown };

export interface HistoricalWeatherHour {
  validAt: string;
  precipitationMm: number | null;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeedKmh: number | null;
}

export interface HistoricalWeatherSeries {
  sourceId: "open-meteo-era5-archive";
  provider: "Open-Meteo Historical Weather API";
  attributionUrl: "https://open-meteo.com/en/docs/historical-weather-api";
  license: "CC BY 4.0";
  licenseUrl: "https://open-meteo.com/en/terms";
  dataClass: "historical_reanalysis";
  model: "era5";
  location: typeof forecastPoint & { timezone: "Asia/Kolkata"; elevationMeters: number | null };
  requested: { startDate: string; endDate: string };
  retrievedAt: string;
  units: { precipitation: "mm"; temperature: "°C"; humidity: "%"; windSpeed: "km/h" };
  quality: { status: "complete" | "partial"; expectedHours: number; returnedHours: number; missingValues: number };
  hours: HistoricalWeatherHour[];
}

let cached: { data: WeatherForecast; expiresAt: number } | undefined;
let lastAttemptAt: string | null = null;
let lastError: string | null = null;
let lastSuccessAt: string | null = null;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Open-Meteo response is missing hourly ${name}.`);
  return value;
}

function parseValidAt(value: unknown): string {
  if (typeof value !== "string") throw new Error("Open-Meteo response contains an invalid hourly timestamp.");
  const withOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}+05:30`;
  const parsed = new Date(withOffset);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Open-Meteo response contains an invalid hourly timestamp.");
  return parsed.toISOString();
}

export function parseOpenMeteoForecast(payload: ProviderPayload, retrievedAt = new Date().toISOString()): WeatherForecast {
  const hourly = payload.hourly;
  if (!hourly || typeof hourly !== "object") throw new Error("Open-Meteo response has no hourly forecast.");
  const times = asArray(hourly.time, "time");
  const fields = {
    precipitation: asArray(hourly.precipitation, "precipitation"),
    rain: asArray(hourly.rain, "rain"),
    probability: asArray(hourly.precipitation_probability, "precipitation_probability"),
    temperature: asArray(hourly.temperature_2m, "temperature_2m"),
    humidity: asArray(hourly.relative_humidity_2m, "relative_humidity_2m"),
    wind: asArray(hourly.wind_speed_10m, "wind_speed_10m"),
  };
  if (times.length === 0 || times.length > 72 || Object.values(fields).some((values) => values.length !== times.length)) {
    throw new Error("Open-Meteo response has inconsistent hourly coverage.");
  }

  const hours = times.map((time, index) => ({
    validAt: parseValidAt(time),
    precipitationMm: numberOrNull(fields.precipitation[index]),
    rainMm: numberOrNull(fields.rain[index]),
    precipitationProbabilityPct: numberOrNull(fields.probability[index]),
    temperatureC: numberOrNull(fields.temperature[index]),
    relativeHumidityPct: numberOrNull(fields.humidity[index]),
    windSpeedKmh: numberOrNull(fields.wind[index]),
  }));
  const missingValues = hours.reduce((count, hour) => count + Object.values(hour).slice(1).filter((value) => value === null).length, 0);
  const elevation = numberOrNull(payload.elevation);
  return {
    sourceId: "open-meteo",
    provider: "Open-Meteo Forecast API",
    attributionUrl: "https://open-meteo.com/en/docs",
    license: "CC BY 4.0",
    licenseUrl: "https://open-meteo.com/en/terms",
    dataClass: "forecast",
    location: { ...forecastPoint, timezone: "Asia/Kolkata", elevationMeters: elevation },
    modelSelection: "best_match",
    retrievedAt,
    units: { precipitation: "mm", temperature: "°C", humidity: "%", windSpeed: "km/h" },
    quality: {
      status: hours.length === 72 && missingValues === 0 ? "complete" : "partial",
      expectedHours: 72,
      returnedHours: hours.length,
      missingValues,
    },
    hours,
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseOpenMeteoHistory(
  payload: ArchivePayload,
  startDate: string,
  endDate: string,
  retrievedAt = new Date().toISOString(),
): HistoricalWeatherSeries {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) throw new Error("A valid historical date range is required.");
  const hourly = payload.hourly;
  if (!hourly || typeof hourly !== "object") throw new Error("Open-Meteo archive response has no hourly data.");
  const times = asArray(hourly.time, "time");
  const fields = {
    precipitation: asArray(hourly.precipitation, "precipitation"),
    temperature: asArray(hourly.temperature_2m, "temperature_2m"),
    humidity: asArray(hourly.relative_humidity_2m, "relative_humidity_2m"),
    wind: asArray(hourly.wind_speed_10m, "wind_speed_10m"),
  };
  if (!times.length || Object.values(fields).some((values) => values.length !== times.length)) {
    throw new Error("Open-Meteo archive response has inconsistent hourly coverage.");
  }
  const hours = times.map((time, index) => ({
    validAt: parseValidAt(time),
    precipitationMm: numberOrNull(fields.precipitation[index]),
    temperatureC: numberOrNull(fields.temperature[index]),
    relativeHumidityPct: numberOrNull(fields.humidity[index]),
    windSpeedKmh: numberOrNull(fields.wind[index]),
  }));
  const expectedHours = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 3_600_000) + 24;
  const missingValues = hours.reduce((count, hour) => count + Object.values(hour).slice(1).filter((value) => value === null).length, 0);
  return {
    sourceId: "open-meteo-era5-archive",
    provider: "Open-Meteo Historical Weather API",
    attributionUrl: "https://open-meteo.com/en/docs/historical-weather-api",
    license: "CC BY 4.0",
    licenseUrl: "https://open-meteo.com/en/terms",
    dataClass: "historical_reanalysis",
    model: "era5",
    location: { ...forecastPoint, timezone: "Asia/Kolkata", elevationMeters: numberOrNull(payload.elevation) },
    requested: { startDate, endDate },
    retrievedAt,
    units: { precipitation: "mm", temperature: "°C", humidity: "%", windSpeed: "km/h" },
    quality: {
      status: hours.length === expectedHours && missingValues === 0 ? "complete" : "partial",
      expectedHours,
      returnedHours: hours.length,
      missingValues,
    },
    hours,
  };
}

export async function getOpenMeteoHistory(startDate: string, endDate: string): Promise<HistoricalWeatherSeries> {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) throw new Error("A valid historical date range is required.");
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const days = Math.floor((end - start) / 86_400_000) + 1;
  const latestAvailableDate = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  if (days > 370) throw new Error("Historical requests are limited to 370 days per call.");
  if (endDate > latestAvailableDate) throw new Error(`ERA5 archive requests must end on or before ${latestAvailableDate} to allow for publication delay.`);
  const params = new URLSearchParams({
    latitude: String(forecastPoint.latitude),
    longitude: String(forecastPoint.longitude),
    start_date: startDate,
    end_date: endDate,
    hourly: "precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m",
    timezone: "Asia/Kolkata",
    timeformat: "iso8601",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    temperature_unit: "celsius",
    models: "era5",
  });
  try {
    const response = await fetch(`${OPEN_METEO_ARCHIVE_URL}?${params}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Open-Meteo archive returned HTTP ${response.status}.`);
    const data = parseOpenMeteoHistory((await response.json()) as ArchivePayload, startDate, endDate);
    if (data.hours.length < 24) throw new Error(`Open-Meteo archive returned only ${data.hours.length} hours.`);
    return data;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Open-Meteo historical archive request failed.");
  }
}

export async function getOpenMeteoForecast(): Promise<WeatherForecast> {
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  lastAttemptAt = new Date().toISOString();
  const params = new URLSearchParams({
    latitude: String(forecastPoint.latitude),
    longitude: String(forecastPoint.longitude),
    hourly: "precipitation,precipitation_probability,rain,temperature_2m,relative_humidity_2m,wind_speed_10m",
    forecast_hours: "72",
    timezone: "Asia/Kolkata",
    timeformat: "iso8601",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    temperature_unit: "celsius",
    models: "best_match",
  });
  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}.`);
    const payload = (await response.json()) as ProviderPayload;
    const data = parseOpenMeteoForecast(payload);
    if (data.hours.length < 24) throw new Error(`Open-Meteo returned only ${data.hours.length} forecast hours.`);
    cached = { data, expiresAt: Date.now() + CACHE_MS };
    lastSuccessAt = data.retrievedAt;
    lastError = null;
    return data;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Open-Meteo request failed.";
    throw new Error(lastError);
  }
}

export function getOpenMeteoStatus() {
  return {
    status: lastError ? "unavailable" : lastSuccessAt ? "healthy" : "not-checked",
    lastAttemptAt,
    lastSuccessAt,
    cachedUntil: cached && cached.expiresAt > Date.now() ? new Date(cached.expiresAt).toISOString() : null,
    error: lastError,
  };
}
