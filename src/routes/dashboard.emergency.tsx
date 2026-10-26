import { createFileRoute } from "@tanstack/react-router";
import { OperationalDashboard } from "@/components/dashboards/OperationalDashboard";

export const Route = createFileRoute("/dashboard/emergency")({
  head: () => ({ meta: [{ title: "Emergency Operations — PRAVAAH" }] }),
  component: () => <OperationalDashboard roleId="emergency" />,
});
