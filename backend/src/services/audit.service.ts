import { prisma } from "../config/prisma";

/**
 * Append an immutable audit-log entry. Never throws — auditing must not break
 * the action it records.
 */
export async function logAudit(opts: {
  facilityId: string;
  actorId?: string | null;
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    let actorName = "System";
    if (opts.actorId) {
      const u = await prisma.user.findUnique({
        where: { id: opts.actorId },
        select: { firstName: true, lastName: true },
      });
      if (u) actorName = `${u.firstName} ${u.lastName}`;
    }
    await prisma.auditLog.create({
      data: {
        facilityId: opts.facilityId,
        actorId: opts.actorId ?? null,
        actorName,
        action: opts.action,
        summary: opts.summary,
        entityType: opts.entityType,
        entityId: opts.entityId,
      },
    });
  } catch {
    /* swallow — auditing is best-effort */
  }
}

// Resolve the facility a shift belongs to (via its unit).
export async function facilityOfShift(shiftId: string): Promise<string | null> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { unit: { select: { facilityId: true } } },
  });
  return shift?.unit?.facilityId ?? null;
}
