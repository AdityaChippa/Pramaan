import { createRequire } from "module";
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer", "qrcode"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  webpack: (config) => {
    // R3F 8 must see exactly one React 18 copy. Exact-match aliases dedupe react/react-dom for
    // node_modules consumers (three ecosystem) without touching Next's per-layer app-router aliases.
    config.resolve.alias = {
      ...config.resolve.alias,
      react$: require.resolve("react"),
      "react-dom$": require.resolve("react-dom"),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
