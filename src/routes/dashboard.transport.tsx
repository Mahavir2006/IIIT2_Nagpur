import { createFileRoute } from "@tanstack/react-router";
import { OperationalDashboard } from "@/components/dashboards/OperationalDashboard";

export const Route = createFileRoute("/dashboard/transport")({
  head: () => ({ meta: [{ title: "Transport Operations — PRAVAAH" }] }),
  component: () => <OperationalDashboard roleId="transport" />,
});
