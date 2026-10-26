import { createFileRoute } from "@tanstack/react-router";
import { OperationalDashboard } from "@/components/dashboards/OperationalDashboard";

export const Route = createFileRoute("/dashboard/research")({
  head: () => ({ meta: [{ title: "Research Operations — PRAVAAH" }] }),
  component: () => <OperationalDashboard roleId="research" />,
});
