import {
  BrainCircuitIcon,
  Building2Icon,
  Clock3Icon,
  PlayIcon,
} from "lucide-react";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Textarea } from "@web/components/ui/textarea";
import { getHeadlongDashboard } from "@db/services/headlong";
import {
  listCompanyMembers,
  listWorkspacesForUser,
} from "@db/services/workspaces";
import { requireRequestScope } from "@web/auth/request-scope";
import { HeadlongLiveRefresh } from "./_components/headlong-live-refresh";
import {
  addMember,
  createCompany,
  sendHeadlongMessage,
  setHeadlongStatus,
  selectWorkspace,
  startHeadlong,
} from "./actions";

export default async function Page({ searchParams }: PageProps<"/">) {
  const scope = await requireRequestScope();
  const workspaces = await listWorkspacesForUser(scope.userId);
  const active = workspaces.find(
    (workspace) => workspace.id === scope.workspaceId
  );
  const error = (await searchParams).workspaceError;

  if (active?.kind !== "company") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="space-y-3">
          <Badge variant="secondary">Headlong on Eve</Badge>
          <h1 className="type-display-title">
            Give every company a mind that keeps going.
          </h1>
          <p className="type-body text-muted-foreground">
            Create or open a company. Its responder, monolith, trajectory,
            goals, and memories persist independently of any chat.
          </p>
        </header>
        {error ? (
          <p className="type-supporting-body text-destructive">
            The workspace change could not be completed.
          </p>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Companies</CardTitle>
            <CardDescription>
              Each company owns exactly one continuous Headlong mind.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={selectWorkspace} className="flex flex-wrap gap-2">
              <select
                className="type-input h-9 min-w-60 rounded-lg border border-input bg-background px-3"
                defaultValue={scope.workspaceId}
                name="workspaceId"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.kind === "personal"
                      ? "Choose a company…"
                      : workspace.name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline">
                Open
              </Button>
            </form>
            <form action={createCompany} className="flex flex-wrap gap-2">
              <Input
                className="max-w-sm"
                maxLength={100}
                name="name"
                placeholder="New company name"
                required
              />
              <Button type="submit">
                <Building2Icon /> Create company
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  const [dashboard, membership] = await Promise.all([
    getHeadlongDashboard(scope),
    listCompanyMembers(scope),
  ]);
  const outward = dashboard.events.filter(
    (event) => event.direction === "outbound"
  );
  const goals = dashboard.memories.filter(
    (memory) => memory.kind === "goal" || memory.kind === "todo"
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <HeadlongLiveRefresh />
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BrainCircuitIcon className="size-5" />
            <Badge
              variant={
                dashboard.mind.status === "active" ? "success" : "secondary"
              }
            >
              {dashboard.mind.status}
            </Badge>
          </div>
          <h1 className="type-display-title">{dashboard.mind.companyName}</h1>
          <p className="type-supporting-body max-w-2xl text-muted-foreground">
            {dashboard.mind.identity}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={setHeadlongStatus}>
            <input
              name="status"
              type="hidden"
              value={dashboard.mind.status === "active" ? "paused" : "active"}
            />
            <Button type="submit" variant="outline">
              {dashboard.mind.status === "active"
                ? "Pause mind"
                : "Resume mind"}
            </Button>
          </form>
          <form action={startHeadlong}>
            <Button type="submit">
              <PlayIcon /> Wake now
            </Button>
          </form>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Talk to the company</CardTitle>
              <CardDescription>
                The fast responder answers; the monolith inherits every promise
                and continues the work.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={sendHeadlongMessage} className="space-y-3">
                <Textarea
                  maxLength={20_000}
                  name="message"
                  placeholder={`Message ${dashboard.mind.companyName}…`}
                  required
                  rows={4}
                />
                <Button type="submit">Send to company</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live trajectory</CardTitle>
              <CardDescription>
                One append-only company history across every bounded Eve thinker
                run.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="divide-y divide-border/50 border-y border-border/50">
                {dashboard.events.length === 0 ? (
                  <li className="type-supporting-body py-8 text-center text-muted-foreground">
                    Wake the mind or send its first message.
                  </li>
                ) : (
                  dashboard.events.map((event) => (
                    <li
                      className="grid gap-2 py-4 sm:grid-cols-[8rem_minmax(0,1fr)]"
                      key={event.id}
                    >
                      <div className="space-y-1">
                        <Badge
                          variant={
                            event.direction === "outbound"
                              ? "success"
                              : "secondary"
                          }
                        >
                          {event.type}
                        </Badge>
                        <p className="type-caption text-muted-foreground">
                          {event.thinker}
                        </p>
                        <time className="type-caption text-muted-foreground">
                          {event.createdAt.toLocaleString()}
                        </time>
                      </div>
                      <p className="type-supporting-body whitespace-pre-wrap">
                        {event.content}
                      </p>
                    </li>
                  ))
                )}
              </ol>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Runtime</CardTitle>
            </CardHeader>
            <CardContent className="type-supporting-body space-y-3">
              <RuntimeRow
                label="Thinker runs"
                value={String(dashboard.runs.length)}
              />
              <RuntimeRow
                label="Backoff"
                value={`${String(dashboard.mind.backoffSeconds)}s`}
              />
              <RuntimeRow
                label="Next wake"
                value={
                  dashboard.mind.nextWakeAt?.toLocaleTimeString() ??
                  "Not scheduled"
                }
              />
              <RuntimeRow label="Outbound" value={String(outward.length)} />
              <div className="flex items-center gap-2 pt-2 text-muted-foreground">
                <Clock3Icon className="size-4" /> durable Eve workflow timers
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Goals and todos</CardTitle>
              <CardDescription>
                Durable working commitments chosen by the monolith.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {goals.length ? (
                  goals.map((memory) => (
                    <li
                      className="rounded-lg border border-border/60 p-3"
                      key={memory.id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="type-label">{memory.title}</span>
                        <Badge variant="secondary">{memory.kind}</Badge>
                      </div>
                      <p className="mt-1 type-caption text-muted-foreground">
                        {memory.content}
                      </p>
                    </li>
                  ))
                ) : (
                  <li className="type-supporting-body text-muted-foreground">
                    No goals yet.
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Company members</CardTitle>
              <CardDescription>
                Everyone here shares the same agent and trajectory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2">
                {membership?.members.map((member) => (
                  <li
                    className="type-supporting-body flex items-center justify-between gap-2"
                    key={member.email}
                  >
                    <span>{member.name || member.email}</span>
                    <Badge variant="secondary">{member.role}</Badge>
                  </li>
                ))}
              </ul>
              {membership?.role === "owner" ? (
                <form action={addMember} className="space-y-2">
                  <input
                    name="workspaceId"
                    type="hidden"
                    value={scope.workspaceId}
                  />
                  <Input
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
            </CardContent>
          </Card>

          <form action={selectWorkspace}>
            <input
              name="workspaceId"
              type="hidden"
              value={
                workspaces.find((workspace) => workspace.kind === "personal")
                  ?.id
              }
            />
            <Button type="submit" variant="ghost">
              Switch company
            </Button>
          </form>
        </aside>
      </section>
    </main>
  );
}

function RuntimeRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="type-label">{value}</span>
    </div>
  );
}
