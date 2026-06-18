import { prisma } from "../config/prisma";

// Create an in-app notification. Best-effort — never throws into the caller.
export async function notify(userId: string, title: string, body: string, type = "info") {
  try {
    await prisma.notification.create({ data: { userId, title, body, type } });
  } catch { /* best-effort */ }
}

// Notify many users at once (e.g. schedule published → all staff).
export async function notifyMany(userIds: string[], title: string, body: string, type = "info") {
  try {
    if (userIds.length) {
      await prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, title, body, type })) });
    }
  } catch { /* best-effort */ }
}
