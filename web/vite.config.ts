import { cloudflare } from "@cloudflare/vite-plugin";
import mdx from "@mdx-js/rollup";
import rehypeShiki from "@shikijs/rehype";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";

export default defineConfig({
  // Pin the dev server to 3000 so the sign-in redirect URI built from the
  // browser origin, http://localhost:3000/api/auth/callback, matches the one
  // registered in WorkOS (Vite's default :5173 would be rejected).
  server: { port: 3000 },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    // Docs pages: content/docs/*.mdx. Code blocks are highlighted at build
    // time with both themes; CSS picks one (see docs.css).
    {
      enforce: "pre",
      ...mdx({
        providerImportSource: "@mdx-js/react",
        remarkPlugins: [remarkGfm, remarkFrontmatter],
        rehypePlugins: [
          [
            rehypeShiki,
            {
              themes: { light: "github-light", dark: "github-dark-dimmed" },
              defaultColor: false,
            },
          ],
        ],
      }),
    },
    tanstackStart(),
    viteReact({ include: /\.(mdx|js|jsx|ts|tsx)$/ }),
  ],
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
      "@openvscan/db": new URL("../packages/db/src/index.ts", import.meta.url)
        .pathname,
      "@openvscan/core": new URL(
        "../packages/core/src/index.ts",
        import.meta.url,
      ).pathname,
      "@openvscan/github": new URL(
        "../packages/github/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
