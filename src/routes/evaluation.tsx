import { createFileRoute } from "@tanstack/react-router";
import { ModelHealthDashboard } from "@/components/dashboards/ModelHealthDashboard";

export const Route = createFileRoute("/evaluation")({
  head: () => ({ meta: [{ title: "Model Health & Evaluation — PRAVAAH" }] }),
  component: ModelHealthDashboard,
});
