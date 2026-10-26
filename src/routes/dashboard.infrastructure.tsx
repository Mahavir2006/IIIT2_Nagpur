import { createFileRoute } from "@tanstack/react-router";
import { OperationalDashboard } from "@/components/dashboards/OperationalDashboard";

export const Route = createFileRoute("/dashboard/infrastructure")({
  head: () => ({ meta: [{ title: "Infrastructure Operations — PRAVAAH" }] }),
  component: () => <OperationalDashboard roleId="infrastructure" />,
});
