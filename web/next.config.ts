import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to the `web/` folder so Next.js doesn't
  // get confused by the parent career-ops repo's package-lock.json.
  turbopack: {
    root: resolve(__dirname),
  },
};

export default nextConfig;
