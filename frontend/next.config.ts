import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source:      "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:3001"}/api/:path*`,
      },
      {
        // Socket.IO uses long-polling before upgrading to WebSocket.
        // Both transports must be proxied or the socket will fail.
        source:      "/socket.io/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:3001"}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;