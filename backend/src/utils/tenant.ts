import { prisma } from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

// Error that the global error middleware renders as HTTP 403.
function forbidden(message: string) {
  const e: any = new Error(message);
  e.status = 403;
  return e;
}

// All facility IDs inside one organization (for "all my sites" admin views).
export async function orgFacilityIds(organizationId: string): Promise<string[]> {
  const facilities = await prisma.facility.findMany({
    where: { organizationId },
    select: { id: true },
  });
  return facilities.map((f) => f.id);
}

/**
 * Resolve the facility a request is targeting, enforcing tenant isolation.
 *
 * - Non-admins are always pinned to their own facility (any ?facilityId is ignored).
 * - An ADMIN may target another facility via `requestedId`, but ONLY if that
 *   facility belongs to the admin's own organization. Cross-org access throws 403.
 *
 * This is the single chokepoint every facility-scoped endpoint must call instead
 * of trusting `?facilityId` from the client.
 */
export async function resolveScopedFacility(req: AuthRequest, requestedId?: string): Promise<string> {
  const me = req.user!;
  if (!requestedId || requestedId === me.facilityId) return me.facilityId;
  if (me.role !== "ADMIN") return me.facilityId; // non-admins can't reach other sites

  const facility = await prisma.facility.findUnique({
    where: { id: requestedId },
    select: { organizationId: true },
  });
  if (!facility || facility.organizationId !== me.organizationId) {
    throw forbidden("That facility is not in your organization.");
  }
  return requestedId;
}

/**
 * Throw 403 unless the caller may act on data belonging to `facilityId`.
 * Use this when an endpoint loads an entity by id (a shift, a time-off request,
 * a staff member) and must confirm it's inside the caller's tenant before
 * mutating it. Non-admins are limited to their own facility; admins to any
 * facility in their organization.
 */
export async function assertFacilityInScope(req: AuthRequest, facilityId: string): Promise<void> {
  const me = req.user!;
  if (facilityId === me.facilityId) return;
  if (me.role !== "ADMIN") throw forbidden("That record is outside your facility.");
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { organizationId: true },
  });
  if (!facility || facility.organizationId !== me.organizationId) {
    throw forbidden("That record is not in your organization.");
  }
}
