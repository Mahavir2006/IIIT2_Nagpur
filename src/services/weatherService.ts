/**
 * Client for the app's own live-weather proxy (GET /api/weather/*, served by
 * src/server/weather-india.ts from IMD). Keeps a short in-session cache so
 * tab switches and metric toggles never re-hit the network.
 */

export interface WeatherForecastDay {
  day: number;
  max: number | null;
  min: number | null;
  condition: string;
}

export interface WeatherStation {
  id: number;
  name: string;
  place: string;
  region: string;
  lat: number | null;
  lon: number | null;
  observedAt: string | null;
  updatedAt: string | null;
  tempMax: number | null;
  tempMaxDeparture: number | null;
  tempMin: number | null;
  rainfall: number | null;
  humidityMorning: number | null;
  humidityEvening: number | null;
  sunrise: string | null;
  sunset: string | null;
  forecast: WeatherForecastDay[];
}

export interface WeatherSummary {
  generatedAt: string;
  count: number;
  failed: number;
  stations: WeatherStation[];
}

const CLIENT_CACHE_MS = 10 * 60_000;

let cached: { at: number; data: WeatherSummary } | null = null;
let inflight: Promise<WeatherSummary> | null = null;

export function peekWeatherSummary(): WeatherSummary | null {
  if (cached && Date.now() - cached.at < CLIENT_CACHE_MS) return cached.data;
  return null;
}

export async function fetchWeatherSummary(signal?: AbortSignal): Promise<WeatherSummary> {
  const fresh = peekWeatherSummary();
  if (fresh) return fresh;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch("/api/weather/summary", signal ? { signal } : undefined);
      if (!response.ok) throw new Error(`weather summary ${response.status}`);
      const data = (await response.json()) as WeatherSummary;
      if (!data || !Array.isArray(data.stations)) throw new Error("malformed weather summary");
      cached = { at: Date.now(), data };
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Today's forecast text (day 1) — used for the rain-signal heuristic. */
export function todayForecast(station: WeatherStation): string {
  return station.forecast[0]?.condition ?? "";
}
