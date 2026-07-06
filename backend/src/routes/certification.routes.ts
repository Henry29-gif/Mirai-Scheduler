import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";

const router = Router();
router.use(authenticate);

// GET /api/certifications            → the signed-in user's own certifications
// GET /api/certifications?userId=ID  → that staffer's (managers/admins, same org only)
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const q = req.query.userId as string | undefined;
    let userId = req.user!.id;
    if (q && q !== req.user!.id) {
      if (req.user!.role !== "ADMIN" && req.user!.role !== "MANAGER") return res.status(403).json({ message: "Insufficient permissions" });
      const target = await prisma.user.findUnique({ where: { id: q }, select: { organizationId: true } });
      if (!target || target.organizationId !== req.user!.organizationId) return res.status(404).json({ message: "Staff member not found in your organization" });
      userId = q;
    }
    const certifications = await prisma.staffCertification.findMany({
      where: { userId },
      orderBy: [{ expiryDate: "asc" }, { name: "asc" }],
    });
    res.json({ certifications });
  } catch (err) { next(err); }
});

// POST /api/certifications { name, number?, expiryDate? } — add to own record.
router.post("/", async (req: AuthRequest, res, next) => {
  try {
    const { name, number, expiryDate } = (req.body || {}) as { name?: string; number?: string; expiryDate?: string };
    if (!name || !name.trim()) return res.status(400).json({ message: "Certification name is required" });
    if (expiryDate && isNaN(+new Date(expiryDate))) return res.status(400).json({ message: "Invalid expiry date" });
    const cert = await prisma.staffCertification.create({
      data: {
        userId: req.user!.id,
        name: name.trim(),
        number: number?.trim() || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });
    res.status(201).json({ message: "Certification added ✓", id: cert.id });
  } catch (err) { next(err); }
});

// PATCH /api/certifications/:id — edit one of your own.
router.patch("/:id", async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.staffCertification.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user!.id) return res.status(404).json({ message: "Certification not found" });
    const { name, number, expiryDate } = (req.body || {}) as { name?: string; number?: string; expiryDate?: string };
    if (expiryDate && isNaN(+new Date(expiryDate))) return res.status(400).json({ message: "Invalid expiry date" });
    // A changed expiry date re-arms the expiry alerts (alertStage 0) so the
    // daily sweep evaluates the new date fresh — including renewals that land
    // inside a warning window, and dates that were cleared entirely.
    const newExpiry = expiryDate !== undefined ? (expiryDate ? new Date(expiryDate) : null) : undefined;
    const expiryChanged = newExpiry !== undefined && +(newExpiry ?? new Date(0)) !== +(existing.expiryDate ?? new Date(0));
    await prisma.staffCertification.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(number !== undefined ? { number: number?.trim() || null } : {}),
        ...(newExpiry !== undefined ? { expiryDate: newExpiry } : {}),
        ...(expiryChanged ? { alertStage: 0 } : {}),
      },
    });
    res.json({ message: "Certification updated ✓" });
  } catch (err) { next(err); }
});

// DELETE /api/certifications/:id — remove one of your own.
router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    await prisma.staffCertification.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    res.json({ message: "Certification removed" });
  } catch (err) { next(err); }
});

export default router;
