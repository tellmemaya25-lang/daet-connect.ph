import type { NextConfig } from "next";

// Package and attraction photos live in Supabase Storage. next/image refuses
// remote hosts that are not listed, so allow the project's own host.
function supabaseImagePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const { hostname, protocol } = new URL(url);
    return [
      {
        protocol: protocol === "http:" ? "http" : "https",
        hostname,
        pathname: "/storage/v1/object/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  // The Arena preview is hosted on a dynamic e2b.app subdomain. Allow its
  // origin for Next dev assets and Server Action requests through the proxy.
  allowedDevOrigins: ["*.e2b.app"],
  images: { remotePatterns: supabaseImagePatterns() },
  // Registration sends small document uploads through a Server Action. Each
  // guide file is independently capped and validated on the server.
  experimental: {
    serverActions: {
      allowedOrigins: ["*.e2b.app"],
      bodySizeLimit: "18mb",
    },
  },
};

export default nextConfig;
