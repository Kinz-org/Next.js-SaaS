import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import JSZip from "jszip";

// Prisma reads: one mock per model, so each test can assert the userId /
// organizationId scoping of every query that feeds the export.
const findUniqueUser: Mock = vi.fn();
const findManyMembership: Mock = vi.fn();
const findManyConversation: Mock = vi.fn();
const findManyMessage: Mock = vi.fn();
const findManyTokenUsage: Mock = vi.fn();
const findManyAuditLog: Mock = vi.fn();
const findManyApiKey: Mock = vi.fn();
const findManyDataRequest: Mock = vi.fn();
const createDataRequest: Mock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUniqueUser(...(a as [])) },
    membership: { findMany: (...a: unknown[]) => findManyMembership(...(a as [])) },
    conversation: { findMany: (...a: unknown[]) => findManyConversation(...(a as [])) },
    message: { findMany: (...a: unknown[]) => findManyMessage(...(a as [])) },
    tokenUsage: { findMany: (...a: unknown[]) => findManyTokenUsage(...(a as [])) },
    auditLog: { findMany: (...a: unknown[]) => findManyAuditLog(...(a as [])) },
    apiKey: { findMany: (...a: unknown[]) => findManyApiKey(...(a as [])) },
    dataRequest: {
      findMany: (...a: unknown[]) => findManyDataRequest(...(a as [])),
      create: (...a: unknown[]) => createDataRequest(...(a as [])),
    },
  },
}));

const auditMock: Mock = vi.fn();
vi.mock("@/lib/audit/logger", () => ({
  audit: (...a: unknown[]) => auditMock(...(a as [])),
}));

// Supabase Storage: `from("uploads")` returns the upload/createSignedUrl pair.
const uploadMock: Mock = vi.fn();
const createSignedUrlMock: Mock = vi.fn();
const fromMock: Mock = vi.fn(() => ({
  upload: (...a: unknown[]) => uploadMock(...(a as [])),
  createSignedUrl: (...a: unknown[]) => createSignedUrlMock(...(a as [])),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ storage: { from: (...a: unknown[]) => fromMock(...(a as [])) } }),
}));

const { exportUserData } = await import("@/lib/gdpr/export");

const SEVEN_DAYS_S = 60 * 60 * 24 * 7;
const SIGNED_URL = "https://storage.example/signed/export.zip?token=abc";

async function uploadedZip(): Promise<JSZip> {
  const buffer = uploadMock.mock.calls[0]![1] as Buffer;
  return JSZip.loadAsync(buffer);
}

async function readJson(zip: JSZip, name: string): Promise<unknown> {
  const file = zip.file(name);
  expect(file, `${name} missing from export`).not.toBeNull();
  return JSON.parse(await file!.async("string"));
}

