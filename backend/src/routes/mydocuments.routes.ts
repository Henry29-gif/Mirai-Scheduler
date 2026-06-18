import { Router } from "express";
import multer from "multer";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../config/prisma";

// A staff member's OWN certification documents. Everything here is scoped to
// req.user.id and source="STAFF", so a staffer only ever sees/manages their own
// uploads — never another staffer's, and never admin-uploaded HR documents.
const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

// GET /api/my/documents — list my own certification documents (metadata only).
router.get("/", async (req: AuthRequest, res, next) => {
  try {
    const documents = await prisma.staffDocument.findMany({
      where: { userId: req.user!.id, source: "STAFF" },
      select: { id: true, filename: true, size: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ documents });
  } catch (err) { next(err); }
});

// POST /api/my/documents — upload one or more of my own certification PDFs.
router.post("/", upload.array("files", 10), async (req: AuthRequest, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ message: "Attach at least one PDF" });
    await prisma.staffDocument.createMany({
      data: files.map((f) => ({
        userId: req.user!.id, facilityId: req.user!.facilityId,
        filename: f.originalname, mimeType: f.mimetype, size: f.size,
        data: f.buffer, uploadedById: req.user!.id, source: "STAFF",
      })),
    });
    res.status(201).json({ message: `${files.length} file(s) uploaded ✓` });
  } catch (err) { next(err); }
});

// GET /api/my/documents/:id/download — download one of my own.
router.get("/:id/download", async (req: AuthRequest, res, next) => {
  try {
    const doc = await prisma.staffDocument.findFirst({ where: { id: req.params.id, userId: req.user!.id, source: "STAFF" } });
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename.replace(/[^\w.\-]/g, "_")}"`);
    res.send(doc.data as Buffer);
  } catch (err) { next(err); }
});

// DELETE /api/my/documents/:id — delete one of my own.
router.delete("/:id", async (req: AuthRequest, res, next) => {
  try {
    await prisma.staffDocument.deleteMany({ where: { id: req.params.id, userId: req.user!.id, source: "STAFF" } });
    res.json({ message: "Document deleted" });
  } catch (err) { next(err); }
});

export default router;
