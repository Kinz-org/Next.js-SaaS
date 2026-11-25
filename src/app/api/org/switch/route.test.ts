import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";

// docs/IMPROVEMENTS.md item 15: GET /api/org/switch passed `redirect` straight
// to `new URL(redirect, req.url)`, so `?redirect=//evil.example` sent a signed-in
// user off-site. These tests pin the Location header to the app's own origin.
const requireUserMock: Mock = vi.fn();
const getOrgMembershipMock: Mock = vi.fn();
const setActiveOrgIdMock: Mock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireUser: (...a: unknown[]) => requireUserMock(...a),
}));
vi.mock("@/lib/auth/org-context", () => ({
  getOrgMembership: (...a: unknown[]) => getOrgMembershipMock(...a),
  setActiveOrgId: (...a: unknown[]) => setActiveOrgIdMock(...a),
}));

const { GET } = await import("@/app/api/org/switch/route");

const ORIGIN = "https://app.example.com";
const get = (redirect?: string) => {
  const url = new URL("/api/org/switch", ORIGIN);
  url.searchParams.set("orgId", "org-1");
  if (redirect !== undefined) url.searchParams.set("redirect", redirect);
  return GET(new NextRequest(url));
};

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  getOrgMembershipMock.mockReset().mockResolvedValue({ id: "m-1", status: "ACTIVE" });
  setActiveOrgIdMock.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/org/switch redirect target", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
  ])("keeps %j on the app's own origin", async (redirect) => {
    const res = await get(redirect);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/dashboard");
  });

  it("keeps a same-origin path with its query", async () => {
    const res = await get("/dashboard/agents?tab=new");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard/agents?tab=new`);
  });

  it("defaults to /dashboard when no redirect is given", async () => {
    const res = await get();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("does not switch or redirect for a non-member", async () => {
    getOrgMembershipMock.mockResolvedValue(null);
    const res = await get("//evil.example");
    expect(res.status).toBe(403);
    expect(setActiveOrgIdMock).not.toHaveBeenCalled();
  });
});
