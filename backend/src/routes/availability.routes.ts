import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";

const router = Router();
router.use(authenticate);

const SHIFTS = ["Day", "Evening", "Night"];

// GET /api/availability — the current user's unavailable slots.
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const blocks = await prisma.availabilityBlock.findMany({
      where: { userId: req.user!.id },
      select: { dayOfWeek: true, shift: true },
    });
    res.json({ blocks });
  } catch (err) { next(err); }
});

// POST /api/availability { dayOfWeek, shift, available }
// available=false → mark unavailable (add block); available=true → remove block.
router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const { dayOfWeek, shift, available } = req.body as { dayOfWeek: number; shift: string; available: boolean };
    if (dayOfWeek < 0 || dayOfWeek > 6 || !SHIFTS.includes(shift)) {
      return res.status(400).json({ message: "Invalid day or shift" });
    }
    const key = { userId_dayOfWeek_shift: { userId: req.user!.id, dayOfWeek, shift } };
    if (available) {
      await prisma.availabilityBlock.deleteMany({ where: { userId: req.user!.id, dayOfWeek, shift } });
    } else {
      await prisma.availabilityBlock.upsert({
        where: key,
        update: {},
        create: { userId: req.user!.id, dayOfWeek, shift },
      });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
