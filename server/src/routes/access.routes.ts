import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import {
  giveStudentAccess,
  revokeStudentAccess,
  bulkStudentAccess,
  giveTeacherAccess,
  revokeTeacherAccess,
  setUserPassword,
  lookupAccess,
} from "../controllers/access.controller";

const router = Router();

// Granting logins and setting other people's passwords is a super-admin power.
router.use(protect, authorize("superadmin"));

router.get("/lookup", lookupAccess);

router.post("/students/bulk", bulkStudentAccess);
router.post("/student/:id", giveStudentAccess);
router.delete("/student/:id", revokeStudentAccess);

router.post("/teacher/:id", giveTeacherAccess);
router.delete("/teacher/:id", revokeTeacherAccess);

router.post("/user/:id/password", setUserPassword);

export default router;
