import { createFileRoute } from "@tanstack/react-router";
import { OperationalDashboard } from "@/components/dashboards/OperationalDashboard";

export const Route = createFileRoute("/dashboard/flood")({
  head: () => ({ meta: [{ title: "Flood Operations — PRAVAAH" }] }),
  component: () => <OperationalDashboard roleId="flood" />,
});
