import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  emptyUserProfile,
  hasUserProfileValues,
  parseUserProfile,
  userProfilePatchSchema,
} from "@shared/user-profile/schema";

describe("user profile", () => {
  it("validates and normalizes form-ready personal information", () => {
    expect(
      parseUserProfile({
        ...emptyUserProfile,
        countryCode: "us",
        dateOfBirth: "1990-01-02",
        email: "person@example.com",
        timezone: "America/New_York",
      })
    ).toEqual({
      ...emptyUserProfile,
      countryCode: "US",
      dateOfBirth: "1990-01-02",
      email: "person@example.com",
      timezone: "America/New_York",
    });
  });

  it("supports explicit field removal without accepting empty updates", () => {
    expect(userProfilePatchSchema.parse({ phone: null })).toEqual({
      phone: null,
    });
    expect(userProfilePatchSchema.safeParse({}).success).toBe(false);
    expect(hasUserProfileValues(emptyUserProfile)).toBe(false);
    expect(
      hasUserProfileValues({ ...emptyUserProfile, city: "Brooklyn" })
    ).toBe(true);
  });

  it("keeps model-facing email validation free of unsupported lookaround", () => {
    expect(
      userProfilePatchSchema.safeParse({ email: "not-an-email" }).success
    ).toBe(false);
    expect(
      JSON.stringify(z.toJSONSchema(userProfilePatchSchema))
    ).not.toContain("(?=");
  });

  it("requires an IANA timezone when one is saved", () => {
    expect(
      userProfilePatchSchema.safeParse({ timezone: "America/New_York" }).success
    ).toBe(true);
    expect(
      userProfilePatchSchema.safeParse({ timezone: "Eastern" }).success
    ).toBe(false);
  });
});
