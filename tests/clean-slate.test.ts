import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, it } from "vitest";

async function exists(path: string) {
  return access(path, constants.F_OK).then(
    () => true,
    () => false
  );
}

describe("clean-slate boundary", () => {
  it("does not retain Open Instinct application layers", async () => {
    await expect(exists("db")).resolves.toBe(false);
    await expect(exists("web")).resolves.toBe(false);
    await expect(exists("app/(authenticated)")).resolves.toBe(false);
  });

  it("has no company or workspace ownership in the Headlong schema", async () => {
    const migration = await readFile("migrations/0001_headlong.sql", "utf8");
    expect(migration).not.toMatch(/company|workspace_id/i);
  });
});
