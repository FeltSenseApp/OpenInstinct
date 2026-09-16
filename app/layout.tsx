import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { QueryProvider } from "@app/_providers/query-provider";
import { TooltipProvider } from "@web/components/ui/tooltip";
import { resolveWorkspaceScope } from "@db/services/workspaces";
import { workspaceSelectionCookie } from "@shared/identity/workspace-selection";
import { applicationOrigin } from "@shared/environment/origin";
import { getAuthSession } from "@db/services/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(applicationOrigin()),
  title: "OpenInstinct",
  description:
    "A self-hosted personal agent with private credentials and Kernel-powered browser execution.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getAuthSession(await headers());
  const requestedWorkspaceId = (await cookies()).get(
    workspaceSelectionCookie
  )?.value;
  const workspaceId = session
    ? (
        await resolveWorkspaceScope(
          `better-auth:${session.user.id}`,
          requestedWorkspaceId
        )
      ).workspaceId
    : undefined;

  return (
    <html lang="en">
      <body data-workspace-id={workspaceId}>
        <QueryProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
