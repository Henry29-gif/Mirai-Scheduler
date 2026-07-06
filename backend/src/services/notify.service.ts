import { prisma } from "../config/prisma";

// Create an in-app notification. Best-effort — never throws into the caller.
export async function notify(userId: string, title: string, body: string, type = "info", metadata?: Record<string, unknown>) {
  try {
    await prisma.notification.create({ data: { userId, title, body, type, ...(metadata ? { metadata: metadata as any } : {}) } });
  } catch { /* best-effort */ }
}

// Notify many users at once (e.g. schedule published → all staff).
export async function notifyMany(userIds: string[], title: string, body: string, type = "info", metadata?: Record<string, unknown>) {
  try {
    if (userIds.length) {
      await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, title, body, type, ...(metadata ? { metadata: metadata as any } : {}) })) });
    }
  } catch { /* best-effort */ }
}

// The supervisors who should hear about a staff member's shift activity: the
// MANAGERs at that staff member's facility plus the ADMINs across their whole
// organization. Always excludes the staff member; pass `exclude` to also skip
// whoever performed the action (so they aren't notified about their own change).
export async function supervisorIdsForStaff(staffUserId: string, exclude: string[] = []): Promise<string[]> {
  try {
    const staff = await prisma.user.findUnique({
      where: { id: staffUserId },
      select: { facilityId: true, organizationId: true },
    });
    if (!staff) return [];
    const supers = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: "MANAGER", facilityId: staff.facilityId },
          { role: "ADMIN", organizationId: staff.organizationId },
        ],
      },
      select: { id: true },
    });
    const skip = new Set<string>([staffUserId, ...exclude]);
    return supers.map((s) => s.id).filter((id) => !skip.has(id));
  } catch {
    return [];
  }
}

// Notify a staff member's supervisors (managers + org admins) in one call. Used
// whenever a staff member changes a shift (picks up, drops, calls in sick, or
// trades) or requests time off, so admins see it in their notification bell on
// both web and mobile.
export async function notifySupervisors(
  staffUserId: string,
  title: string,
  body: string,
  type = "info",
  exclude: string[] = [],
  metadata?: Record<string, unknown>,
) {
  const ids = await supervisorIdsForStaff(staffUserId, exclude);
  await notifyMany(ids, title, body, type, metadata);
}
