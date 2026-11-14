import express from "express";
import { getDashboardSummary } from "../../controllers/Admin/adminDashboard.controller.js";
import { authenticateUser } from "../../middleware/authmiddleware.js";
import { authorizeRoles } from "../../middleware/authorizeRoles.js";


const router = express.Router();

// GET /api/v1/admin/dashboard/summary
router.get("/summary", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getDashboardSummary);


export default router;
