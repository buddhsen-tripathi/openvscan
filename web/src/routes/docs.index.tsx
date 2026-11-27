import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsArticle } from "@/components/docs/DocsArticle";
import { DocsPending } from "@/components/docs/DocsLayout";
import {
  docComponent,
  getDoc,
  hasDoc,
  INTRODUCTION_SLUG,
  loadDoc,
} from "@/components/docs/pages";

export const Route = createFileRoute("/docs/")({
  loader: async () => {
    if (!hasDoc(INTRODUCTION_SLUG)) throw notFound();
    await loadDoc(INTRODUCTION_SLUG); // warm the chunk before rendering
  },
  head: () => ({
    meta: [
      { title: "Documentation · OpenVScan" },
      {
        name: "description",
        content: getDoc(INTRODUCTION_SLUG)?.description ?? "",
      },
    ],
  }),
  pendingComponent: DocsPending,
  component: DocsIndex,
});

function DocsIndex() {
  return (
    <DocsArticle
      slug={INTRODUCTION_SLUG}
      Content={docComponent(INTRODUCTION_SLUG)}
    />
  );
}
