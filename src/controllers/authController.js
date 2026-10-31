import mongoose from "mongoose";
import crypto from "node:crypto";
import axios from "axios";

import FcmToken from "../models/FcmToken.js";

import {
  sendFirebaseOtp,
  verifyFirebaseOtp,
} from "../services/firebaseOtp.services.js";

import OtpChallenge from "../models/OtpChallenge.js";
import User from "../models/User.js";
import CustomerProfile from "../models/CustomerProfile.js";
import UserSession from "../models/UserSession.js";

import { adminAuth } from "../config/firebaseAdmin.js";
import { getRoleByName } from "../services/role.service.js";

import {
  createUserSession,
  revokeUserSession,
  rotateRefreshToken,
} from "../services/authSession.service.js";

// ==================================================
// CONSTANTS
// ==================================================

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

const ALLOWED_PLATFORMS = ["WEB", "ANDROID", "IOS"];

const REFRESH_COOKIE_NAME = "kaamdaar_refresh";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/v1/auth",
};

// ==================================================
// HELPER FUNCTIONS
// ==================================================

const getUserId = (req) =>
  req.user?.userId ||
  req.user?.id ||
  req.user?._id?.toString() ||
  req.user?.user?._id?.toString();

const getRefreshTokenFromRequest = (req) =>
  req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE_NAME];

const isValidObjectId = (id) =>
  typeof id === "string" && mongoose.isValidObjectId(id);

const sendErrorResponse = (res, statusCode, message, code) =>
  res.status(statusCode).json({
    success: false,
    code,
    message,
  });

const setRefreshCookie = (res, refreshToken, expiresAt) => {
  if (process.env.NODE_ENV === "production") {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      expires: expiresAt,
    });
  }
};

const clearRefreshCookie = (res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
};

// ==================================================
// 1. REQUEST OTP
// POST /api/v1/auth/otp/request
// ==================================================

// export const requestOtpController = async (req, res) => {
//   try {
//     const { mobile, recaptchaToken, platform } = req.body;

//     if (typeof mobile !== "string") {
//       return sendErrorResponse(
//         res,
//         400,
//         "Mobile number is required.",
//         "MOBILE_REQUIRED"
//       );
//     }

//     const normalizedMobile = mobile
//       .trim()
//       .replace(/[\s()-]/g, "");

//     if (!/^\+[1-9]\d{7,14}$/.test(normalizedMobile)) {
//       return sendErrorResponse(
//         res,
//         400,
//         "Enter a valid phone number with country code.",
//         "INVALID_MOBILE"
//       );
//     }

//  // if (
//     //   typeof recaptchaToken !== "string" ||
//     //   !recaptchaToken.trim()
//     // ) {
//     //   return sendErrorResponse(
//     //     res,
//     //     400,
//     //     "App verification is required.",
//     //     "APP_VERIFICATION_REQUIRED"
//     //   );
//     // }

//     const clientPlatform = platform || "WEB";

//     if (!ALLOWED_PLATFORMS.includes(clientPlatform)) {
//       return sendErrorResponse(
//         res,
//         400,
//         "Invalid platform.",
//         "INVALID_PLATFORM"
//       );
//     }

//     const firebaseResult = await sendFirebaseOtp({
//       phoneNumber: normalizedMobile,
//       recaptchaToken: recaptchaToken.trim(),
//     });

//     if (!firebaseResult?.sessionInfo) {
//       return sendErrorResponse(
//         res,
//         502,
//         "Firebase OTP session was not created.",
//         "FIREBASE_SESSION_FAILED"
//       );
//     }

//     const challengeId = crypto.randomUUID();

//     await OtpChallenge.create({
//       challenge_id: challengeId,
//       mobile: normalizedMobile,
//       session_info: firebaseResult.sessionInfo,
//       platform: clientPlatform,
//       attempts: 0,
//       expires_at: new Date(
//         Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
//       ),
//     });

//     return res.status(200).json({
//       success: true,
//       message: "OTP sent successfully.",
//       data: {
//         challengeId,
//         expiresIn: OTP_EXPIRY_MINUTES * 60,
//       },
//     });
//   } catch (error) {
//     console.error("Request OTP error:", error.message);

