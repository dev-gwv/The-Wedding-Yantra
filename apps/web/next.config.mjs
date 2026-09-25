/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages are consumed from source-built `dist`, but transpiling keeps
  // Next happy if a package ever ships untranspiled TS/ESM.
  transpilePackages: ["@wedding-yantra/types"],
};

export default nextConfig;
