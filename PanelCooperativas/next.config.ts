import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    // Los logos (hasta 2 MB) se suben con Server Actions, cuyo límite por
    // defecto es 1 MB. 3 MB deja margen para el resto del FormData.
    serverActions: {
      bodySizeLimit: "3mb",
    },
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
