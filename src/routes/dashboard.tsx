import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { RoleDirectory } from "@/components/dashboards/OperationalDashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Operational Workspaces — PRAVAAH" }] }),
  component: DashboardShell,
});

function DashboardShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname === "/dashboard" ? <RoleDirectory /> : <Outlet />;
}
