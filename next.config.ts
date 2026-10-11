import type { NextConfig } from "next";
import { resolveNextBasePath } from "./lib/next-base-path";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  ...resolveNextBasePath(process.env.NEXT_PUBLIC_BASE_PATH),
  allowedDevOrigins: ["127.0.0.1"],
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
