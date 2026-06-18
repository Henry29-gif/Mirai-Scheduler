import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";
import { resolveScopedFacility } from "../utils/tenant";

const router = Router();
router.use(authenticate);

// GET /api/users — list staff in a facility.
// ADMIN may pass ?facilityId=… to view any site IN THEIR ORG; others see only their own.
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const isAdmin = req.user!.role === "ADMIN";
    const facilityId = await resolveScopedFacility(req, req.query.facilityId as string | undefined);
    const users = await prisma.user.findMany({
      where: { facilityId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        certification: true,
        hourlyRate: isAdmin, // pay rate is visible to admins only
        isActive: true,
      },
      orderBy: [{ role: "asc" }, { lastName: "asc" }],
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me — the current logged-in user
router.get("/me", async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        certification: true,
        hourlyRate: true,
        facility: { select: { id: true, name: true } },
      },
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
