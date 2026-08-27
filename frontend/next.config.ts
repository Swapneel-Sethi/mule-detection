import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep firebase-admin out of the server bundle so the build doesn't need
  // to symlink-bundle it (avoids EPERM symlink errors on some Windows setups
  // during local Netlify packaging; remote Linux builds are unaffected).
  serverExternalPackages: ["firebase-admin"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
  },
  // Security headers applied to all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://public.tableau.com; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: https:; " +
              "font-src 'self' data:; " +
              "frame-src 'self' https://public.tableau.com; " +
              "connect-src 'self' http://127.0.0.1:5000 http://localhost:5000 http://127.0.0.1:8000 http://localhost:8000 https://firebasestorage.googleapis.com https://*.firebaseio.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://public.tableau.com; " +
              "frame-ancestors 'none';",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;