//     return sendErrorResponse(
//       res,
//       400,
//       "Unable to send OTP.",
//       "OTP_REQUEST_FAILED"
//     );
//   }
// };

export const requestOtpController = async (req, res) => {
  try {
    // 1. Normalize phone number
    const phone = String(req.body.phone || "")
      .replace(/\D/g, "")
      .slice(-10);

    // 2. Validate Indian mobile number
    const phoneRegex = /^[6-9]\d{9}$/;

    if (!phone) {
      return res.status(422).json({
        status: false,
        message: "Mobile number is required.",
      });
    }

    if (!phoneRegex.test(phone)) {
      return res.status(422).json({
        status: false,
        message: "Please provide a valid 10-digit Indian mobile number.",
      });
    }

    // 3. Prepare Firebase phone number
    const phoneNumber = `+91${phone}`;

    // 4. Get Firebase API Key
    const apiKey = process.env.FIREBASE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        status: false,
        message: "Firebase API key configuration is missing.",
      });
    }

    // 5. Send OTP through Firebase
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${apiKey}`,
      {
        phoneNumber,
      },
      {
        timeout: 15000,
      },
    );

    // 6. Return successful response
    return res.status(200).json({
      status: true,
      message: "OTP request processed successfully!",
      phone,
      sessionInfo: response.data.sessionInfo,
    });
  } catch (error) {
    // 7. Handle Firebase errors
    if (error.response) {
      return res.status(error.response.status || 400).json({
        status: false,
        message: "Firebase Auth Error",
        error: error.response.data?.error?.message || "Unknown error occurred.",
      });
    }

    // 8. Handle network/server errors
    return res.status(500).json({
      status: false,
      message: "Network/Server Error: " + error.message,
    });
  }
};

// ==================================================
// 2. VERIFY OTP
// POST /api/v1/auth/otp/verify
// ==================================================

// export const verifyOtpController = async (req, res) => {
//   let challengeId;

//   try {
//     const {
//       challengeId: requestedChallengeId,
//       otp,
//       deviceId,
//       deviceName,
//     } = req.body;

//     challengeId = requestedChallengeId;

//     if (
//       typeof challengeId !== "string" ||
//       !challengeId.trim() ||
//       typeof otp !== "string" ||
//       !/^\d{6}$/.test(otp.trim())
//     ) {
//       return sendErrorResponse(
//         res,
//         400,
//         "Valid challenge ID and six-digit OTP are required.",
//         "INVALID_OTP_REQUEST"
//       );
//     }

//     // Atomically reserve the challenge for one verification request.
//     // This prevents two simultaneous requests from using the same OTP.
//     const challenge = await OtpChallenge.findOneAndUpdate(
//       {
//         challenge_id: challengeId.trim(),
//         expires_at: { $gt: new Date() },
//         attempts: { $lt: MAX_OTP_ATTEMPTS },
//       },
//       {
//         $inc: { attempts: 1 },
//       },
//       {
//         new: true,
//       }
//     ).select("+session_info");

//     if (!challenge) {
//       return sendErrorResponse(
//         res,
//         400,
//         "OTP session expired, not found, or attempts exceeded.",
//         "OTP_SESSION_INVALID"
//       );
//     }

//     // Verify OTP through Firebase.
//     let firebaseResult;

//     try {
//       firebaseResult = await verifyFirebaseOtp({
//         sessionInfo: challenge.session_info,
//         code: otp.trim(),
//       });
//     } catch (firebaseError) {
//       console.error(
//         "Firebase OTP verification error:",
//         firebaseError.message
//       );

//       // Keep the challenge for remaining attempts.
//       if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
//         await OtpChallenge.deleteOne({
//           _id: challenge._id,
//         });
//       }

//       return sendErrorResponse(
//         res,
//         401,
//         "Invalid or expired OTP.",
//         "INVALID_OR_EXPIRED_OTP"
//       );
//     }

//     if (!firebaseResult?.idToken) {
//       await OtpChallenge.deleteOne({
//         _id: challenge._id,
//       });

//       return sendErrorResponse(
//         res,
//         401,
//         "Firebase identity token is missing.",
//         "FIREBASE_TOKEN_MISSING"
//       );
//     }

//     // Verify Firebase ID token.
//     const decodedToken = await adminAuth.verifyIdToken(
//       firebaseResult.idToken
//     );

//     const firebaseUid = decodedToken.uid;
//     const verifiedMobile = decodedToken.phone_number;

//     if (
//       !firebaseUid ||
//       !verifiedMobile ||
//       verifiedMobile !== challenge.mobile ||
//       firebaseResult.localId !== firebaseUid
//     ) {
//       await OtpChallenge.deleteOne({
//         _id: challenge._id,
//       });

//       return sendErrorResponse(
//         res,
//         401,
//         "Firebase identity verification failed.",
//         "FIREBASE_IDENTITY_MISMATCH"
//       );
//     }

//     // Successfully verified: challenge cannot be reused.
//     await OtpChallenge.deleteOne({
//       _id: challenge._id,
//     });

//     // Get CUSTOMER role.
//     const customerRole = await getRoleByName("CUSTOMER");

//     // Find user by mobile and Firebase UID separately.
//     const [userByMobile, userByFirebaseUid] =
//       await Promise.all([
//         User.findOne({ mobile: verifiedMobile }),
//         User.findOne({ firebase_uid: firebaseUid }),
//       ]);

//     // Detect identity collision.
//     if (
//       userByMobile &&
//       userByFirebaseUid &&
//       !userByMobile._id.equals(userByFirebaseUid._id)
//     ) {
//       return sendErrorResponse(
//         res,
//         409,
//         "Mobile number and Firebase account belong to different users.",
//         "ACCOUNT_IDENTITY_CONFLICT"
//       );
//     }

//     let user = userByMobile || userByFirebaseUid;
//     let isNewUser = false;

//     // ------------------------------------------------
//     // EXISTING CUSTOMER
//     // ------------------------------------------------

//     if (user) {
//       if (
//         user.mobile !== verifiedMobile ||
//         (user.firebase_uid &&
//           user.firebase_uid !== firebaseUid)
//       ) {
//         return sendErrorResponse(
//           res,
//           409,
//           "Account identity mismatch.",
//           "ACCOUNT_IDENTITY_MISMATCH"
//         );
//       }

//       if (!user.is_active) {
//         return sendErrorResponse(
//           res,
//           403,
//           "Your account is inactive.",
//           "ACCOUNT_INACTIVE"
//         );
//       }

//       if (
//         user.user_type !== "CUSTOMER" ||
//         !user.role_id.equals(customerRole._id)
//       ) {
//         return sendErrorResponse(
//           res,
//           403,
//           "This account is not a customer account.",
//           "NOT_CUSTOMER_ACCOUNT"
//         );
//       }

//       user.firebase_uid = firebaseUid;
//       user.mobile_verified = true;

//       await user.save();

//       // Ensure profile exists.
//       await CustomerProfile.updateOne(
//         { userId: user._id },
//         {
//           $setOnInsert: {
//             userId: user._id,
//           },
//         },
//         { upsert: true }
//       );
//     } else {
//       // ------------------------------------------------
//       // NEW CUSTOMER: CREATE USER + PROFILE
//       // ------------------------------------------------

//       const mongoSession = await mongoose.startSession();

//       try {
//         await mongoSession.withTransaction(async () => {
//           const createdUsers = await User.create(
//             [
//               {
//                 name: null,
//                 mobile: verifiedMobile,
//                 firebase_uid: firebaseUid,
//                 role_id: customerRole._id,
//                 user_type: "CUSTOMER",
//                 mobile_verified: true,
//                 email_verified: false,
//                 is_active: true,
//                 profile_completed: false,
//               },
//             ],
//             { session: mongoSession }
//           );

//           user = createdUsers[0];

//           await CustomerProfile.create(
//             [
//               {
//                 userId: user._id,
//               },
//             ],
//             { session: mongoSession }
//           );

//           isNewUser = true;
//         });
//       } catch (createError) {
//         if (createError.code !== 11000) {
//           throw createError;
//         }

//         // Concurrent request may have created the customer.
//         user = await User.findOne({
//           mobile: verifiedMobile,
//           firebase_uid: firebaseUid,
//           user_type: "CUSTOMER",
//           is_active: true,
//         });

//         if (!user || !user.role_id.equals(customerRole._id)) {
//           return sendErrorResponse(
//             res,
//             409,
//             "Account already exists or identity conflict detected.",
//             "ACCOUNT_CREATION_CONFLICT"
//           );
//         }

//         await CustomerProfile.updateOne(
//           { userId: user._id },
//           {
//             $setOnInsert: {
//               userId: user._id,
//             },
//           },
//           { upsert: true }
//         );

//         isNewUser = false;
//       } finally {
//         await mongoSession.endSession();
//       }
//     }

//     // ------------------------------------------------
//     // CREATE APPLICATION SESSION
//     // ------------------------------------------------

//     const sessionData = await createUserSession({
//       user,
//       platform: challenge.platform,
//       deviceId,
//       deviceName,
//     });

//     // Web: refresh token in HttpOnly cookie.
//     // Native app: refresh token returned for secure storage.
//     if (challenge.platform === "WEB") {
//       setRefreshCookie(
//         res,
//         sessionData.refreshToken,
//         sessionData.expiresAt
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       message: isNewUser
//         ? "Account created successfully. Complete your profile."
//         : "Login successful.",

//       data: {
//         isNewUser,

//         next_step: user.profile_completed
//           ? "HOME"
//           : "PROFILE_REQUIRED",

//         user: {
//           id: user._id,
//           name: user.name,
//           mobile: user.mobile,
//           email: user.email,
//           user_type: user.user_type,
//           mobile_verified: user.mobile_verified,
//           email_verified: user.email_verified,
//           profile_completed: user.profile_completed,
//         },

//         tokens: {
//           accessToken: sessionData.accessToken,

//           // Web clients should use the HttpOnly cookie.
//           // Flutter should store this token in secure storage.
//           ...(challenge.platform !== "WEB"
//             ? { refreshToken: sessionData.refreshToken }
//             : {}),

//           expiresIn: 900,
//           refreshExpiresAt: sessionData.expiresAt,
//         },
//       },
//     });
//   } catch (error) {
//     console.error(
//       "Verify OTP error:",
//       error.firebaseCode || error.message
//     );

//     if (error.code === 11000) {
//       return sendErrorResponse(
//         res,
//         409,
//         "Account already exists.",
//         "DUPLICATE_ACCOUNT"
//       );
//     }

//     return sendErrorResponse(
//       res,
//       500,
//       "OTP verification failed. Please try again.",
//       "OTP_VERIFICATION_FAILED"
//     );
//   }
// };

// Import your existing session and response helpers.
// import { createUserSession } from "../utils/session.js";
// import { sendErrorResponse } from "../utils/apiResponse.js";
// import { sendWelcomeCandidate } from "../services/mailService.js";

export const verifyOtpController = async (req, res) => {
  try {
    // ------------------------------------------------
    // 1. NORMALIZE AND VALIDATE PHONE NUMBER
    // ------------------------------------------------

    let phone = String(req.body.phone || "")
      .trim()
      .replace(/\D/g, "");

      console.log("phone", phone)

    // Normalize Indian country code.
    if (phone.length === 12 && phone.startsWith("91")) {
      phone = phone.slice(2);
    }

    const { sessionInfo, code } = req.body;

    const errors = {};

    if (!phone) {
      errors.phone = "Mobile number is required.";
    } else if (!/^[6-9]\d{9}$/.test(phone)) {
      errors.phone =
        "Please provide a valid 10-digit Indian mobile number.";
    }

    if (
      typeof sessionInfo !== "string" ||
      !sessionInfo.trim()
    ) {
      errors.sessionInfo =
        "Session information is required.";
    }

    if (!/^\d{6}$/.test(String(code ?? ""))) {
      errors.code = "OTP code must be 6 digits.";
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        status: false,
        message: Object.values(errors)[0],
        errors,
      });
    }

    // ------------------------------------------------
    // 2. FIREBASE API KEY
    // ------------------------------------------------

    const apiKey = process.env.FIREBASE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        status: false,
        message:
          "Firebase API key configuration is missing.",
      });
    }

    // ------------------------------------------------
    // 3. VERIFY OTP THROUGH FIREBASE REST API
    // ------------------------------------------------

    let firebaseResult;

    try {
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${apiKey}`,
        {
          sessionInfo: sessionInfo.trim(),
          code: String(code),
        },
        {
          timeout: 15000,
        }
      );

      firebaseResult = response.data;

    } catch (firebaseError) {
      const firebaseErrorMessage =
        firebaseError.response?.data?.error?.message;

      console.error(
        "Firebase OTP Verification Error:",
        firebaseErrorMessage || firebaseError.message
      );

      return res.status(400).json({
        status: false,
        message: "OTP Verification Failed",
        error:
          firebaseErrorMessage ||
          "Invalid or expired OTP.",
      });
    }

    // ------------------------------------------------
    // 4. VERIFY FIREBASE PHONE NUMBER
    // ------------------------------------------------

    const firebasePhone = firebaseResult.phoneNumber;
    const formattedPhone = `+91${phone}`;

    if (firebasePhone !== formattedPhone) {
      return res.status(400).json({
        status: false,
        message:
          "Phone number mismatch with Firebase verification.",
      });
    }

    // Verify Firebase identity token.
    const decodedToken = await adminAuth.verifyIdToken(
      firebaseResult.idToken
    );

    if (
      !decodedToken.uid ||
      decodedToken.uid !== firebaseResult.localId ||
      decodedToken.phone_number !== formattedPhone
    ) {
      return res.status(401).json({
        status: false,
        message: "Firebase identity verification failed.",
      });
    }

    // ------------------------------------------------
    // 5. FETCH OR CREATE USER
    // ------------------------------------------------

    // let user = await User.findOne({
    //   phone,
    // });

    // let isNewUser = false;

    // if (!user) {
    //   user = await User.create({
    //     phone,

    //     username: `user_${phone}`,

    //     firebase_uid: decodedToken.uid,

    //     is_profile_complete: false,

    //     app_is_online: true,
    //     app_last_active: new Date(),

    //     is_online: true,
    //     last_active: new Date(),
    //   });

    //   isNewUser = true;

    // } else {
    //   // Prevent linking a different Firebase identity.
    //   if (
    //     user.firebase_uid &&
    //     user.firebase_uid !== decodedToken.uid
    //   ) {
    //     return res.status(409).json({
    //       status: false,
    //       message:
    //         "Firebase account does not match this user.",
    //     });
    //   }

    //   user.firebase_uid = decodedToken.uid;

    //   user.app_is_online = true;
    //   user.app_last_active = new Date();

    //   user.is_online = true;
    //   user.last_active = new Date();

    //   await user.save();
    // }

    // // ------------------------------------------------
    // // 6. REGISTER OR UPDATE FCM TOKEN
    // // ------------------------------------------------

    // const fcmToken =
    //   req.body.fcm_token ||
    //   req.body.fcmToken;

    // const deviceId =
    //   req.body.device_id ||
    //   req.body.deviceId ||
    //   "app_device";

    // if (fcmToken) {
    //   try {
    //     await FcmToken.findOneAndUpdate(
    //       {
    //         user_id: user._id,
    //         guard: "api",
    //         device_id: deviceId,
    //       },
    //       {
    //         $set: {
    //           token: fcmToken,
    //           deleted_at: null,
    //         },
    //       },
    //       {
    //         upsert: true,
    //         new: true,
    //         setDefaultsOnInsert: true,
    //       }
    //     );

    //   } catch (fcmError) {
    //     console.warn(
    //       "FCM Token save failed during verifyOtp:",
    //       fcmError.message
    //     );
    //   }
    // }

    // // ------------------------------------------------
    // // 7. GENERATE AUTHENTICATION TOKEN
    // // ------------------------------------------------

    // // Node.js equivalent of Laravel Sanctum token.
    // const sessionData = await createUserSession({
    //   user,
    //   platform: "NATIVE",
    //   deviceId,
    //   deviceName: req.body.deviceName || "Mobile App",
    // });

    // const token = sessionData.accessToken;

    // // ------------------------------------------------
    // // 8. LOAD CANDIDATE RELATIONS
    // // ------------------------------------------------

    // user = await User.findById(user._id).populate([
    //   { path: "educations" },
    //   { path: "experiences" },
    //   { path: "resumes" },
    //   { path: "certificates" },
    // ]);

    // // ------------------------------------------------
    // // 9. SEND WELCOME EMAIL
    // // ------------------------------------------------

    // if (
    //   user.email &&
    //   user.is_profile_complete
    // ) {
    //   try {
    //     await sendWelcomeCandidate(user);

    //   } catch (mailError) {
    //     console.warn(
    //       "Welcome email failed:",
    //       mailError.message
    //     );
    //   }
    // }

    // // ------------------------------------------------
    // // 10. SUCCESS RESPONSE
    // // ------------------------------------------------

    return res.status(200).json({
      status: true,
      decodedToken

      // message: isNewUser
      //   ? "User registered and logged in successfully"
      //   : "Login successful",

      // is_new_user: isNewUser,

      // is_profile_complete: Boolean(
      //   user.is_profile_complete
      // ),

      // token,

      // user,
    });

  } catch (error) {
    console.error(
      "Verify OTP Server Error:",
      error.message
    );

    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message,
    });
  }
};

