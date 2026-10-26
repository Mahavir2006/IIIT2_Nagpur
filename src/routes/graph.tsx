import { createFileRoute } from "@tanstack/react-router";
import { CascadePage } from "./cascade";

export const Route = createFileRoute("/graph")({
  head: () => ({ meta: [{ title: "Dependency Graph — PRAVAAH" }] }),
  component: CascadePage,
});
