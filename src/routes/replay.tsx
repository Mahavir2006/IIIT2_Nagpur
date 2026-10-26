import { createFileRoute } from "@tanstack/react-router";
import { ReplayDashboard } from "@/components/dashboards/AdvancedDashboards";

export const Route = createFileRoute("/replay")({
  head: () => ({ meta: [{ title: "Scenario Replay — PRAVAAH" }] }),
  component: ReplayDashboard,
});
