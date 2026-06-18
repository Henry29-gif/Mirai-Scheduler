import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { generateSchedule, publishScheduleHandler, getScheduleForMonth, getCostSummary, getTimesheet, getStaffingRequirements, saveStaffingRequirements, getWorkload, reassignShift, moveShift } from "../controllers/schedule.controller";

const router = Router();

router.use(authenticate);

router.get("/",                                               getScheduleForMonth);
router.get("/cost",         requireRole("ADMIN", "MANAGER"), getCostSummary);
router.get("/requirements", requireRole("ADMIN", "MANAGER"), getStaffingRequirements);
router.put("/requirements", requireRole("ADMIN", "MANAGER"), saveStaffingRequirements);
router.get("/workload",     requireRole("ADMIN", "MANAGER"), getWorkload);
router.post("/reassign",    requireRole("ADMIN", "MANAGER"), reassignShift);
router.post("/move",        requireRole("ADMIN", "MANAGER"), moveShift);
router.get("/timesheet",    requireRole("ADMIN"), getTimesheet);
router.post("/generate",    requireRole("ADMIN", "MANAGER"), generateSchedule);
router.patch("/:schedulePeriodId/publish", requireRole("ADMIN", "MANAGER"), publishScheduleHandler);

export default router;
