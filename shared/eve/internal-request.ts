import { readFile } from "node:fs/promises";
import { getVercelOidcToken } from "@vercel/oidc";
import { z } from "zod";
import { env } from "@shared/environment";
import { applicationOrigin } from "@shared/environment/origin";

const eveDevServerSchema = z.object({
  appRoot: z.string(),
  origin: z.url(),
});

export async function requestInternalRoute(
  path: string,
  init: Omit<RequestInit, "headers"> & { readonly headers?: HeadersInit }
) {
  const token = env.VERCEL_ENV ? await getVercelOidcToken() : undefined;
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-vercel-trusted-oidc-idp-token", token);
  }
  return fetch(new URL(path, await internalOrigin()), {
    ...init,
    headers,
    redirect: "error",
  });
}

async function internalOrigin() {
  if (env.VERCEL_ENV && env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  if (env.NODE_ENV === "development") {
    try {
      const registry = eveDevServerSchema.parse(
        JSON.parse(await readFile(".eve/next-dev-server.json", "utf8"))
      );
      if (registry.appRoot === process.cwd()) {
        return new URL(registry.origin).origin;
      }
    } catch {
      // Standalone development does not create the Next.js server registry.
    }
  }
  return applicationOrigin();
}