// ==================================================
// 3. REFRESH ACCESS TOKEN
// POST /api/v1/auth/token/refresh
// ==================================================

export const refreshTokenController = async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (typeof refreshToken !== "string" || !refreshToken.trim()) {
      return sendErrorResponse(
        res,
        400,
        "Refresh token is required.",
        "REFRESH_TOKEN_REQUIRED",
      );
    }

    const tokens = await rotateRefreshToken(refreshToken.trim());

    const platform = req.body?.platform;

    if (platform === "WEB") {
      setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    }

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully.",
      data: {
        accessToken: tokens.accessToken,

        ...(platform !== "WEB" ? { refreshToken: tokens.refreshToken } : {}),

        expiresIn: 900,
        refreshExpiresAt: tokens.expiresAt,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error.message);

    return sendErrorResponse(
      res,
      401,
      "Unable to refresh session. Please log in again.",
      "REFRESH_FAILED",
    );
  }
};

// ==================================================
// 4. LOGOUT
// POST /api/v1/auth/logout
// ==================================================

export const logoutController = async (req, res) => {
  try {
    const userId = getUserId(req);
    const sessionId = req.user?.sessionId;

    if (!isValidObjectId(userId) || !isValidObjectId(sessionId)) {
      return sendErrorResponse(
        res,
        401,
        "Invalid authentication session.",
        "INVALID_SESSION",
      );
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
      { new: true },
    );

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: revokedSession
        ? "Logged out successfully."
        : "Session is already logged out.",
    });
  } catch (error) {
    console.error("Logout error:", error.message);

    return sendErrorResponse(res, 500, "Logout failed.", "LOGOUT_FAILED");
  }
};

