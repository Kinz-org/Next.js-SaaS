import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "@/lib/http/safe-redirect";

const BASE = "https://app.example.com/api/org/switch?orgId=1";

describe("safeRedirectPath", () => {
  it.each([null, undefined, "", "dashboard", "https://evil.example", "//evil.example",
    "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "javascript:alert(1)"])(
    "falls back for %j", (target) => {
      expect(safeRedirectPath(target, BASE)).toBe("/dashboard");
    });

  it("keeps same-origin paths, query and hash", () => {
    expect(safeRedirectPath("/dashboard/agents?x=1#top", BASE)).toBe("/dashboard/agents?x=1#top");
  });

  it("honours a custom fallback", () => {
    expect(safeRedirectPath("//evil.example", BASE, "/onboarding")).toBe("/onboarding");
  });
});
