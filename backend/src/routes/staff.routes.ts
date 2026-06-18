import { Router } from "express";
import multer from "multer";
import { PDFDocument } from "pdf-lib";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";
import { resolveScopedFacility } from "../utils/tenant";
import { logAudit } from "../services/audit.service";

const router = Router();
router.use(authenticate);
router.use(requireRole("ADMIN")); // "My Staff" is admin-only (pay + HR docs)

const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 36e5;
const GRACE_MIN = 5;        // clock-in within 5 min of start = on time
const EARLY_WINDOW_MIN = 60; // a clock-in up to 60 min before start counts for the shift

// Confirm a staff member is inside this admin's organization.
async function adminStaff(req: AuthRequest, userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, facilityId: true, organizationId: true },
  });
  if (!u || u.organizationId !== req.user!.organizationId) return null;
  return u;
}

// ── GET /api/staff/roster?facilityId&month&year — staff list + HR metrics ────
router.get("/roster", async (req: AuthRequest, res, next) => {
  try {
    const facilityId = await resolveScopedFacility(req, req.query.facilityId as string | undefined);
    const month = Number(req.query.month) || 0;
    const year = Number(req.query.year) || 0;
    const now = Date.now();

    const staff = await prisma.user.findMany({
      where: { facilityId, isActive: true, role: "STAFF" },
      select: { id: true, firstName: true, lastName: true, certification: true, hourlyRate: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const ids = staff.map((s) => s.id);

    const [shifts, clockIns, callInGroups, docGroups] = await Promise.all([
      prisma.shift.findMany({
        where: { staffId: { in: ids }, status: "PUBLISHED" },
        select: { staffId: true, startTime: true, endTime: true },
      }),
      prisma.clockInEvent.findMany({
        where: { userId: { in: ids }, event: "CLOCK_IN" },
        select: { userId: true, timestamp: true },
        orderBy: { timestamp: "asc" },
      }),
      prisma.callInReport.groupBy({ by: ["staffId"], where: { staffId: { in: ids } }, _count: true }),
      prisma.staffDocument.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: true }),
    ]);

    const shiftsBy: Record<string, { startTime: Date; endTime: Date }[]> = {};
    for (const s of shifts) (shiftsBy[s.staffId!] = shiftsBy[s.staffId!] || []).push(s);
    const clocksBy: Record<string, number[]> = {};
    for (const c of clockIns) (clocksBy[c.userId] = clocksBy[c.userId] || []).push(c.timestamp.getTime());
    const callInBy: Record<string, number> = {};
    for (const g of callInGroups) callInBy[g.staffId] = g._count;
    const docCountBy: Record<string, number> = {};
    for (const g of docGroups) docCountBy[g.userId] = g._count;

    const inMonth = (d: Date) => !month || (d.getFullYear() === year && d.getMonth() + 1 === month);

    const roster = staff.map((u) => {
      const myShifts = shiftsBy[u.id] || [];
      const myClocks = clocksBy[u.id] || [];
      const pastShifts = myShifts.filter((s) => s.startTime.getTime() < now);

      let worked = 0, onTime = 0, late = 0;
      for (const s of pastShifts) {
        const winStart = s.startTime.getTime() - EARLY_WINDOW_MIN * 60000;
        const ci = myClocks.find((t) => t >= winStart && t <= s.endTime.getTime());
        if (ci === undefined) continue;
        worked++;
        if (ci <= s.startTime.getTime() + GRACE_MIN * 60000) onTime++; else late++;
      }

      // Pay for the selected month's scheduled shifts (straight hours × rate).
      const monthHours = myShifts.filter((s) => inMonth(s.startTime)).reduce((h, s) => h + hours(s.startTime, s.endTime), 0);
      const rate = u.hourlyRate || 0;

      const attendancePct = pastShifts.length ? Math.round((100 * worked) / pastShifts.length) : null;
      const punctualityPct = worked ? Math.round((100 * onTime) / worked) : null;
      const callIns = callInBy[u.id] || 0;

      // Reliability — composite of attendance + punctuality, penalized by call-ins.
      let reliabilityScore: number | null = null;
      let reliabilityLabel = "No data yet";
      if (pastShifts.length) {
        const base = worked > 0 ? 0.6 * (attendancePct ?? 0) + 0.4 * (punctualityPct ?? 0) : (attendancePct ?? 0);
        reliabilityScore = Math.max(0, Math.min(100, Math.round(base - callIns * 5)));
        reliabilityLabel = reliabilityScore >= 90 ? "Excellent" : reliabilityScore >= 75 ? "Good" : reliabilityScore >= 50 ? "Fair" : "At risk";
      }

      return {
        userId: u.id, firstName: u.firstName, lastName: u.lastName, certification: u.certification,
        hourlyRate: u.hourlyRate,
        shiftsWorked: worked,
        shiftsScheduledPast: pastShifts.length,
        shiftsScheduledTotal: myShifts.length,
        attendancePct, punctualityPct, lateCount: late, callIns,
        payHours: Math.round(monthHours), pay: Math.round(monthHours * rate),
        reliabilityScore, reliabilityLabel,
        documentCount: docCountBy[u.id] || 0,
      };
    });

    res.json({ facilityId, month, year, staff: roster });
  } catch (err) { next(err); }
});

// ── Documents ───────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

// POST /api/staff/:userId/documents — upload one or more PDFs.
router.post("/:userId/documents", upload.array("files", 10), async (req: AuthRequest, res, next) => {
  try {
    const staff = await adminStaff(req, req.params.userId);
    if (!staff) return res.status(404).json({ message: "Staff member not found in your organization" });
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ message: "Attach at least one PDF" });

    await prisma.staffDocument.createMany({
      data: files.map((f) => ({
        userId: staff.id, facilityId: staff.facilityId,
        filename: f.originalname, mimeType: f.mimetype, size: f.size,
        data: f.buffer, uploadedById: req.user!.id,
      })),
    });
    await logAudit({
      facilityId: staff.facilityId, actorId: req.user!.id, action: "STAFF_DOCS_UPLOADED",
      summary: `Uploaded ${files.length} document(s) for ${staff.firstName} ${staff.lastName}`,
      entityType: "User", entityId: staff.id,
    });
    res.status(201).json({ message: `${files.length} file(s) uploaded ✓` });
  } catch (err) { next(err); }
});

