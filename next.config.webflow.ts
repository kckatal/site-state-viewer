// Merge logic for the generated next.config.ts. Copied verbatim into the
// user's project; types are local to avoid Next.js cross-version drift.
import type { NextConfig } from "next";

type NextConfigContext = { defaultConfig: NextConfig };
type UserNextConfigFn = (
  phase: string,
  ctx: NextConfigContext
) => NextConfig | Promise<NextConfig>;

export type UserNextConfig = NextConfig | UserNextConfigFn;
export type WebflowOverridesOptions = {
  basePath: string;
  assetPrefix: string;
};

/**
 * Wrap the user's Next.js config with Webflow Cloud's required overrides.
 * `userExport` is always provided — `{}` when the user ships no next.config.
 */
export function withWebflowOverrides(
  userExport: UserNextConfig,
  opts: WebflowOverridesOptions
): UserNextConfigFn {
  return async function nextConfig(
    phase: string,
    ctx: NextConfigContext
  ): Promise<NextConfig> {
    const resolved = await resolveUserConfig(userExport, phase, ctx);
    return {
      ...resolved,
      basePath: opts.basePath,
      assetPrefix: opts.assetPrefix,
      images: {
        ...resolved.images,
        // TODO: support non-custom loaders (imgix, cloudinary, akamai) if they work
        loader: "custom",
        loaderFile: resolved.images?.loaderFile || "./webflow-loader.ts",
      },
    };
  };
}

async function resolveUserConfig(
  userExport: UserNextConfig,
  phase: string,
  ctx: NextConfigContext
): Promise<NextConfig> {
  if (typeof userExport === "function") {
    return (await userExport(phase, ctx)) ?? {};
  }
  // `export default null` is rare but not impossible; guard so the spread
  // below in withWebflowOverrides can't NPE.
  return userExport ?? {};
}
