import crypto from "node:crypto"
import {
  sendFirebaseOtp,
  verifyFirebaseOtp,
} from "../services/firebaseOtp.services.js";

// Temporary example storage.
// Production mein Redis ya database with TTL use karo.
const otpSessions = new Map();

// Request OTP
export const requestOtpController = async (req, res) => {
  try {
    const { mobile, recaptchaToken } = req.body;

    if (typeof mobile !== "string") {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    const normalizedMobile = mobile
      .trim()
      .replace(/[\s()-]/g, "");

    if (!/^\+[1-9]\d{7,14}$/.test(normalizedMobile)) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid phone number with country code",
      });
    }

    if (
      typeof recaptchaToken !== "string" ||
      !recaptchaToken.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "App verification is required",
      });
    }

    const firebaseResult = await sendFirebaseOtp({
      phoneNumber: normalizedMobile,
      recaptchaToken,
    });

    if (!firebaseResult.sessionInfo) {
      return res.status(502).json({
        success: false,
        message: "Firebase did not return an OTP session",
      });
    }

    const challengeId = crypto.randomUUID();

    // Store sessionInfo only on the backend.
    otpSessions.set(challengeId, {
      mobile: normalizedMobile,
      sessionInfo: firebaseResult.sessionInfo,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: {
        challengeId,
        expiresIn: 300,
      },
    });
  } catch (error) {
    console.error("Request OTP error:", error.message);

    return res.status(400).json({
      success: false,
      message: "Unable to send OTP",
    });
  }
};

// Verify OTP
export const verifyOtpController = async (req, res) => {
  try {
    const { challengeId, otp } = req.body;

    if (
      typeof challengeId !== "string" ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid challenge ID and six-digit OTP are required",
      });
    }

    const session = otpSessions.get(challengeId);

    if (!session) {
      return res.status(400).json({
        success: false,
        message: "OTP session not found or already used",
      });
    }

    if (Date.now() > session.expiresAt) {
      otpSessions.delete(challengeId);

      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP",
      });
    }

    if (session.attempts >= 5) {
      otpSessions.delete(challengeId);

      return res.status(429).json({
        success: false,
        message: "Too many verification attempts",
      });
    }

    session.attempts += 1;

    const firebaseResult = await verifyFirebaseOtp({
      sessionInfo: session.sessionInfo,
      code: otp.trim(),
    });

    // OTP was verified successfully. Prevent challenge reuse.
    otpSessions.delete(challengeId);

    return res.status(200).json({
      success: true,
      message: "Phone number verified successfully",
      data: {
        mobile: firebaseResult.phoneNumber,
        firebaseUid: firebaseResult.localId,
        idToken: firebaseResult.idToken,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error.message);

    return res.status(400).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};