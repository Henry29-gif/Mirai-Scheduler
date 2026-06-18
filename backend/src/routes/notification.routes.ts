import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";

const router = Router();
router.use(authenticate);

// GET /api/notifications — current user's recent notifications + unread count.
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);
    res.json({ notifications: items, unread });
  } catch (err) { next(err); }
});

// POST /api/notifications/read-all — mark all the user's notifications read.
router.post("/read-all", async (req: AuthRequest, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, isRead: false }, data: { isRead: true } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
