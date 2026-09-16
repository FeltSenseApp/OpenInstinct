import {
  BotIcon,
  CloudIcon,
  ImageIcon,
  MailIcon,
  MessageSquareIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  getTokenResponse,
  NoValidTokenError,
  UserAuthorizationRequiredError,
} from "@vercel/connect";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@web/components/ui/alert";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { getGatewayModel } from "@db/services/settings";
import {
  listCompanyMembers,
  listWorkspacesForUser,
} from "@db/services/workspaces";
import { env } from "@shared/environment";
import { googleWorkspaceTokenParams } from "@shared/google-workspace/connection";
import { requireRequestScope } from "@web/auth/request-scope";
import { GoogleWorkspaceAction } from "./_components/google-workspace-action";
import { ModelSelector } from "./_components/model-selector";
import { addMember, createCompany, selectWorkspace } from "./actions";

export default async function Page({ searchParams }: PageProps<"/">) {
  const { google, workspaceError } = await searchParams;
  const scope = await requireRequestScope();
  const [googleWorkspace, gatewayModel, workspaces, companyMembership] =
    await Promise.all([
      readGoogleWorkspaceConnection(scope.userId),
      getGatewayModel(scope),
      listWorkspacesForUser(scope.userId),
      listCompanyMembers(scope),
    ]);
  const browserReady = true;
  const imageStorageReady = Boolean(
    env.BLOB_STORE_ID ?? env.BLOB_READ_WRITE_TOKEN
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="sr-only">Workspace</h1>

      {google === "unavailable" ? (
        <Alert>
          <MailIcon />
          <AlertTitle>Google Workspace unavailable</AlertTitle>
          <AlertDescription>
            This deployment does not have a working Google OAuth connector yet.
          </AlertDescription>
        </Alert>
      ) : null}

      {workspaceError ? (
        <Alert variant="destructive">
          <AlertTitle>Workspace update failed</AlertTitle>
          <AlertDescription>
            {workspaceErrorMessage(workspaceError)}
          </AlertDescription>
        </Alert>
      ) : null}

      <CompanyWorkspacesSection
        activeWorkspaceId={scope.workspaceId}
        companyMembership={companyMembership}
        workspaces={workspaces}
      />

      <ChannelsSection
        browserReady={browserReady}
        linqConfigured={env.LINQ_CONNECTOR !== undefined}
        linqPhoneNumber={env.LINQ_PHONE_NUMBER}
      />
      <GoogleWorkspaceSection connection={googleWorkspace} />

      <WorkspaceSection headingId="connectors-heading" title="Infrastructure">
        <div className="divide-y divide-border/50 border-y border-border/50">
          <ConnectorRow
            action={<Badge variant="success">Connected</Badge>}
            description="Run isolated browsers in your Kernel account."
            icon={<CloudIcon />}
            label="Kernel browser"
          />
          <ConnectorRow
            action={
              <Badge variant={imageStorageReady ? "success" : "secondary"}>
                {imageStorageReady ? "Connected" : "Setup required"}
              </Badge>
            }
            description={
              imageStorageReady
                ? "Store browser images in a private Vercel Blob store."
                : "Connect a private Vercel Blob store to share browser images."
            }
            icon={<ImageIcon />}
            label="Vercel Blob"
          />
          <ConnectorRow
            action={<ModelSelector modelId={gatewayModel} />}
            description={gatewayModel}
            icon={<BotIcon />}
            label="AI Gateway model"
          />
        </div>
      </WorkspaceSection>
    </div>
  );
}

