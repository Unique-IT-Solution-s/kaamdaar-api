import mongoose from "mongoose";
import User from "../models/User.js";
import Role from "../models/Role.js";
import CustomerProfile from "../models/CustomerProfile.js";
import UserConsent from "../models/UserConsent.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import UserSession from "../models/UserSession.js";

const TERMS_POLICY_VERSION = "v1";
const PRIVACY_POLICY_VERSION = "v1";

export const registerCustomer = async (req, res) => {
  const { uid, mobile } = req.firebaseUser;

  console.log("firebase uid:", uid);
  console.log("firebase mobile", mobile);

  const { name, email, acceptedTerms, acceptedPrivacy } = req.body;

  // Validate customer-provided details.
  const fields = {};

  if (typeof name !== "string" || name.trim().length < 2) {
    fields.name = "Enter your full name.";
  }

  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    fields.email = "Enter a valid email address.";
  }

  if (acceptedTerms !== true) {
    fields.acceptedTerms = "You must accept the Terms of Use.";
  }

  if (acceptedPrivacy !== true) {
    fields.acceptedPrivacy = "You must acknowledge the Privacy Policy.";
  }

  if (Object.keys(fields).length > 0) {
    return sendError(res, {
      statusCode: 422,
      code: "VALIDATION_ERROR",
      message: "Please correct the registration details.",
      fields,
    });
  }

  const accessSecret = process.env.JWT_ACCESS_SECRET;

  if (!accessSecret) {
    return sendError(res, {
      statusCode: 500,
      code: "AUTH_CONFIGURATION_ERROR",
      message: "Authentication is not configured.",
    });
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  const session = await mongoose.startSession();

  try {
    let registeredUser;
    let accessToken;

    const refreshToken = randomBytes(48).toString("hex");

    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await session.withTransaction(async () => {
      // Check whether this Firebase identity or mobile already exists.
      const existingUser = await User.findOne({
        $or: [{ firebase_uid: uid }, { mobile }],
      }).session(session);

      if (existingUser) {
        const error = new Error("An account may already exist.");
        error.code = "ACCOUNT_ALREADY_EXISTS";
        throw error;
      }

      //   if (existingUser) {
      //     console.log("Existing user found:", {
      //       userId: existingUser._id.toString(),
      //       firebase_uid: existingUser.firebase_uid,
      //       mobile: existingUser.mobile,
      //       user_type: existingUser.user_type,
      //     });
      //   }
      //   console.log(existingUser.firebase_uid)
      //   console.log(existingUser.mobile)

      // Find the pre-seeded CUSTOMER role.
      const customerRole = await Role.findOne({
        role_name: "CUSTOMER",
      }).session(session);

      if (!customerRole) {
        const error = new Error("Customer role is not configured.");
        error.code = "CUSTOMER_ROLE_NOT_CONFIGURED";
        throw error;
      }

      // Create the user using Firebase's verified identity.
      const [user] = await User.create(
        [
          {
            name: normalizedName,
            email: normalizedEmail,
            mobile,
            firebase_uid: uid,
            role_id: customerRole._id,
            user_type: "CUSTOMER",
            mobile_verified: true,
            email_verified: false,
            is_active: true,
          },
        ],
        { session },
      );

      //   console.log("user : ", user)

      // Create the associated customer profile.
      await CustomerProfile.create(
        [
          {
            userId: user._id,
          },
        ],
        { session },
      );

      // Record the customer's explicit policy acknowledgements.
      await UserConsent.create(
        [
          {
            user_id: user._id,
            consent_type: "TERMS",
            policy_version: TERMS_POLICY_VERSION,
            accepted_at: new Date(),
            source: "WEB",
          },
          {
            user_id: user._id,
            consent_type: "PRIVACY",
            policy_version: PRIVACY_POLICY_VERSION,
            accepted_at: new Date(),
            source: "WEB",
          },
        ],
        {
          session,
          ordered: true,
        },
      );

      const [userSession] = await UserSession.create(
        [
          {
            user_id: user._id,
            refresh_token_hash: refreshTokenHash,
            device_name:
              typeof req.body?.deviceName === "string"
                ? req.body.deviceName.trim().slice(0, 100)
                : "Web Browser",
            platform: "WEB",
            expires_at: refreshExpiresAt,
            last_used_at: new Date(),
          },
        ],
        { session },
      );

      accessToken = jwt.sign(
        {
          _id: user._id.toString(),
          role: "CUSTOMER",
          sessionId: userSession._id.toString(),
        },
        accessSecret,
        { expiresIn: "2d" },
      );

      registeredUser = {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: "CUSTOMER",
      };
    });

    res.cookie("kaamdaar_refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: "Customer registered successfully.",
      data: {
        accessToken,
        tokenType: "Bearer",
        expiresIn: 900,
        customer: registeredUser,
        next_step: "ADD_ADDRESS_OR_HOME",
      },
    });
  } catch (error) {
    console.error("Customer registration error details:");
    console.error("Name:", error.name);
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("Stack:", error.stack);

    if (error.code === "ACCOUNT_ALREADY_EXISTS" || error.code === 11000) {
      return sendError(res, {
        statusCode: 409,
        code: "ACCOUNT_ALREADY_EXISTS",
        message:
          "An account may already exist for these details. Please continue with login.",
      });
    }

    if (error.code === "CUSTOMER_ROLE_NOT_CONFIGURED") {
      return sendError(res, {
        statusCode: 500,
        code: "CUSTOMER_ROLE_NOT_CONFIGURED",
        message: "Customer registration is not configured.",
      });
    }

    console.error("Customer registration failed:", error.code || error.name);

    return sendError(res, {
      statusCode: 500,
      code: "REGISTRATION_FAILED",
      message: "Unable to complete registration. Please try again.",
    });
  } finally {
    await session.endSession();
  }
};

