import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { setActiveOrgId, getOrgMembership } from "@/lib/auth/org-context";
import { safeRedirectPath } from "@/lib/http/safe-redirect";

/**
 * Switch the active organization for the current user.
 *
 * GET /api/org/switch?orgId=UUID  - sets the active-org-id cookie and redirects
 * POST /api/org/switch             - sets the cookie, returns JSON
 *
 * Security: verifies that the user is an active member of the target org
 * before setting the cookie. Without this check, any authenticated user
 * could set their active-org-id cookie to an org they don't belong to -
 * a cross-tenant IDOR. The downstream consumers (Server Actions) do
 * re-check membership, but that safety is incidental, not designed.
 */

export async function GET(req: NextRequest) {
  const session = await requireUser();
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "Missing orgId" }, { status: 400 });

  // Verify the user is an active member of this org
  const membership = await getOrgMembership(session.user.id, orgId);
  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of this organization" },
      { status: 403 }
    );
  }

  await setActiveOrgId(orgId);

  // Same-origin paths only: an absolute or protocol-relative `redirect` would
  // otherwise send a signed-in user off-site from a link on this domain.
  const redirect = safeRedirectPath(req.nextUrl.searchParams.get("redirect"), req.url);
  return NextResponse.redirect(new URL(redirect, req.url));
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    const { orgId } = await req.json();
    if (!orgId) return NextResponse.json({ error: "Missing orgId" }, { status: 400 });

    // Verify the user is an active member of this org
    const membership = await getOrgMembership(session.user.id, orgId);
    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this organization" },
        { status: 403 }
      );
    }

    await setActiveOrgId(orgId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
