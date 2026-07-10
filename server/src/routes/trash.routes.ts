import { Router } from "express";
import { protect, authorize } from "../middleware/auth";
import { getTrash, restoreTrash, purgeTrash } from "../controllers/trash.controller";

const router = Router();

// Recycle bin — super admin only (deletions and restores are sensitive).
router.get("/", protect, authorize("superadmin"), getTrash);
router.post("/:id/restore", protect, authorize("superadmin"), restoreTrash);
router.delete("/:id", protect, authorize("superadmin"), purgeTrash);

export default router;
