import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";

const Landing = lazy(() =>
  import("@/components/landing/Landing").then((m) => ({ default: m.Landing })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PRAVAAH — See the city. Understand the cascade." },
      {
        name: "description",
        content:
          "Urban resilience intelligence for understanding how rainfall, drainage, roads and emergency response interact across Mumbai.",
      },
    ],
  }),
  component: Landing,
});
