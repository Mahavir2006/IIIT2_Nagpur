import { createFileRoute } from "@tanstack/react-router";
import { OperationalDashboard } from "@/components/dashboards/OperationalDashboard";

export const Route = createFileRoute("/dashboard/command")({
  head: () => ({ meta: [{ title: "Command Operations — PRAVAAH" }] }),
  component: () => <OperationalDashboard roleId="command" />,
});