// GET /api/staff/:userId/documents — list document metadata (no bytes).
router.get("/:userId/documents", async (req: AuthRequest, res, next) => {
  try {
    const staff = await adminStaff(req, req.params.userId);
    if (!staff) return res.status(404).json({ message: "Staff member not found" });
    const documents = await prisma.staffDocument.findMany({
      where: { userId: staff.id },
      select: { id: true, filename: true, size: true, createdAt: true, source: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ documents });
  } catch (err) { next(err); }
});

// GET /api/staff/:userId/documents/merged — all PDFs merged into one download.
router.get("/:userId/documents/merged", async (req: AuthRequest, res, next) => {
  try {
    const staff = await adminStaff(req, req.params.userId);
    if (!staff) return res.status(404).json({ message: "Staff member not found" });
    const docs = await prisma.staffDocument.findMany({ where: { userId: staff.id }, orderBy: { createdAt: "asc" } });
    if (!docs.length) return res.status(404).json({ message: "No documents to download" });

    const merged = await PDFDocument.create();
    let added = 0;
    for (const d of docs) {
      try {
        const src = await PDFDocument.load(d.data as Buffer, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        added++;
      } catch { /* skip unreadable/corrupt PDF */ }
    }
    if (!added) return res.status(422).json({ message: "Could not read any of the PDFs" });

    const bytes = await merged.save();
    const name = `${staff.firstName}_${staff.lastName}_documents.pdf`.replace(/[^\w.\-]/g, "");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(Buffer.from(bytes));
  } catch (err) { next(err); }
});

// GET /api/staff/:userId/documents/:docId/download — single PDF.
router.get("/:userId/documents/:docId/download", async (req: AuthRequest, res, next) => {
  try {
    const staff = await adminStaff(req, req.params.userId);
    if (!staff) return res.status(404).json({ message: "Staff member not found" });
    const doc = await prisma.staffDocument.findFirst({ where: { id: req.params.docId, userId: staff.id } });
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename.replace(/[^\w.\-]/g, "_")}"`);
    res.send(doc.data as Buffer);
  } catch (err) { next(err); }
});

// DELETE /api/staff/:userId/documents/:docId — remove a document.
router.delete("/:userId/documents/:docId", async (req: AuthRequest, res, next) => {
  try {
    const staff = await adminStaff(req, req.params.userId);
    if (!staff) return res.status(404).json({ message: "Staff member not found" });
    await prisma.staffDocument.deleteMany({ where: { id: req.params.docId, userId: staff.id } });
    res.json({ message: "Document deleted" });
  } catch (err) { next(err); }
});

export default router;
