import mongoose from "mongoose";

import { verifyAccessToken } from "../utils/token.js";
import User from "../models/User.js";
import UserSession from "../models/UserSession.js";

// ========================================
// SOCKET.IO AUTHENTICATION MIDDLEWARE
// ========================================

export const socketAuthenticateUser = async (socket, next) => {
  try {
    // --------------------------------------
    // 1. Get access token from handshake
    // --------------------------------------

    const token = socket.handshake.auth?.accessToken;

    if (typeof token !== "string" || !token.trim()) {
      return next(new Error("AUTH_TOKEN_REQUIRED"));
    }

    // --------------------------------------
    // 2. Verify JWT
    // --------------------------------------

    const decoded = verifyAccessToken(token);

    if (
      !decoded.userId ||
      !decoded.sessionId ||
      !decoded.role ||
      !mongoose.isValidObjectId(decoded.userId) ||
      !mongoose.isValidObjectId(decoded.sessionId)
    ) {
      return next(new Error("INVALID_TOKEN_PAYLOAD"));
    }

    // --------------------------------------
    // 3. Verify active session
    // --------------------------------------

    const activeSession = await UserSession.findOne({
      _id: decoded.sessionId,
      user_id: decoded.userId,
      revoked_at: null,
      expires_at: { $gt: new Date() },
    }).select("_id user_id platform expires_at");

    if (!activeSession) {
      return next(new Error("SESSION_EXPIRED_OR_REVOKED"));
    }

    // --------------------------------------
    // 4. Verify active user
    // --------------------------------------

    const user = await User.findOne({
      _id: decoded.userId,
      account_status: "ACTIVE",
    }).select("-__v");

    if (!user) {
      return next(new Error("USER_UNAVAILABLE"));
    }

    // --------------------------------------
    // 5. Verify role consistency
    // --------------------------------------

    if (user.user_type !== decoded.role) {
      return next(new Error("ROLE_MISMATCH"));
    }

    // --------------------------------------
    // 6. Attach authenticated data
    // --------------------------------------

    socket.data.user = {
      id: user._id.toString(),
      userId: user._id.toString(),
      role: user.user_type,
      sessionId: activeSession._id.toString(),
      platform: activeSession.platform,
    };

    // --------------------------------------
    // 7. Allow connection
    // --------------------------------------

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new Error("ACCESS_TOKEN_EXPIRED"));
    }

    if (error.name === "JsonWebTokenError") {
      return next(new Error("INVALID_ACCESS_TOKEN"));
    }

    console.error("Socket authentication error:", error);

    return next(new Error("AUTHENTICATION_FAILED"));
  }
};