// ==================================================
// 5. LOGOUT ALL DEVICES
// POST /api/v1/auth/logout-all
// ==================================================

export const logoutAllController = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!isValidObjectId(userId)) {
      return sendErrorResponse(
        res,
        401,
        "Invalid authentication.",
        "INVALID_AUTHENTICATION",
      );
    }

    await UserSession.updateMany(
      {
        user_id: userId,
        revoked_at: null,
      },
      {
        $set: {
          revoked_at: new Date(),
          revoke_reason: "LOGOUT_ALL",
        },
      },
    );

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "All sessions logged out successfully.",
    });
  } catch (error) {
    console.error("Logout all error:", error.message);

    return sendErrorResponse(
      res,
      500,
      "Unable to log out all sessions.",
      "LOGOUT_ALL_FAILED",
    );
  }
};

// ==================================================
// 6. GET LOGGED-IN USER
// GET /api/v1/auth/me
// ==================================================

export const getMeController = async (req, res) => {
  try {
    const authenticatedUser = req.user?.user || req.user;

    if (!authenticatedUser) {
      return sendErrorResponse(
        res,
        401,
        "Authentication required.",
        "UNAUTHENTICATED",
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id:
            authenticatedUser._id ||
            authenticatedUser.userId ||
            authenticatedUser.id,

          name: authenticatedUser.name,
          mobile: authenticatedUser.mobile,
          email: authenticatedUser.email,
          user_type: authenticatedUser.user_type,
          mobile_verified: authenticatedUser.mobile_verified,
          email_verified: authenticatedUser.email_verified,
          profile_completed: authenticatedUser.profile_completed,
        },
      },
    });
  } catch (error) {
    console.error("Get me error:", error.message);

    return sendErrorResponse(
      res,
      500,
      "Unable to fetch authenticated user.",
      "GET_ME_FAILED",
    );
  }
};
