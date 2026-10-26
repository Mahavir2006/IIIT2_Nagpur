import path from "node:path";

export type RuntimeConfig = {
  nodeEnv: string;
  dataDir: string;
  apiKey: string | undefined;
  tomtomApiKey: string | undefined;
  osrmBaseUrl: string | undefined;
  isProduction: boolean;
};

export function getRuntimeConfig(): RuntimeConfig {
  const dataDir = process.env["PRAVAAH_DATA_DIR"] ?? path.resolve(process.cwd(), "data");

  return {
    nodeEnv: process.env["NODE_ENV"] ?? "development",
    dataDir,
    apiKey: process.env["PRAVAAH_API_KEY"]?.trim() || undefined,
    tomtomApiKey: process.env["TOMTOM_API_KEY"]?.trim() || process.env["VITE_TOMTOM_API_KEY"]?.trim() || undefined,
    osrmBaseUrl: process.env["OSRM_BASE_URL"]?.trim() || undefined,
    isProduction: (process.env["NODE_ENV"] ?? "development") === "production",
  };
}

export function getRuntimeChecks() {
  const config = getRuntimeConfig();
  const warnings: string[] = [];

  if (!config.apiKey) {
    warnings.push("PRAVAAH_API_KEY is not configured; the backend is running in open demo mode.");
  }

  if (!config.tomtomApiKey) {
    warnings.push("TOMTOM_API_KEY is not configured; routing falls back to public OSRM or deterministic model results.");
  }

  if (!config.osrmBaseUrl) {
    warnings.push("OSRM_BASE_URL is not configured; public demo fallback is used for route planning.");
  }

  if (!config.isProduction) {
    warnings.push("This deployment is running in a non-production environment; persistence data is local and not yet HA-backed.");
  }

  return { config, warnings };
}
