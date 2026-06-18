import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";

const router = Router();
router.use(authenticate);

// GET /api/facilities — list sites.
// ADMIN sees every site IN THEIR ORGANIZATION; everyone else sees only their own.
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const where = req.user!.role === "ADMIN"
      ? { organizationId: req.user!.organizationId }
      : { id: req.user!.facilityId };
    const facilities = await prisma.facility.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        timezone: true,
        _count: { select: { units: true, users: true } },
      },
    });
    res.json({ facilities });
  } catch (err) {
    next(err);
  }
});

export default router;
