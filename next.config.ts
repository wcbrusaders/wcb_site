import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf (PDF thumbnail rendering) and @napi-rs/canvas (its native N-API
  // canvas backend) must NOT be bundled by Next's serverless function
  // bundler — @napi-rs/canvas ships prebuilt per-platform native binaries
  // that need to be resolved from node_modules at runtime, not inlined.
  // See .superpowers/sdd/2026-08-18-wcb-artifacts/task-1-report.md.
  serverExternalPackages: ["unpdf", "@napi-rs/canvas"],
};

export default nextConfig;
