import { describe, expect, it } from "vitest";
import {
  workspaceIdFromCookieHeader,
  workspaceSelectionCookie,
} from "./workspace-selection";

describe("workspace selection cookie", () => {
  it("reads the selected workspace among unrelated cookies", () => {
    expect(
      workspaceIdFromCookieHeader(
        `session=abc; ${workspaceSelectionCookie}=company%3Aacme; theme=dark`
      )
    ).toBe("company:acme");
  });

  it("ignores missing and malformed values", () => {
    expect(workspaceIdFromCookieHeader(null)).toBeUndefined();
    expect(workspaceIdFromCookieHeader("session=abc")).toBeUndefined();
    expect(
      workspaceIdFromCookieHeader(`${workspaceSelectionCookie}=%E0%A4%A`)
    ).toBeUndefined();
  });
});
