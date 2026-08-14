import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["form-data"],
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
