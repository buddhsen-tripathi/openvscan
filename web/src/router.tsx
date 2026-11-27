import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 2,
      },
    },
  });

  return createTanStackRouter({
    routeTree,
    context: {
      queryClient,
    },
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

let router: ReturnType<typeof createRouter> | undefined;

export function getRouter() {
  // On the server every request needs its own router and QueryClient: a shared
  // one leaks cached data and pending redirects between requests and users.
  if (typeof window === "undefined") return createRouter();
  router ??= createRouter();
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
