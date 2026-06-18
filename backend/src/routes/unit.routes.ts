import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
const router = Router();
router.use(authenticate);
// TODO: implement unit routes
export default router;