describe("gdpr/export - exportUserData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueUser.mockResolvedValue({ id: "user-1", email: "a@example.com" });
    findManyMembership.mockResolvedValue([{ userId: "user-1", organizationId: "org-1" }]);
    findManyConversation.mockResolvedValue([{ id: "conv-1" }]);
    findManyMessage.mockResolvedValue([{ id: "msg-1", content: "hello" }]);
    findManyTokenUsage.mockResolvedValue([{ id: "tu-1", totalTokens: 42 }]);
    findManyAuditLog.mockResolvedValue([{ id: "al-1", action: "LOGIN" }]);
    findManyApiKey.mockResolvedValue([
      { id: "key-1", name: "CI", prefix: "sk_live_ab", hashedKey: "sha256$secret-hash" },
      { id: "key-2", name: "Local", prefix: "sk_live_cd", hashedKey: "sha256$other-hash" },
    ]);
    findManyDataRequest.mockResolvedValue([]);
    createDataRequest.mockResolvedValue({});
    auditMock.mockResolvedValue(undefined);
    uploadMock.mockResolvedValue({ data: { path: "p" }, error: null });
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: SIGNED_URL }, error: null });
  });

  it("scopes every read to the user, and org-scoped tables to the org", async () => {
    await exportUserData("user-1", "org-1");

    expect(findUniqueUser).toHaveBeenCalledWith({ where: { id: "user-1" } });
    expect(findManyMembership).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(findManyApiKey).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    for (const m of [findManyConversation, findManyTokenUsage, findManyAuditLog, findManyDataRequest]) {
      expect(m).toHaveBeenCalledWith({ where: { userId: "user-1", organizationId: "org-1" } });
    }
    expect(findManyMessage.mock.calls[0]![0].where).toEqual({
      conversation: { userId: "user-1", organizationId: "org-1" },
    });
  });

  it("uploads a ZIP with a manifest and one JSON file per category", async () => {
    await exportUserData("user-1", "org-1");

    expect(fromMock).toHaveBeenCalledWith("uploads");
    const [path, , options] = uploadMock.mock.calls[0]!;
    expect(path).toMatch(/^gdpr-exports\/org-1\/user-1-\d+\.zip$/);
    expect(options).toEqual({ contentType: "application/zip", upsert: false });

    const zip = await uploadedZip();
    const manifest = (await readJson(zip, "manifest.json")) as {
      userId: string;
      organizationId: string;
      files: string[];
    };
    expect(manifest.userId).toBe("user-1");
    expect(manifest.organizationId).toBe("org-1");
    // Every file the manifest promises is actually in the archive.
    for (const name of manifest.files) {
      expect(zip.file(name), `${name} listed in manifest but missing`).not.toBeNull();
    }
    expect(await readJson(zip, "user.json")).toEqual({ id: "user-1", email: "a@example.com" });
    expect(await readJson(zip, "messages.json")).toEqual([{ id: "msg-1", content: "hello" }]);
    expect(await readJson(zip, "token-usage.json")).toEqual([{ id: "tu-1", totalTokens: 42 }]);
  });

  it("redacts every API key hash but keeps the other key fields", async () => {
    await exportUserData("user-1", "org-1");

    const zip = await uploadedZip();
    const keys = (await readJson(zip, "api-keys.json")) as Array<Record<string, string>>;
    expect(keys).toHaveLength(2);
    for (const k of keys) expect(k.hashedKey).toBe("[REDACTED]");
    expect(keys.map((k) => k.prefix)).toEqual(["sk_live_ab", "sk_live_cd"]);

    // The raw hash must not appear anywhere in the archive.
    for (const name of Object.keys(zip.files)) {
      const text = await zip.file(name)!.async("string");
      expect(text).not.toContain("secret-hash");
      expect(text).not.toContain("other-hash");
    }
  });

  it("returns a 7-day signed URL and records it in a COMPLETED DataRequest and the audit log", async () => {
    const before = Date.now();
    const result = await exportUserData("user-1", "org-1");
    const after = Date.now();

    const [path] = uploadMock.mock.calls[0]!;
    expect(createSignedUrlMock).toHaveBeenCalledWith(path, SEVEN_DAYS_S);
    expect(result.downloadUrl).toBe(SIGNED_URL);
    const expires = result.expiresAt.getTime();
    expect(expires).toBeGreaterThanOrEqual(before + SEVEN_DAYS_S * 1000);
    expect(expires).toBeLessThanOrEqual(after + SEVEN_DAYS_S * 1000);

    expect(createDataRequest).toHaveBeenCalledTimes(1);
    expect(createDataRequest.mock.calls[0]![0].data).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      type: "EXPORT",
      status: "COMPLETED",
      downloadUrl: SIGNED_URL,
      downloadExpiresAt: result.expiresAt,
    });

    expect(auditMock).toHaveBeenCalledTimes(1);
    const entry = auditMock.mock.calls[0]![0];
    expect(entry).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      action: "EXPORT",
      resourceType: "user_data",
      resourceId: "user-1",
    });
    const buffer = uploadMock.mock.calls[0]![1] as Buffer;
    expect(entry.metadata).toEqual({ format: "zip", sizeBytes: buffer.length });
  });

  it("throws the storage error when the upload fails, and records nothing", async () => {
    const uploadError = new Error("bucket not found");
    uploadMock.mockResolvedValue({ data: null, error: uploadError });

    await expect(exportUserData("user-1", "org-1")).rejects.toBe(uploadError);
    expect(createSignedUrlMock).not.toHaveBeenCalled();
    expect(createDataRequest).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("throws the storage error when signing the URL fails, and records nothing", async () => {
    const urlError = new Error("signing failed");
    createSignedUrlMock.mockResolvedValue({ data: null, error: urlError });

    await expect(exportUserData("user-1", "org-1")).rejects.toBe(urlError);
    expect(createDataRequest).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("throws a real Error (not null) when signing returns neither data nor an error", async () => {
    createSignedUrlMock.mockResolvedValue({ data: null, error: null });

    const err = await exportUserData("user-1", "org-1").then(
      () => undefined,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/signed URL/i);
    expect(createDataRequest).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});
