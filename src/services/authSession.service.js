import crypto from "node:crypto";

import UserSession from "../models/UserSession.js";
import User from "../models/User.js";

import { generateAccessToken } from "../utils/token.js";

// ==================================================
// CONSTANTS
// ==================================================

const REFRESH_TOKEN_DAYS = 30;
const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TOKEN_LENGTH = REFRESH_TOKEN_BYTES * 2;

const ALLOWED_PLATFORMS = [
  "WEB",
  "ANDROID",
  "IOS",
  "OTHER",
];

// ==================================================
// HELPER FUNCTIONS
// ==================================================

const hashToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const generateRefreshToken = () => {
  return crypto
    .randomBytes(REFRESH_TOKEN_BYTES)
    .toString("hex");
};

const getRefreshTokenExpiry = () => {
  return new Date(
    Date.now() +
      REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
  );
};

const validateRefreshToken = (token) => {
  return (
    typeof token === "string" &&
    token.length === REFRESH_TOKEN_LENGTH &&
    /^[a-f0-9]{96}$/i.test(token)
  );
};

// ==================================================
// 1. CREATE USER SESSION
// ==================================================

export const createUserSession = async ({
  user,
  platform = "OTHER",
  deviceId,
  deviceName,
  mongoSession = null,
}) => {
  if (!user?._id) {
    throw new Error(
      "Valid user is required to create a session."
    );
  }

  if (!ALLOWED_PLATFORMS.includes(platform)) {
    throw new Error("Invalid session platform.");
  }

  if (user.is_active !== true) {
    throw new Error(
      "Inactive users cannot create sessions."
    );
  }

  const refreshToken = generateRefreshToken();
  const expiresAt = getRefreshTokenExpiry();

  const sessionData = {
    user_id: user._id,
    refresh_token_hash: hashToken(refreshToken),
    device_id: deviceId || null,
    device_name: deviceName || null,
    platform,
    expires_at: expiresAt,
    last_used_at: new Date(),
  };

  // Use the supplied transaction when available.
  const createdSessions = await UserSession.create(
    [sessionData],
    mongoSession ? { session: mongoSession } : {}
  );

  const session = createdSessions[0];

  // Access token includes the session ID.
  const accessToken = generateAccessToken(
    user,
    session._id
  );

  return {
    sessionId: session._id,
    accessToken,
    refreshToken,
    expiresAt,
  };
};

// ==================================================
// 2. ROTATE REFRESH TOKEN
// ==================================================

export const rotateRefreshToken = async (refreshToken) => {
  if (!validateRefreshToken(refreshToken)) {
    throw new Error("Invalid refresh token.");
  }

  const oldHash = hashToken(refreshToken);

  // Find active session.
  const session = await UserSession.findOne({
    refresh_token_hash: oldHash,
    revoked_at: null,
    expires_at: { $gt: new Date() },
  });

  if (!session) {
    throw new Error("Invalid or expired session.");
  }

  // Validate user.
  const user = await User.findOne({
    _id: session.user_id,
    is_active: true,
  });

  if (!user) {
    throw new Error("User account is unavailable.");
  }

  // Generate new refresh token.
  const newRefreshToken = generateRefreshToken();
  const newExpiresAt = getRefreshTokenExpiry();

  // Atomically replace the old refresh token.
  const updatedSession = await UserSession.findOneAndUpdate(
    {
      _id: session._id,
      refresh_token_hash: oldHash,
      revoked_at: null,
      expires_at: { $gt: new Date() },
    },
    {
      $set: {
        refresh_token_hash: hashToken(newRefreshToken),
        expires_at: newExpiresAt,
        last_used_at: new Date(),
        revoke_reason: null,
      },
    },
    {
      new: true,
    }
  );

  if (!updatedSession) {
    throw new Error(
      "Refresh token has already been used or revoked."
    );
  }

  // Generate access token for the same session.
  const accessToken = generateAccessToken(
    user,
    updatedSession._id
  );

  return {
    sessionId: updatedSession._id,
    accessToken,
    refreshToken: newRefreshToken,
    expiresAt: newExpiresAt,
  };
};

// ==================================================
// 3. REVOKE USER SESSION
// ==================================================

export const revokeUserSession = async (refreshToken) => {
  if (!validateRefreshToken(refreshToken)) {
    throw new Error("Invalid refresh token.");
  }

  const tokenHash = hashToken(refreshToken);

  const revokedSession = await UserSession.findOneAndUpdate(
    {
      refresh_token_hash: tokenHash,
      revoked_at: null,
    },
    {
      $set: {
        revoked_at: new Date(),
        revoke_reason: "LOGOUT",
      },
    },
    {
      new: true,
    }
  );

  if (!revokedSession) {
    throw new Error(
      "Session not found or already revoked."
    );
  }

  return revokedSession;
};

// ==================================================
// 4. REVOKE ALL USER SESSIONS
// ==================================================

export const revokeAllUserSessions = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required.");
  }

  return UserSession.updateMany(
    {
      user_id: userId,
      revoked_at: null,
    },
    {
      $set: {
        revoked_at: new Date(),
        revoke_reason: "LOGOUT_ALL",
      },
    }
  );
};