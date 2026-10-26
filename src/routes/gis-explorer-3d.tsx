import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";

/* CesiumJS is the heaviest chunk in the app - load it only when this route is
   opened, and let the shared loader cover the wait. */
const GisExplorer3D = lazy(() =>
  import("@/components/gis3d/GisExplorer3D").then((m) => ({ default: m.GisExplorer3D })),
);

export const Route = createFileRoute("/gis-explorer-3d")({
  validateSearch: (search: Record<string, unknown>) => ({
    state:
      typeof search["state"] === "string" && (search["state"] as string).length > 0
        ? (search["state"] as string)
        : undefined,
    layer:
      typeof search["layer"] === "string" && (search["layer"] as string).length > 0
        ? (search["layer"] as string)
        : undefined,
    lat:
      typeof search["lat"] === "number" && Number.isFinite(search["lat"])
        ? search["lat"]
        : undefined,
    lon:
      typeof search["lon"] === "number" && Number.isFinite(search["lon"])
        ? search["lon"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "3D GIS Explorer — PRAVAAH" },
      {
        name: "description",
        content:
          "CesiumJS-powered urban resilience digital twin: flood simulation, traffic intelligence, cascading disaster visualization for Mumbai.",
      },
    ],
  }),
  component: GisExplorer3DPage,
});

function GisExplorer3DPage() {
  const search = Route.useSearch();
  return (
    <>
      <GisExplorer3D search={search} />
      <noscript>
        <p style={{ padding: 16 }}>The 3D GIS Explorer needs JavaScript.</p>
      </noscript>
    </>
  );
}
