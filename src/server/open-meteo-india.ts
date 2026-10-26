import { INDIA_STATE_REGISTRY } from "./pravaah-india";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const HOURLY_FIELDS = "precipitation,rain,precipitation_probability";

type ForecastPayload = {
  latitude?: unknown;
  longitude?: unknown;
  hourly?: Record<string, unknown>;
};

type StateForecast = {
  stateCode: string;
  stateName: string;
  dataClass: "forecast";
  status: "available" | "partial" | "unavailable";
  representativePoint: { latitude: number; longitude: number };
  resolvedPoint?: { latitude: number | null; longitude: number | null };
  validFrom?: string;
  retrievedAt: string;
  hoursReturned: number;
  missingValues?: number;
  precipitationTotalMm?: { next24Hours: number | null; next72Hours: number | null };
  peakRainMmHr?: { next24Hours: number | null; next72Hours: number | null };
  peakPrecipitationProbabilityPct?: { next24Hours: number | null; next72Hours: number | null };
  error?: string;
};

export type IndiaWeatherForecast = {
  sourceId: "open-meteo";
  provider: "Open-Meteo Forecast API";
  attributionUrl: "https://open-meteo.com/en/docs";
  license: "CC BY 4.0";
  licenseUrl: "https://open-meteo.com/en/terms";
  dataClass: "forecast";
  modelSelection: "best_match";
  locationBasis: "one representative coordinate per state or union territory";
  retrievedAt: string;
  quality: {
    status: "complete" | "partial";
    expectedLocations: number;
    availableLocations: number;
    partialLocations: number;
    unavailableLocations: number;
  };
  locations: StateForecast[];
};

let cached: { data: IndiaWeatherForecast; expiresAt: number } | undefined;

