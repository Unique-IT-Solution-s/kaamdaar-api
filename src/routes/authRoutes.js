import express from "express";
import { requestOtpController, verifyOtpController } from "../controllers/authController.js";



const router = express.Router();

router.post("/otp/request", requestOtpController);
router.post("/otp/verify", verifyOtpController);

export default router;
