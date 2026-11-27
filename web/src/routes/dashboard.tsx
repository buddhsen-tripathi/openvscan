import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requireSession } from "@/src/lib/session";

export const Route = createFileRoute("/dashboard")({
  // Signed-out visitors come back to the page they asked for after signing in.
  beforeLoad: async ({ location }) =>
    requireSession({ data: { returnTo: location.href } }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user } = Route.useRouteContext();

  return (
    <DashboardProvider user={user}>
      <DashboardShell>
        <Outlet />
      </DashboardShell>
    </DashboardProvider>
  );
}
