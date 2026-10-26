import { createFileRoute } from "@tanstack/react-router";
import { ScenarioComparisonDashboard } from "@/components/dashboards/AdvancedDashboards";

export const Route = createFileRoute("/comparison")({
  head: () => ({ meta: [{ title: "Scenario Comparison — PRAVAAH" }] }),
  component: ScenarioComparisonDashboard,
});
