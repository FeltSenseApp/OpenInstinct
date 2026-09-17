import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Database from "@db";
import * as schema from "../schema";

const databases: PGlite[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("company workspaces", () => {
  it("creates a company, assigns an existing user, and enforces membership", async () => {
    const client = new PGlite();
    databases.push(client);
    /* oxlint-disable eslint/no-await-in-loop -- Migrations must be applied in order. */
    for (const name of migrationNames) await applyMigration(client, name);
    /* oxlint-enable eslint/no-await-in-loop */

    const pgliteDatabase = drizzle(client, { schema });
    // SAFETY: PGlite implements the Drizzle surface used by this service.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The test swaps only the database driver.
    vi.spyOn(Database, "db", "get").mockReturnValue(pgliteDatabase as never);
    await pgliteDatabase.insert(schema.user).values([
      { email: "owner@example.com", id: "owner", name: "Owner" },
      { email: "member@example.com", id: "member", name: "Member" },
    ]);

    const service = await import("@db/services/workspaces");
    const ownerId = "better-auth:owner";
    const memberId = "better-auth:member";
    const company = await service.createCompanyWorkspace(ownerId, "Acme");

    expect(
      await service.resolveWorkspaceScope(ownerId, company.workspaceId)
    ).toEqual(company);
    expect(
      await service.resolveWorkspaceScope(memberId, company.workspaceId)
    ).not.toEqual({ userId: memberId, workspaceId: company.workspaceId });

    await service.addCompanyMember(company, "MEMBER@example.com");
    expect(
      await service.resolveWorkspaceScope(memberId, company.workspaceId)
    ).toEqual({ userId: memberId, workspaceId: company.workspaceId });
    expect(await service.listWorkspacesForUser(memberId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: company.workspaceId,
          kind: "company",
          name: "Acme",
          role: "member",
        }),
      ])
    );
  });
});

async function applyMigration(database: PGlite, name: string) {
  const migration = await readFile(
    new URL(`../migrations/${name}`, import.meta.url),
    "utf8"
  );
  /* oxlint-disable eslint/no-await-in-loop -- SQL migration statements must execute in file order. */
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await database.exec(statement);
  }
  /* oxlint-enable eslint/no-await-in-loop */
}

const migrationNames = [
  "0000_fluffy_the_spike.sql",
  "0001_better-auth.sql",
  "0002_heavy_celestials.sql",
  "0003_unusual_fabian_cortez.sql",
  "0004_kind_manta.sql",
  "0005_brave_kang.sql",
  "0006_illegal_tattoo.sql",
  "0007_known_fenris.sql",
  "0008_black_sandman.sql",
  "0009_cold_power_man.sql",
  "0010_rapid_cerise.sql",
  "0011_faulty_unicorn.sql",
  "0012_harsh_domino.sql",
  "0013_last_christian_walker.sql",
  "0014_legal_cyclops.sql",
  "0015_lame_captain_marvel.sql",
] as const;
