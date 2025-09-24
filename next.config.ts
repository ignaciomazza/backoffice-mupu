// next.config.ts
import { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Authorization",
            value: "Bearer YOUR_TOKEN", // Ajustar de acuerdo al sistema de autenticación.
          },
        ],
      },
    ];
  },
  env: {
    JWT_SECRET: process.env.JWT_SECRET,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
