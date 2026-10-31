import mongoose from "mongoose";

import User from "../models/User.js";
import CustomerProfile from "../models/CustomerProfile.js";
import UserSession from "../models/UserSession.js";

import { sendSuccess, sendError } from "../utils/apiResponse.js";

// ==================================================
// HELPER FUNCTIONS
// ==================================================

const getUserId = (req) => {
  return req.user?.userId || req.user?.id || req.user?._id?.toString();
};

const getSessionId = (req) => {
  return req.user?.sessionId;
};

const isValidObjectId = (id) => {
  return typeof id === "string" && mongoose.isValidObjectId(id);
};

const getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/v1/auth",
});

// ==================================================
// 1. GET CUSTOMER PROFILE
// GET /api/v1/customer/profile
// ==================================================

export const getCustomerProfile = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!isValidObjectId(userId)) {
      return sendError(res, {
        statusCode: 401,
        code: "INVALID_AUTHENTICATION",
        message: "Invalid authentication. Please login again.",
      });
    }

    const customer = await User.findOne({
      _id: userId,
      user_type: "CUSTOMER",
      is_active: true,
    })
      .select(
        "name email mobile user_type mobile_verified email_verified is_active profile_completed profile_image language createdAt updatedAt"
      )
      .lean();

    if (!customer) {
      return sendError(res, {
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found or account is inactive.",
      });
    }

    const profile = await CustomerProfile.findOne({
      userId: customer._id,
    }).lean();

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

    return sendError(res, {
      statusCode: 500,
      code: "PROFILE_FETCH_FAILED",
      message: "Failed to fetch customer profile.",
    });
  }
};

// ==================================================
// 2. UPDATE CUSTOMER PROFILE
// PATCH /api/v1/customer/profile
// ==================================================