function valuesAt(payload: ForecastPayload, field: string): unknown[] {
  const values = payload.hourly?.[field];
  if (!Array.isArray(values)) throw new Error(`Open-Meteo response is missing hourly ${field}.`);
  return values;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeStateForecast(
  payload: ForecastPayload,
  index: number,
  retrievedAt: string,
): StateForecast {
  const meta = INDIA_STATE_REGISTRY[index];
  if (!meta) throw new Error("Open-Meteo response contains an unexpected location.");

  const times = valuesAt(payload, "time");
  const precipitation = valuesAt(payload, "precipitation");
  const rain = valuesAt(payload, "rain");
  const probability = valuesAt(payload, "precipitation_probability");
  if (
    times.length < 24 ||
    times.length > 72 ||
    precipitation.length !== times.length ||
    rain.length !== times.length ||
    probability.length !== times.length
  ) {
    throw new Error(`Open-Meteo returned inconsistent hourly coverage for ${meta.name}.`);
  }

  const parsedTimes = times.map((time) => {
    if (typeof time !== "string")
      throw new Error(`Open-Meteo returned an invalid timestamp for ${meta.name}.`);
    const withOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(time) ? time : `${time}+05:30`;
    const parsed = new Date(withOffset);
    if (!Number.isFinite(parsed.getTime()))
      throw new Error(`Open-Meteo returned an invalid timestamp for ${meta.name}.`);
    return parsed.toISOString();
  });
  if (parsedTimes.some((time, i) => i > 0 && time <= parsedTimes[i - 1]!)) {
    throw new Error(`Open-Meteo returned non-monotonic hourly timestamps for ${meta.name}.`);
  }
  const validFrom = parsedTimes[0];
  if (!validFrom) throw new Error(`Open-Meteo returned no forecast timestamp for ${meta.name}.`);

  const rainfallMm = precipitation.map(numberOrNull);
  const rainMm = rain.map(numberOrNull);
  const probabilities = probability.map(numberOrNull);
  const firstDay = Math.min(24, times.length);
  const total = (items: Array<number | null>, limit: number) => {
    const selected = items.slice(0, limit);
    if (selected.some((value) => value === null)) return null;
    return Number(selected.reduce<number>((sum, value) => sum + (value ?? 0), 0).toFixed(1));
  };
  const peak = (items: Array<number | null>, limit: number) =>
    items.slice(0, limit).reduce<number | null>((maximum, value) => {
      if (value === null) return maximum;
      return maximum === null ? value : Math.max(maximum, value);
    }, null);
  const peak24hRain = peak(rainMm, firstDay);
  const peak72hRain = peak(rainMm, 72);
  const missingValues = [...rainfallMm, ...rainMm, ...probabilities].filter(
    (value) => value === null,
  ).length;

  return {
    stateCode: meta.code,
    stateName: meta.name,
    dataClass: "forecast",
    status: missingValues === 0 ? "available" : "partial",
    representativePoint: { latitude: meta.lat, longitude: meta.lon },
    resolvedPoint: {
      latitude: numberOrNull(payload.latitude),
      longitude: numberOrNull(payload.longitude),
    },
    validFrom,
    retrievedAt,
    hoursReturned: times.length,
    missingValues,
    precipitationTotalMm: {
      next24Hours: total(rainfallMm, firstDay),
      next72Hours: total(rainfallMm, 72),
    },
    peakRainMmHr: {
      next24Hours:
        rainMm.slice(0, firstDay).some((value) => value === null) || peak24hRain === null
          ? null
          : Number(peak24hRain.toFixed(1)),
      next72Hours:
        rainMm.some((value) => value === null) || peak72hRain === null
          ? null
          : Number(peak72hRain.toFixed(1)),
    },
    peakPrecipitationProbabilityPct: {
      next24Hours: probabilities.slice(0, firstDay).some((value) => value === null)
        ? null
        : peak(probabilities, firstDay),
      next72Hours: probabilities.some((value) => value === null) ? null : peak(probabilities, 72),
    },
  };
}

export function parseIndiaWeatherForecast(
  input: unknown,
  retrievedAt = new Date().toISOString(),
): IndiaWeatherForecast {
  if (!Array.isArray(input) || input.length !== INDIA_STATE_REGISTRY.length) {
    throw new Error(
      `Open-Meteo returned an invalid location count; expected ${INDIA_STATE_REGISTRY.length}.`,
    );
  }

  const locations = input.map((item, index) => {
    try {
      if (item === null || typeof item !== "object")
        throw new Error("Open-Meteo returned an invalid location payload.");
      return summarizeStateForecast(item as ForecastPayload, index, retrievedAt);
    } catch (error) {
      const meta = INDIA_STATE_REGISTRY[index]!;
      return {
        stateCode: meta.code,
        stateName: meta.name,
        dataClass: "forecast" as const,
        status: "unavailable" as const,
        representativePoint: { latitude: meta.lat, longitude: meta.lon },
        retrievedAt,
        hoursReturned: 0,
        error: error instanceof Error ? error.message : "Open-Meteo location data is unavailable.",
      };
    }
  });
  const availableLocations = locations.filter((location) => location.status === "available").length;
  const partialLocations = locations.filter((location) => location.status === "partial").length;

  return {
    sourceId: "open-meteo",
    provider: "Open-Meteo Forecast API",
    attributionUrl: "https://open-meteo.com/en/docs",
    license: "CC BY 4.0",
    licenseUrl: "https://open-meteo.com/en/terms",
    dataClass: "forecast",
    modelSelection: "best_match",
    locationBasis: "one representative coordinate per state or union territory",
    retrievedAt,
    quality: {
      status: availableLocations === locations.length ? "complete" : "partial",
      expectedLocations: INDIA_STATE_REGISTRY.length,
      availableLocations,
      partialLocations,
      unavailableLocations: locations.filter((location) => location.status === "unavailable")
        .length,
    },
    locations,
  };
}

export async function getIndiaWeatherForecast(): Promise<IndiaWeatherForecast> {
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const params = new URLSearchParams({
    latitude: INDIA_STATE_REGISTRY.map((state) => state.lat).join(","),
    longitude: INDIA_STATE_REGISTRY.map((state) => state.lon).join(","),
    hourly: HOURLY_FIELDS,
    forecast_hours: "72",
    timezone: "Asia/Kolkata",
    timeformat: "iso8601",
    precipitation_unit: "mm",
    models: "best_match",
  });
  const response = await fetch(`${OPEN_METEO_URL}?${params}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Open-Meteo India forecast returned HTTP ${response.status}.`);

  const data = parseIndiaWeatherForecast(await response.json());
  cached = { data, expiresAt: Date.now() + CACHE_MS };
  return data;
}
