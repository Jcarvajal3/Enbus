import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Tree-shake barrel exports — eliminates unused icons/components from bundle
    optimizePackageImports: [
      "@phosphor-icons/react",
      "recharts",
      "sonner",
      "class-variance-authority",
    ],
  },
  // Strip console.log in production for smaller bundles
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

export default nextConfig;
