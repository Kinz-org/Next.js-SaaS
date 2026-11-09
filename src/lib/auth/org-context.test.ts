import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// getOrgMembership() is the membership lookup behind requireUserWithPermission()
// and /api/org/switch. Its ACTIVE filter is what makes a suspended or invited
// member fail authorization; dropping it would reopen the IDOR class closed in
// /api/org/switch (docs/IMPROVEMENTS.md item 1) with no other test to catch it.
const findUniqueMock: Mock = vi.fn();
const findManyMock: Mock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      findMany: (...a: unknown[]) => findManyMock(...a),
    },
  },
}));

const cookieGetMock: Mock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (...a: unknown[]) => cookieGetMock(...a) }),
}));

const { getOrgMembership, getUserOrganizations, requireActiveOrgId } = await import(
  "@/lib/auth/org-context"
);

const membership = (status: string) => ({
  id: "m-1",
  userId: "user-1",
  organizationId: "org-1",
  role: "MEMBER",
  status,
});

beforeEach(() => {
  findUniqueMock.mockReset();
  findManyMock.mockReset();
  cookieGetMock.mockReset();
});

describe("getOrgMembership", () => {
  it("looks the membership up by the (userId, organizationId) compound key", async () => {
    findUniqueMock.mockResolvedValue(membership("ACTIVE"));
    await getOrgMembership("user-1", "org-1");
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: "user-1", organizationId: "org-1" } },
    });
  });

  it("returns an ACTIVE membership", async () => {
    findUniqueMock.mockResolvedValue(membership("ACTIVE"));
    await expect(getOrgMembership("user-1", "org-1")).resolves.toMatchObject({
      organizationId: "org-1",
      role: "MEMBER",
      status: "ACTIVE",
    });
  });

  it("returns null when the user is not a member", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(getOrgMembership("user-1", "org-1")).resolves.toBeNull();
  });

  it.each(["SUSPENDED", "INVITED"])("returns null for a %s membership", async (status) => {
    findUniqueMock.mockResolvedValue(membership(status));
    await expect(getOrgMembership("user-1", "org-1")).resolves.toBeNull();
  });
});

describe("getUserOrganizations", () => {
  it("only asks for ACTIVE memberships of that user", async () => {
    findManyMock.mockResolvedValue([]);
    await getUserOrganizations("user-1");
    expect(findManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "ACTIVE" },
      include: { organization: true },
    });
  });
});

describe("requireActiveOrgId", () => {
  it("returns the org id from the active-org-id cookie", async () => {
    cookieGetMock.mockReturnValue({ value: "org-1" });
    await expect(requireActiveOrgId()).resolves.toBe("org-1");
    expect(cookieGetMock).toHaveBeenCalledWith("active-org-id");
  });

  it("throws NO_ACTIVE_ORG when no org is selected", async () => {
    cookieGetMock.mockReturnValue(undefined);
    await expect(requireActiveOrgId()).rejects.toThrow("NO_ACTIVE_ORG");
  });
});