function CompanyWorkspacesSection({
  activeWorkspaceId,
  companyMembership,
  workspaces,
}: {
  readonly activeWorkspaceId: string;
  readonly companyMembership:
    | Awaited<ReturnType<typeof listCompanyMembers>>
    | undefined;
  readonly workspaces: Awaited<ReturnType<typeof listWorkspacesForUser>>;
}) {
  const active = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId
  );

  return (
    <WorkspaceSection headingId="workspaces-heading" title="Workspaces">
      <div className="space-y-4 border-y border-border/50 py-4">
        <form action={selectWorkspace} className="flex flex-wrap gap-2">
          <select
            aria-label="Active workspace"
            className="type-input h-8 min-w-52 rounded-lg border border-input bg-background px-2.5"
            defaultValue={activeWorkspaceId}
            name="workspaceId"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.kind === "personal"
                  ? "Personal"
                  : (workspace.name ?? "Company")}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            Open workspace
          </Button>
          {active ? (
            <Badge variant="secondary">
              {active.kind === "personal" ? "Personal" : active.role}
            </Badge>
          ) : null}
        </form>

        <form action={createCompany} className="flex flex-wrap gap-2">
          <Input
            aria-label="Company name"
            className="max-w-xs"
            maxLength={100}
            name="name"
            placeholder="Company name"
            required
          />
          <Button type="submit">Create company workspace</Button>
        </form>

        {companyMembership ? (
          <div className="space-y-3 rounded-lg border border-border/50 p-3">
            <div>
              <p className="type-label">Members</p>
              <p className="type-caption text-muted-foreground">
                {companyMembership.members.length} member
                {companyMembership.members.length === 1 ? "" : "s"} in this
                company workspace.
              </p>
            </div>
            <ul className="space-y-1">
              {companyMembership.members.map((member) => (
                <li
                  className="type-supporting-body flex items-center justify-between gap-3"
                  key={member.email}
                >
                  <span>{member.name || member.email}</span>
                  <Badge variant="secondary">{member.role}</Badge>
                </li>
              ))}
            </ul>
            {companyMembership.role === "owner" ? (
              <form action={addMember} className="flex flex-wrap gap-2">
                <input
                  name="workspaceId"
                  type="hidden"
                  value={activeWorkspaceId}
                />
                <Input
                  aria-label="Member email"
                  className="max-w-xs"
                  name="email"
                  placeholder="Existing user email"
                  required
                  type="email"
                />
                <Button type="submit" variant="outline">
                  Add member
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </WorkspaceSection>
  );
}

function workspaceErrorMessage(error: string | string[] | undefined) {
  const code = Array.isArray(error) ? error[0] : error;
  if (code === "unknown-user") {
    return "That person must sign in to OpenInstinct before you can add them.";
  }
  if (code === "not-a-member") {
    return "You do not have access to that workspace.";
  }
  if (code === "invalid-company") {
    return "Enter a company name between 1 and 100 characters.";
  }
  return "The member could not be added. Only a company owner can add members.";
}

function GoogleWorkspaceSection({
  connection,
}: {
  readonly connection?: GoogleWorkspaceConnection;
}) {
  const state = connection?.state;
  const description =
    state === "connected"
      ? (connection?.accountLabel ?? "Gmail, Calendar, and Contacts connected.")
      : state === "unavailable"
        ? "Attach a Vercel Connect Google OAuth connector to enable this."
        : "Gmail, Calendar, and Contacts through your Google account.";

  return (
    <WorkspaceSection headingId="connections-heading" title="Connections">
      <div className="divide-y divide-border/50 border-y border-border/50">
        <ConnectorRow
          action={<GoogleWorkspaceAction state={state} />}
          description={description}
          icon={<MailIcon />}
          label="Google Workspace"
        />
      </div>
    </WorkspaceSection>
  );
}

interface GoogleWorkspaceConnection {
  readonly accountLabel: string | null;
  readonly state: "connected" | "disconnected" | "unavailable";
}

async function readGoogleWorkspaceConnection(
  userId: string
): Promise<GoogleWorkspaceConnection> {
  try {
    const response = await getTokenResponse(
      env.GOOGLE_CONNECTOR_UID,
      googleWorkspaceTokenParams(userId),
      { forceRefresh: true }
    );
    const claims = z
      .object({ email: z.string().optional() })
      .safeParse(response.claims);
    return {
      accountLabel:
        response.name ?? (claims.success ? (claims.data.email ?? null) : null),
      state: "connected",
    };
  } catch (error) {
    if (
      error instanceof UserAuthorizationRequiredError ||
      error instanceof NoValidTokenError
    ) {
      return { accountLabel: null, state: "disconnected" };
    }
    return { accountLabel: null, state: "unavailable" };
  }
}

export function ChannelsSection({
  browserReady,
  linqConfigured,
  linqPhoneNumber,
}: {
  readonly browserReady: boolean;
  readonly linqConfigured: boolean;
  readonly linqPhoneNumber?: string;
}) {
  return (
    <WorkspaceSection headingId="channels-heading" title="Channels">
      <div className="grid gap-2 sm:grid-cols-2">
        {browserReady ? (
          <Button
            nativeButton={false}
            render={<Link href="/chat" />}
            variant="surface"
          >
            <MessageSquareIcon />
            WebChat
          </Button>
        ) : (
          <Button disabled variant="surface">
            <MessageSquareIcon />
            WebChat
          </Button>
        )}
        {linqConfigured && linqPhoneNumber ? (
          <Button
            nativeButton={false}
            render={
              <a aria-label="Open iMessage" href={`sms:${linqPhoneNumber}`} />
            }
            variant="surface"
          >
            <MailIcon />
            iMessage
          </Button>
        ) : (
          <Button disabled variant="surface">
            <MailIcon />
            iMessage
          </Button>
        )}
      </div>
      <p className="type-caption text-muted-foreground">
        {channelAvailabilityMessage({
          browserReady,
          linqConfigured,
          linqPhoneNumber,
        })}
      </p>
    </WorkspaceSection>
  );
}

function channelAvailabilityMessage({
  browserReady,
  linqConfigured,
  linqPhoneNumber,
}: {
  readonly browserReady: boolean;
  readonly linqConfigured: boolean;
  readonly linqPhoneNumber?: string;
}) {
  return [
    browserReady
      ? "WebChat is ready."
      : "KERNEL_API_KEY is required to enable WebChat.",
    linqConfigured && linqPhoneNumber
      ? `iMessage opens ${linqPhoneNumber}.`
      : linqConfigured
        ? "Linq is connected. Use its assigned line to start an iMessage."
        : "Set up Linq to enable iMessage.",
  ].join(" ");
}

function WorkspaceSection({
  children,
  headingId,
  title,
}: {
  readonly children: ReactNode;
  readonly headingId: string;
  readonly title: string;
}) {
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 className="type-section-title" id={headingId}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ConnectorRow({
  action,
  description,
  icon,
  label,
}: {
  readonly action: ReactNode;
  readonly description: string;
  readonly icon: ReactNode;
  readonly label: string;
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="type-label">{label}</p>
        <p className="truncate type-caption text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
