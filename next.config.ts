import type { NextConfig } from "next";

const strapiUrl = new URL(process.env.NEXT_PUBLIC_STRAPI_URL || "http://127.0.0.1:1337");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    unoptimized: process.env.NODE_ENV !== "production",
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    qualities: [75, 80, 85],
    remotePatterns: [
      {
        protocol: strapiUrl.protocol.replace(":", "") as "http" | "https",
        hostname: strapiUrl.hostname,
        port: strapiUrl.port,
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "1337",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "1337",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
