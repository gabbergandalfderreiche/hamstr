import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The Base Account SDK's Node entry pulls in Coinbase's CDP SDK, which lazy-imports optional
  // packages we don't use. Loading them from node_modules at runtime avoids bundling those imports.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk"],
  // Preisvergleich (Demo): statische Seite in public/preisvergleich/, gebaut im Projekt "hamstere".
  // Next liefert index.html in Unterordnern nicht von selbst aus, darum diese Weiterleitung.
  async rewrites() {
    return [
      { source: "/preisvergleich", destination: "/preisvergleich/index.html" },
      { source: "/preisvergleich/mode", destination: "/preisvergleich/mode/index.html" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
