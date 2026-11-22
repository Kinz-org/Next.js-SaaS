import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit/logger";

/**
 * GDPR data export - assemble all of a user's data into a ZIP file
 * and upload it to Supabase Storage. Returns a signed URL valid for 7 days.
 *
 * Triggered by the user from /settings/compliance ("Download my data").
 */

export async function exportUserData(userId: string, organizationId: string): Promise<{
  downloadUrl: string;
  expiresAt: Date;
}> {
  // 1. Collect all user data from every table where user has rows
  const [user, memberships, conversations, messages, tokenUsage, auditLogs, apiKeys, dataRequests] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.membership.findMany({ where: { userId } }),
      prisma.conversation.findMany({ where: { userId, organizationId } }),
      prisma.message.findMany({
        where: { conversation: { userId, organizationId } },
        include: { conversation: true },
      }),
      prisma.tokenUsage.findMany({ where: { userId, organizationId } }),
      prisma.auditLog.findMany({ where: { userId, organizationId } }),
      prisma.apiKey.findMany({ where: { userId } }),
      prisma.dataRequest.findMany({ where: { userId, organizationId } }),
    ]);

  const redactedApiKeys = apiKeys.map((k) => ({ ...k, hashedKey: "[REDACTED]" }));

  // 2. Build a ZIP with one JSON file per data category, plus a manifest.
  //    Splitting by category (rather than one giant JSON blob) keeps each
  //    file readable on its own and matches the "includes conversations,
  //    messages, usage records, and audit logs" language shown on the
  //    compliance page.
  const zip = new JSZip();
  const exportedAt = new Date().toISOString();

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        exportedAt,
        userId,
        organizationId,
        files: [
          "user.json",
          "memberships.json",
          "conversations.json",
          "messages.json",
          "token-usage.json",
          "audit-logs.json",
          "api-keys.json",
          "data-requests.json",
        ],
      },
      null,
      2
    )
  );
  zip.file("user.json", JSON.stringify(user, null, 2));
  zip.file("memberships.json", JSON.stringify(memberships, null, 2));
  zip.file("conversations.json", JSON.stringify(conversations, null, 2));
  zip.file("messages.json", JSON.stringify(messages, null, 2));
  zip.file("token-usage.json", JSON.stringify(tokenUsage, null, 2));
  zip.file("audit-logs.json", JSON.stringify(auditLogs, null, 2));
  zip.file("api-keys.json", JSON.stringify(redactedApiKeys, null, 2));
  zip.file("data-requests.json", JSON.stringify(dataRequests, null, 2));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  // 3. Upload to Supabase Storage
  const admin = supabaseAdmin();
  const path = `gdpr-exports/${organizationId}/${userId}-${Date.now()}.zip`;

  const { error: uploadError } = await admin.storage
    .from("uploads")
    .upload(path, buffer, { contentType: "application/zip", upsert: false });

  if (uploadError) throw uploadError;

  // 4. Generate a signed URL valid for 7 days
  const { data: signedUrlData, error: urlError } = await admin.storage
    .from("uploads")
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (urlError) throw urlError;
  // Supabase can in principle return neither data nor an error; throwing the
  // null `urlError` here would reject with `null`, which callers can't log.
  if (!signedUrlData) throw new Error(`Supabase returned no signed URL for ${path}`);

  const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 7 * 1000);

  // 5. Record a DataRequest row for audit trail
  await prisma.dataRequest.create({
    data: {
      organizationId,
      userId,
      type: "EXPORT",
      status: "COMPLETED",
      downloadUrl: signedUrlData.signedUrl,
      downloadExpiresAt: expiresAt,
      completedAt: new Date(),
    },
  });

  // 6. Audit log
  await audit({
    organizationId,
    userId,
    action: "EXPORT",
    resourceType: "user_data",
    resourceId: userId,
    metadata: { format: "zip", sizeBytes: buffer.length },
  });

  return { downloadUrl: signedUrlData.signedUrl, expiresAt };
}
