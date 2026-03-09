import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const withMDX = createMDX({});
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: {
    unoptimized: true
  },
  pageExtensions: ["ts", "tsx", "md", "mdx"]
};

export default withMDX(nextConfig);
