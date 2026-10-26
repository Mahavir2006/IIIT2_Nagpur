import { useEffect, useMemo, useState } from "react";
import { CloudRain, RotateCcw } from "lucide-react";
import type { WeatherForecast } from "@/server/open-meteo";

const localTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  hour: "numeric",
});

export function WeatherForecastPanel() {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch("/api/pravaah/weather", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Forecast request failed.");
        return payload as WeatherForecast;
      })
      .then(setForecast)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Forecast unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey]);

  const next24 = useMemo(() => {
    if (!forecast) return [];
    const now = Date.now();
    return forecast.hours.filter((hour) => new Date(hour.validAt).getTime() >= now).slice(0, 24);
  }, [forecast]);
  const stats = useMemo(() => {
    if (!forecast) return null;
    const nextSix = forecast.hours.slice(0, 6);
    const next24Hours = forecast.hours.slice(0, 24);
    return {
      sixHourRain: nextSix.reduce((sum, hour) => sum + (hour.precipitationMm ?? 0), 0),
      maxHourlyRain: Math.max(0, ...next24Hours.map((hour) => hour.precipitationMm ?? 0)),
      maxProbability: Math.max(0, ...next24Hours.map((hour) => hour.precipitationProbabilityPct ?? 0)),
      maxRain: Math.max(0, ...next24.map((hour) => hour.precipitationMm ?? 0)),
    };
  }, [forecast, next24]);

  return (
    <section className="weather-forecast" aria-labelledby="weather-forecast-title">
      <header className="weather-forecast-head">
        <div>
          <p className="weather-eyebrow"><CloudRain size={14} /> MODEL FORECAST · PROVIDER FEED</p>
          <h3 id="weather-forecast-title">Next 72 hours · Marine Lines</h3>
          <p>Open-Meteo model forecast · Mumbai · Asia/Kolkata</p>
        </div>
        <button type="button" className="ops-icon-button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh weather forecast">
          <RotateCcw size={14} /> {loading ? "Loading" : "Refresh"}
        </button>
      </header>
      {loading && <div className="weather-state">Requesting the forecast provider…</div>}
      {error && !loading && (
        <div className="weather-state weather-error" role="status">
          <strong>Forecast unavailable</strong><span>{error}</span>
          <small>The rainfall scenario above remains synthetic and is not a fallback forecast.</small>
        </div>
      )}
      {forecast && stats && !loading && (
        <>
          <div className="weather-stats">
            <div><small>Rain next 6h</small><b>{stats.sixHourRain.toFixed(1)} <i>mm</i></b></div>
            <div><small>Peak hourly · next 24h</small><b>{stats.maxHourlyRain.toFixed(1)} <i>mm</i></b></div>
            <div><small>Peak rain chance · next 24h</small><b>{stats.maxProbability.toFixed(0)}<i>%</i></b></div>
          </div>
          <div className="weather-chart" role="img" aria-label={`Hourly precipitation forecast for the next ${next24.length} hours. Maximum ${stats.maxRain.toFixed(1)} millimetres per hour.`}>
            {next24.map((hour) => {
              const amount = hour.precipitationMm ?? 0;
              const height = stats.maxRain > 0 ? Math.max(3, (amount / stats.maxRain) * 100) : 3;
              return <span key={hour.validAt} title={`${localTime.format(new Date(hour.validAt))}: ${amount.toFixed(1)} mm precipitation; ${hour.precipitationProbabilityPct ?? "—"}% chance`}>
                <i style={{ height: `${height}%` }} />
                <small>{new Date(hour.validAt).getHours() % 6 === 0 ? localTime.format(new Date(hour.validAt)).split(" ").at(-1) : ""}</small>
              </span>;
            })}
          </div>
          <div className="weather-chart-axis"><span>Hourly precipitation · next 24h</span><span>mm / hour</span></div>
          <details className="weather-hours">
            <summary>Inspect all {forecast.hours.length} hourly values</summary>
            <div className="weather-hours-table">
              {forecast.hours.map((hour) => <div key={hour.validAt}>
                <time dateTime={hour.validAt}>{localTime.format(new Date(hour.validAt))}</time>
                <span>{hour.precipitationMm === null ? "—" : `${hour.precipitationMm.toFixed(1)} mm`}</span>
                <span>{hour.precipitationProbabilityPct === null ? "—" : `${hour.precipitationProbabilityPct}% chance`}</span>
                <span>{hour.temperatureC === null ? "—" : `${hour.temperatureC.toFixed(1)}°C`}</span>
              </div>)}
            </div>
          </details>
          <footer className="weather-forecast-foot">
            <span>{forecast.quality.returnedHours}/72 hours · {forecast.quality.status} coverage · Retrieved {new Date(forecast.retrievedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
            <span><a href={forecast.attributionUrl} target="_blank" rel="noreferrer">Data: Open-Meteo</a> · <a href={forecast.licenseUrl} target="_blank" rel="noreferrer">CC BY 4.0</a></span>
          </footer>
        </>
      )}
    </section>
  );
}