export const updateCustomerProfile = async (req, res) => {
  const userId = getUserId(req);

  if (!isValidObjectId(userId)) {
    return sendError(res, {
      statusCode: 401,
      code: "INVALID_AUTHENTICATION",
      message: "Invalid authentication. Please login again.",
    });
  }

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

  // ----------------------------------------------
  // Prevent modification of protected fields
  // ----------------------------------------------

  if (
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
        "Mobile number, role, and system-managed fields cannot be updated.",
    });
  }

  // ----------------------------------------------
  // Validate name
  // ----------------------------------------------

  if (
    name !== undefined &&
    (typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 100)
  ) {
    return sendError(res, {
      statusCode: 422,
      code: "INVALID_NAME",
      message: "Name must contain between 2 and 100 characters.",
    });
  }

  // ----------------------------------------------
  // Validate email
  // ----------------------------------------------

  if (email !== undefined && email !== null && email !== "") {
    if (
      typeof email !== "string" ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return sendError(res, {
        statusCode: 422,
        code: "INVALID_EMAIL",
        message: "Please provide a valid email address.",
      });
    }
  }

  // ----------------------------------------------
  // Validate gender
  // ----------------------------------------------

  if (
    gender !== undefined &&
    !["MALE", "FEMALE","PREFER_NOT_TO_SAY", "OTHER"].includes(gender)
  ) {
    return sendError(res, {
      statusCode: 422,
      code: "INVALID_GENDER",
      message: "Please provide a valid gender.",
    });
  }

  // ----------------------------------------------
  // Validate preferences
  // ----------------------------------------------

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

  // ----------------------------------------------
  // Prepare update objects
  // ----------------------------------------------

  const userUpdates = {};
  const profileUpdates = {};

  if (name !== undefined) {
    userUpdates.name = name.trim();
  }

  if (email !== undefined) {
    if (email === null || email.trim() === "") {
      userUpdates.email_verified = false;
    } else {
      userUpdates.email = email.trim().toLowerCase();
      userUpdates.email_verified = false;
    }
  }

  // ----------------------------------------------
  // Validate date of birth
  // ----------------------------------------------

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

  // ----------------------------------------------
  // Validate and update preferences
  // ----------------------------------------------

  if (preferences !== undefined) {
    const allowedPreferenceKeys = [
      "notificationsEnabled",
      "language",
    ];

    const invalidKeys = Object.keys(preferences).filter(
      (key) => !allowedPreferenceKeys.includes(key)
    );

    if (invalidKeys.length > 0) {
      return sendError(res, {
        statusCode: 400,
        code: "INVALID_PREFERENCE_FIELDS",
        message: "One or more preference fields are not allowed.",
      });
    }

    for (const [key, value] of Object.entries(preferences)) {
      if (
        key === "notificationsEnabled" &&
        typeof value !== "boolean"
      ) {
        return sendError(res, {
          statusCode: 422,
          code: "INVALID_PREFERENCES",
          message: "notificationsEnabled must be true or false.",
        });
      }

      if (
        key === "language" &&
        (typeof value !== "string" ||
          value.trim().length === 0 ||
          value.trim().length > 10)
      ) {
        return sendError(res, {
          statusCode: 422,
          code: "INVALID_PREFERENCES",
          message: "Please provide a valid language.",
        });
      }

      profileUpdates[`preferences.${key}`] =
        key === "language" ? value.trim() : value;
    }
  }

  // ----------------------------------------------
  // Check whether anything needs to be updated
  // ----------------------------------------------

  if (
    Object.keys(userUpdates).length === 0 &&
    Object.keys(profileUpdates).length === 0 &&
    !(email === null || email === "")
  ) {
    return sendError(res, {
      statusCode: 400,
      code: "NO_VALID_FIELDS",
      message: "Please provide at least one field to update.",
    });
  }

  // ----------------------------------------------
  // Update User and CustomerProfile transactionally
  // ----------------------------------------------

  const mongoSession = await mongoose.startSession();

  try {
    let updatedCustomer;
    let updatedProfile;

    await mongoSession.withTransaction(async () => {
      const customer = await User.findOne({
        _id: userId,
        user_type: "CUSTOMER",
        is_active: true,
      }).session(mongoSession);

      if (!customer) {
        const error = new Error("Customer not found or inactive.");
        error.code = "CUSTOMER_NOT_FOUND";
        throw error;
      }

      const existingProfile = await CustomerProfile.findOne({
        userId: customer._id,
      }).session(mongoSession);

      if (!existingProfile) {
        const error = new Error("Customer profile record not found.");
        error.code = "CUSTOMER_PROFILE_NOT_FOUND";
        throw error;
      }

      // Update User
      const userUpdateQuery = {};

      if (Object.keys(userUpdates).length > 0) {
        userUpdateQuery.$set = userUpdates;
      }

      if (email === null || email === "") {
        userUpdateQuery.$unset = {
          email: 1,
        };
      }

      if (Object.keys(userUpdateQuery).length > 0) {
        await User.updateOne(
          {
            _id: userId,
            user_type: "CUSTOMER",
          },
          userUpdateQuery,
          {
            session: mongoSession,
            runValidators: true,
          }
        );
      }

      // Update CustomerProfile
      if (Object.keys(profileUpdates).length > 0) {
        await CustomerProfile.updateOne(
          {
            userId: customer._id,
          },
          {
            $set: profileUpdates,
          },
          {
            session: mongoSession,
            runValidators: true,
          }
        );
      }

      // Fetch updated data
      updatedCustomer = await User.findById(userId)
        .select(
          "name email mobile user_type mobile_verified email_verified is_active profile_completed profile_image language createdAt updatedAt"
        )
        .session(mongoSession)
        .lean();

      updatedProfile = await CustomerProfile.findOne({
        userId: customer._id,
      })
        .session(mongoSession)
        .lean();
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Customer profile updated successfully.",
      data: {
        customer: updatedCustomer,
        profile: updatedProfile || {},
      },
    });
  } catch (error) {
    console.error("Update customer profile error:", error);

    if (error.code === "CUSTOMER_NOT_FOUND") {
      return sendError(res, {
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
        message: error.message,
      });
    }

    if (error.code === "CUSTOMER_PROFILE_NOT_FOUND") {
      return sendError(res, {
        statusCode: 404,
        code: "CUSTOMER_PROFILE_NOT_FOUND",
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return sendError(res, {
        statusCode: 409,
        code: "DUPLICATE_EMAIL",
        message: "This email address is already registered.",
      });
    }

    if (
      error.name === "ValidationError" ||
      error.name === "CastError"
    ) {
      return sendError(res, {
        statusCode: 422,
        code: "PROFILE_VALIDATION_FAILED",
        message: "One or more profile fields are invalid.",
      });
    }

    return sendError(res, {
      statusCode: 500,
      code: "PROFILE_UPDATE_FAILED",
      message: "Failed to update customer profile.",
    });
  } finally {
    await mongoSession.endSession();
  }
};

// ==================================================
// 3. LOGOUT CUSTOMER
// POST /api/v1/auth/logout
// ==================================================

export const logoutCustomer = async (req, res) => {
  try {
    const userId = getUserId(req);
    const sessionId = getSessionId(req);

    if (!isValidObjectId(userId)) {
      return sendError(res, {
        statusCode: 401,
        code: "INVALID_CUSTOMER_ID",
        message: "Invalid customer authentication.",
      });
    }

    if (!isValidObjectId(sessionId)) {
      return sendError(res, {
        statusCode: 401,
        code: "INVALID_SESSION_ID",
        message: "Invalid session information.",
      });
    }

    const revokedSession = await UserSession.findOneAndUpdate(
      {
        _id: sessionId,
        user_id: userId,
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

    res.clearCookie(
      "kaamdaar_refresh",
      getRefreshCookieOptions()
    );

    return sendSuccess(res, {
      statusCode: 200,
      message: revokedSession
        ? "Customer logged out successfully."
        : "Customer is already logged out.",
      data: null,
    });
  } catch (error) {
    console.error("Customer logout error:", error);

    return sendError(res, {
      statusCode: 500,
      code: "LOGOUT_FAILED",
      message: "Failed to log out. Please try again.",
    });
  }
};