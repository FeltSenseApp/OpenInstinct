export const workspaceSelectionCookie = "openinstinct_workspace";

export function workspaceIdFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== workspaceSelectionCookie) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }

  return undefined;
}
