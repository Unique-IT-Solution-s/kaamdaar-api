import mongoose from "mongoose";

import { verifyAccessToken } from "../utils/token.js";
import User from "../models/User.js";
import UserSession from "../models/UserSession.js";

// ==================================================
// AUTHENTICATE USER
// ==================================================

export const authenticateUser = async (req, res, next) => {
  try {
    // ----------------------------------------------
    // 1. Get authorization header
    // ----------------------------------------------

    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "AUTH_TOKEN_REQUIRED",
        message: "Authentication token is required.",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        code: "AUTH_TOKEN_REQUIRED",
        message: "Authentication token is required.",
      });
    }

    // ----------------------------------------------
    // 2. Verify JWT
    // ----------------------------------------------

    const decoded = verifyAccessToken(token);

    if (
      !decoded.userId ||
      !decoded.sessionId ||
      !decoded.role ||
      !mongoose.isValidObjectId(decoded.userId) ||
      !mongoose.isValidObjectId(decoded.sessionId)
    ) {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN_PAYLOAD",
        message: "Invalid authentication token.",
      });
    }

    // ----------------------------------------------
    // 3. Verify active user session
    // ----------------------------------------------

    const activeSession = await UserSession.findOne({
      _id: decoded.sessionId,
      user_id: decoded.userId,
      revoked_at: null,
      expires_at: { $gt: new Date() },
    }).select("_id user_id platform expires_at");

    if (!activeSession) {
      return res.status(401).json({
        success: false,
        code: "SESSION_EXPIRED_OR_REVOKED",
        message: "Your session has expired. Please log in again.",
      });
    }

    // ----------------------------------------------
    // 4. Verify user
    // ----------------------------------------------

    const user = await User.findOne({
      _id: decoded.userId,
      is_active: true,
    }).select("-__v");

    if (!user) {
      return res.status(401).json({
        success: false,
        code: "USER_UNAVAILABLE",
        message: "User account is unavailable.",
      });
    }

    // ----------------------------------------------
    // 5. Verify role consistency
    // ----------------------------------------------

    if (user.user_type !== decoded.role) {
      return res.status(401).json({
        success: false,
        code: "ROLE_MISMATCH",
        message: "Authentication role mismatch.",
      });
    }

    // ----------------------------------------------
    // 6. Attach authenticated data to request
    // ----------------------------------------------

    req.user = {
      id: user._id.toString(),
      userId: user._id.toString(),
      role: user.user_type,
      sessionId: activeSession._id.toString(),
      platform: activeSession.platform,
      user,
    };

    // ----------------------------------------------
    // 7. Continue
    // ----------------------------------------------

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        code: "ACCESS_TOKEN_EXPIRED",
        message: "Access token expired. Please refresh your session.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        code: "INVALID_ACCESS_TOKEN",
        message: "Invalid authentication token.",
      });
    }

    console.error("Authentication middleware error:", error);

    return res.status(401).json({
      success: false,
      code: "AUTHENTICATION_FAILED",
      message: "Authentication failed. Please log in again.",
    });
  }
};