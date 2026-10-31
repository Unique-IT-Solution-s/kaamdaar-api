import express from "express";

import {getMeController, logoutAllController, logoutController, refreshTokenController, requestOtpController, verifyOtpController} from "../controllers/authController.js"
import { authenticateUser } from "../middleware/authmiddleware.js";


const router = express.Router();

// ==================================================
// PUBLIC AUTHENTICATION ROUTES
// ==================================================

// Request Firebase OTP
router.post("/otp/request", requestOtpController);

// Verify Firebase OTP and create/login customer
router.post("/otp/verify", verifyOtpController);

// Refresh access token
router.post("/token/refresh", refreshTokenController);

// ==================================================
// AUTHENTICATED ROUTES
// ==================================================

// Logout current session
router.post("/logout", authenticateUser, logoutController);

// Logout all devices
router.post("/logout-all", authenticateUser, logoutAllController);

// Get logged-in user
router.get("/me", authenticateUser, getMeController);

export default router;