import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { reportCallIn } from "../controllers/callIn.controller";

const router = Router();
router.use(authenticate);
router.post("/", reportCallIn);
export default router;
