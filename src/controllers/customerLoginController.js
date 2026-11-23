
import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import UserSession from "../models/UserSession.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

const REFRESH_TOKEN_DAYS = 30;

export const loginCustomer = async (req, res) => {
  try {
    // Firebase middleware has already verified the ID token.
    const { uid, mobile } = req.firebaseUser;

    // Find the existing account using the verified mobile number.
    const user = await User.findOne({ mobile }).select(
      "_id name email mobile firebase_uid user_type is_active"
    );

    if (!user) {
      return sendError(res, {
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
        message: "No account was found. Please register first.",
      });
    }

    // Ensure the Firebase identity matches the registered account.
    if (!user.firebase_uid || user.firebase_uid !== uid) {
      return sendError(res, {
        statusCode: 409,
        code: "IDENTITY_MISMATCH",
        message:
          "This account cannot be linked to the verified identity. Please contact support.",
      });
    }

    // Only customer accounts can use this endpoint.
    if (user.user_type !== "CUSTOMER") {
      return sendError(res, {
        statusCode: 403,
        code: "CUSTOMER_ACCESS_NOT_AVAILABLE",
        message: "Customer access is not available for this account.",
      });
    }

    if (!user.is_active) {
      return sendError(res, {
        statusCode: 403,
        code: "ACCOUNT_INACTIVE",
        message: "This account is currently unavailable.",
      });
    }

    // Ensure the access-token signing secret is configured.
    const accessSecret = process.env.JWT_ACCESS_SECRET;

    if (!accessSecret) {
      console.error("JWT_ACCESS_SECRET is not configured.");

      return sendError(res, {
        statusCode: 500,
        code: "AUTH_CONFIGURATION_ERROR",
        message: "Unable to log in right now.",
      });
    }

    // Generate a random refresh credential.
    // Store only its SHA-256 hash in MongoDB.
    const refreshToken = randomBytes(48).toString("hex");

    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
    );

    // Create a server-side session.
    const userSession = await UserSession.create({
      user_id: user._id,
      refresh_token_hash: refreshTokenHash,
      device_name:
        typeof req.body?.deviceName === "string"
          ? req.body.deviceName.trim().slice(0, 100)
          : "Web Browser",
      platform: "WEB",
      expires_at: expiresAt,
      last_used_at: new Date(),
    });

    // Issue a short-lived Kaamdaar access token.
    const accessToken = jwt.sign(
      {
        sub: user._id.toString(),
        role: "CUSTOMER",
        sessionId: userSession._id.toString(),
      },
      accessSecret,
      { expiresIn: "4h" }
    );

    // Keep the refresh credential out of the JSON response.
    res.cookie("kaamdaar_refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Customer login successful.",
      data: {
        accessToken,
        tokenType: "Bearer",
        expiresIn: 900,
        customer: {
          id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: "CUSTOMER",
        },
      },
    });
  } catch (error) {
    console.error(
      "Customer login failed:",
      error.code || error.name || "UNKNOWN_ERROR"
    );

    return sendError(res, {
      statusCode: 500,
      code: "CUSTOMER_LOGIN_FAILED",
      message: "Unable to log in. Please try again.",
    });
  }
};
