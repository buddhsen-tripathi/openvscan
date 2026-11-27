import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import Link from "@/components/AppLink";
import { DocsArticle } from "@/components/docs/DocsArticle";
import { DocsPending } from "@/components/docs/DocsLayout";
import {
  docComponent,
  getDoc,
  hasDoc,
  INTRODUCTION_SLUG,
  loadDoc,
} from "@/components/docs/pages";

export const Route = createFileRoute("/docs/$slug")({
  loader: async ({ params }) => {
    if (params.slug === INTRODUCTION_SLUG)
      throw redirect({ to: "/docs", replace: true });
    const page = getDoc(params.slug);
    if (!page || !hasDoc(page.slug)) throw notFound();
    await loadDoc(page.slug); // warm the chunk before rendering
    return { slug: page.slug };
  },
  head: ({ params }) => {
    const page = getDoc(params.slug);
    return {
      meta: [
        { title: `${page?.title ?? "Not found"} · OpenVScan docs` },
        { name: "description", content: page?.description ?? "" },
      ],
    };
  },
  pendingComponent: DocsPending,
  component: DocPage,
  notFoundComponent: DocNotFound,
});

function DocPage() {
  const { slug } = Route.useLoaderData();
  // Keyed so the table of contents and scroll state reset between pages.
  return <DocsArticle key={slug} slug={slug} Content={docComponent(slug)} />;
}

function DocNotFound() {
  return (
    <div className="max-w-[640px] py-10">
      <p className="eyebrow text-[10.5px] text-stone">404</p>
      <h1 className="mt-3 font-display text-[40px] leading-tight text-ink">
        This page doesn't exist
      </h1>
      <p className="mt-3 text-[15px] text-stone">
        It may have moved. Pick a page from the menu, or start from the
        introduction.
      </p>
      <Link
        href="/docs"
        className="mt-6 inline-block text-[14px] font-medium text-ink underline underline-offset-4"
      >
        Go to the introduction
      </Link>
    </div>
  );
}
