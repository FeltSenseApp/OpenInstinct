import { readFile } from "node:fs/promises";
import { getVercelOidcToken } from "@vercel/oidc";
import { z } from "zod";

const registrySchema = z.object({
  appRoot: z.string(),
  origin: z.url()
});

export async function internalRequest(
  path: string,
  init: Omit<RequestInit, "headers"> & {
    readonly headers?: HeadersInit;
  }
) {
  const headers = new Headers(init.headers);
  const token = process.env.VERCEL ? await getVercelOidcToken() : undefined;
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-vercel-trusted-oidc-idp-token", token);
  }
  return fetch(new URL(path, await internalOrigin()), {
    ...init,
    headers,
    redirect: "error"
  });
}

async function internalOrigin() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV === "development") {
    try {
      const registry = registrySchema.parse(
        JSON.parse(await readFile(".eve/next-dev-server.json", "utf8"))
      );
      if (registry.appRoot === process.cwd()) return registry.origin;
    } catch {
      // Next may be running without eve dev.
    }
  }
  return process.env.HEADLONG_ORIGIN ?? "http://localhost:3000";
}
