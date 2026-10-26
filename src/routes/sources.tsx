import { createFileRoute } from "@tanstack/react-router";
import { SourceHealthDashboard } from "@/components/dashboards/AdvancedDashboards";

export const Route = createFileRoute("/sources")({
  head: () => ({ meta: [{ title: "Data Sources — PRAVAAH" }] }),
  component: SourceHealthDashboard,
});