export const getCustomerProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    const customer = await User.findOne({ _id: userId, user_type: "CUSTOMER" })
      .select(
        "name email mobile user_type mobile_verified email_verified is_active createdAt",
      )
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "customer profile not found",
      });
    }

    const profile = await CustomerProfile.findOne({ userId: customer._id });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Customer profile fetched successfully.",
      data: {
        customer,
        profile: profile || {},
      },
    });
  } catch (error) {
    console.error("Get customer profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer profile",
    });
  }
};

export const updateCustomerProfile = async (req, res) => {
  try {
    const userId = req.user?.id;

    const {
      name,
      email,
      mobile,
      user_type,
      role_id,
      dateOfBirth,
      gender,
      preferences,
      loyaltyPoints,
      totalBookings,
      totalSpent,
      isBlocked,
    } = req.body;

    // Fields that customers are not allowed to change.
    if (
      email !== undefined ||
      mobile !== undefined ||
      user_type !== undefined ||
      role_id !== undefined ||
      loyaltyPoints !== undefined ||
      totalBookings !== undefined ||
      totalSpent !== undefined ||
      isBlocked !== undefined
    ) {
      return sendError(res, {
        statusCode: 400,
        code: "FIELDS_NOT_ALLOWED",
        message:
          "Email, mobile number, account role, and system-managed fields cannot be updated.",
      });
    }

    // Validate the name if provided.
    if (
      name !== undefined &&
      (typeof name !== "string" || name.trim().length < 2)
    ) {
      return sendError(res, {
        statusCode: 422,
        code: "INVALID_NAME",
        message: "Name must contain at least 2 characters.",
      });
    }

    // Validate gender if provided.
    // Adjust these values to match your actual schema enum.
    if (gender !== undefined && !["MALE", "FEMALE", "OTHER"].includes(gender)) {
      return sendError(res, {
        statusCode: 422,
        code: "INVALID_GENDER",
        message: "Please provide a valid gender.",
      });
    }

    // Validate preferences if provided.
    if (
      preferences !== undefined &&
      (preferences === null ||
        typeof preferences !== "object" ||
        Array.isArray(preferences))
    ) {
      return sendError(res, {
        statusCode: 422,
        code: "INVALID_PREFERENCES",
        message: "Preferences must be an object.",
      });
    }

    // Build an allowlisted update object.
    const userUpdates = {};

    if (name !== undefined) {
      userUpdates.name = name.trim();
    }

    const profileUpdates = {};

    if (dateOfBirth !== undefined) {
      if (dateOfBirth === null || dateOfBirth === "") {
        profileUpdates.dateOfBirth = null;
      } else {
        const parsedDate = new Date(dateOfBirth);

        if (Number.isNaN(parsedDate.getTime())) {
          return sendError(res, {
            statusCode: 422,
            code: "INVALID_DATE_OF_BIRTH",
            message: "Please provide a valid date of birth.",
          });
        }

        if (parsedDate > new Date()) {
          return sendError(res, {
            statusCode: 422,
            code: "INVALID_DATE_OF_BIRTH",
            message: "Date of birth cannot be in the future.",
          });
        }

        profileUpdates.dateOfBirth = parsedDate;
      }
    }

    if (gender !== undefined) {
      profileUpdates.gender = gender;
    }

    // Only permit the known preference fields.
    if (preferences !== undefined) {
      const allowedPreferenceKeys = ["notificationsEnabled", "language"];

      const invalidKeys = Object.keys(preferences).filter(
        (key) => !allowedPreferenceKeys.includes(key),
      );

      if (invalidKeys.length > 0) {
        return sendError(res, {
          statusCode: 400,
          code: "INVALID_PREFERENCE_FIELDS",
          message: "One or more preference fields cannot be updated.",
        });
      }

      for (const [key, value] of Object.entries(preferences)) {
        if (key === "notificationsEnabled" && typeof value !== "boolean") {
          return sendError(res, {
            statusCode: 422,
            code: "INVALID_PREFERENCES",
            message: "notificationsEnabled must be true or false.",
          });
        }

        if (
          key === "language" &&
          (typeof value !== "string" || value.trim().length === 0)
        ) {
          return sendError(res, {
            statusCode: 422,
            code: "INVALID_PREFERENCES",
            message: "language must be a non-empty string.",
          });
        }

        profileUpdates[`preferences.${key}`] =
          key === "language" ? value.trim() : value;
      }
    }

    if (
      Object.keys(userUpdates).length === 0 &&
      Object.keys(profileUpdates).length === 0
    ) {
      return sendError(res, {
        statusCode: 400,
        code: "NO_VALID_FIELDS",
        message: "Please provide at least one editable field.",
      });
    }

    // Confirm that the authenticated user is a customer.
    const customer = await User.findOne({
      _id: userId,
      user_type: "CUSTOMER",
      is_active: true,
    });

    if (!customer) {
      return sendError(res, {
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found or account is inactive.",
      });
    }

    // Update the user's editable details.
    if (Object.keys(userUpdates).length > 0) {
      await User.updateOne(
        { _id: userId, user_type: "CUSTOMER" },
        { $set: userUpdates },
        { runValidators: true },
      );
    }

    // Update the customer's additional profile details.
    if (Object.keys(profileUpdates).length > 0) {
      const updatedProfile = await CustomerProfile.findOneAndUpdate(
        { userId },
        { $set: profileUpdates },
        {
          new: true,
          runValidators: true,
        },
      );

      if (!updatedProfile) {
        return sendError(res, {
          statusCode: 404,
          code: "CUSTOMER_PROFILE_NOT_FOUND",
          message: "Customer profile record not found.",
        });
      }
    }

    // Fetch the latest data for the response.
    const updatedCustomer = await User.findById(userId)
      .select(
        "name email mobile user_type mobile_verified email_verified is_active createdAt",
      )
      .lean();

    const updatedCustomerProfile = await CustomerProfile.findOne({
      userId,
    }).lean();

    return sendSuccess(res, {
      statusCode: 200,
      message: "Customer profile updated successfully.",
      data: {
        customer: updatedCustomer,
        profile: updatedCustomerProfile || {},
      },
    });
  } catch (error) {
    console.error("update customer profile error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update customer profile",
    });
  }
};

export const logoutCustomer = async (req, res) => {
  try {
    const userId = req.user?.id;
    const sessionId = req.user?.sessionId;

    // Validate the authenticated customer ID.
    if (typeof userId !== "string" || !/^[0-9a-fA-F]{24}$/.test(userId)) {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_CUSTOMER_ID",
        message: "Invalid customer ID.",
      });
    }

    // Validate the session ID from the verified access token.
    if (typeof sessionId !== "string" || !/^[0-9a-fA-F]{24}$/.test(sessionId)) {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_SESSION_ID",
        message: "Invalid session ID.",
      });
    }

    // Delete only the current customer's current session.
    const deletedSession = await UserSession.deleteOne({
      _id: sessionId,
      user_id: userId,
    });

    // Clear the refresh-token cookie.
    res.clearCookie("kaamdaar_refresh", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
    });

    if (deletedSession.deletedCount === 0) {
      return sendSuccess(res, {
        statusCode: 200,
        message: "Customer is already logged out.",
        data: null,
      });
    }

    return sendSuccess(res, {
      statusCode: 200,
      message: "Customer logged out successfully.",
      data: null,
    });
  } catch (error) {
    console.error("log out customer profile error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to logout customer profile",
    });
  }
};
