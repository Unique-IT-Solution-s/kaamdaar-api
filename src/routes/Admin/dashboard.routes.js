import express from "express";
import { getBookingStats, getDashboardSummary, getLiveBookingsController } from "../../controllers/Admin/adminDashboard.controller.js";
import { authenticateUser } from "../../middleware/authmiddleware.js";
import { authorizeRoles } from "../../middleware/authorizeRoles.js";


const router = express.Router();
// console.log("Admin dashboard routes file loaded");

// GET /api/v1/admin/dashboard/summary
router.get("/summary", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getDashboardSummary);
router.get("/booking-stats", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN"), getBookingStats)
router.get("/live-bookings", authenticateUser, authorizeRoles("ADMIN", "SUPER_ADMIN") , getLiveBookingsController)

// console.log("Live bookings route registered");


export default router;
