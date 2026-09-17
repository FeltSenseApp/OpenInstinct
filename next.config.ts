import type { NextConfig } from "next";
import { withEve } from "eve/next";

const config: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default withEve(config);
