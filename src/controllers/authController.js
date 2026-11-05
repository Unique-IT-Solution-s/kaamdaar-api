import mongoose from "mongoose";
import axios from "axios";
import "dotenv/config";

import User from "../models/User.js";
import Role from "../models/Role.js";
import CustomerProfile from "../models/CustomerProfile.js";
import UserSession from "../models/UserSession.js";
import CustomerAddress from "../models/CustomerAddress.js";

import { adminAuth } from "../config/firebaseAdmin.js";

import {
  createUserSession,
  rotateRefreshToken,
} from "../services/authSession.service.js";

// ==================================================
// CONSTANTS
// ==================================================

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

const ALLOWED_PLATFORMS = ["WEB", "ANDROID", "IOS"];

const REFRESH_COOKIE_NAME = "kaamdaar_refresh_token";

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
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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
        message: "Please provide a valid 10-digit Indian mobile number only.",
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

    // console.log("response of firebse", response);

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

export const verifyOtpController = async (req, res) => {
  try {
    // ------------------------------------------------
    // 1. NORMALIZE AND VALIDATE PHONE NUMBER
    // ------------------------------------------------

    let phone = String(req.body.phone || "")
      .trim()
      .replace(/\D/g, "");

    console.log("phone", phone);

    // Normalize Indian country code.
    if (phone.length === 12 && phone.startsWith("91")) {
      phone = phone.slice(2);
    }
    if (phone.length === 11 && phone.startsWith("0")) {
      phone = phone.slice(1);
    }

    const { sessionInfo, code } = req.body;

    const errors = {};

    if (!phone) {
      errors.phone = "Mobile number is required.";
    } else if (!/^[6-9]\d{9}$/.test(phone)) {
      errors.phone = "Please provide a valid 10-digit Indian mobile number.";
    }

    if (typeof sessionInfo !== "string" || !sessionInfo.trim()) {
      errors.sessionInfo = "Session information is required.";
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
        message: "Firebase API key configuration is missing.",
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
        },
      );

      firebaseResult = response.data;
      // console.log("firebaseResult", firebaseResult);
    } catch (firebaseError) {
      const firebaseErrorMessage = firebaseError.response?.data?.error?.message;

      console.error(
        "Firebase OTP Verification Error:",
        firebaseErrorMessage || firebaseError.message,
      );

      return res.status(400).json({
        status: false,
        message: "OTP Verification Failed",
        error: firebaseErrorMessage || "Invalid or expired OTP.",
      });
    }

    // ------------------------------------------------
    // 4. VERIFY FIREBASE PHONE NUMBER
    // ------------------------------------------------

    const firebasePhone = firebaseResult.phoneNumber;
    const formattedPhone = `+91${phone}`;
    // console.log("formatted phone", formattedPhone);

    if (firebasePhone !== formattedPhone) {
      return res.status(400).json({
        status: false,
        message: "Phone number mismatch with Firebase verification.",
      });
    }

    if (
      !firebaseResult?.idToken ||
      !firebaseResult?.localId ||
      !firebaseResult?.phoneNumber
    ) {
      return res.status(401).json({
        status: false,
        message: "Firebase authentication failed.",
      });
    }

    // Verify Firebase identity token.
    const decodedToken = await adminAuth.verifyIdToken(firebaseResult.idToken);

    // console.log("decoded token", decodedToken);

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

    // 5. FIND OR CREATE USER
    // ------------------------------------------------

    const firebaseUid = decodedToken.uid;

    let user = await User.findOne({
      mobile: formattedPhone,
    });

    let customerProfile = null;
    let isNewUser = false;

    // ------------------------------------------------
    // 6. CHECK FIREBASE UID ALREADY LINKED
    // ------------------------------------------------

    const firebaseUidUser = await User.findOne({
      firebase_uid: firebaseUid,
    });

    if (firebaseUidUser && firebaseUidUser.mobile !== formattedPhone) {
      return res.status(409).json({
        status: false,
        message: "Firebase account is already linked to another user.",
      });
    }

    // ------------------------------------------------
    // 7. EXISTING USER LOGIN
    // ------------------------------------------------

    if (user) {
      // Only customer login is allowed through this endpoint.
      if (user.user_type !== "CUSTOMER") {
        return res.status(403).json({
          status: false,
          message: "This account cannot log in as a customer.",
        });
      }

      // Check user account status.
      if (user.account_status !== "ACTIVE") {
        return res.status(403).json({
          status: false,
          message: "Your account is unavailable. Please contact support.",
        });
      }

      // Check existing Firebase UID.
      if (user.firebase_uid && user.firebase_uid !== firebaseUid) {
        return res.status(409).json({
          status: false,
          message: "This mobile number is linked to another Firebase account.",
        });
      }

      // Find customer profile.
      customerProfile = await CustomerProfile.findOne({
        userId: user._id,
      });

      // Create missing profile if necessary.
      if (!customerProfile) {
        customerProfile = await CustomerProfile.findOneAndUpdate(
          { userId: user._id },
          {
            $setOnInsert: {
              userId: user._id,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          },
        );
      }

      // Check customer-specific blocking.
      if (customerProfile.isBlocked) {
        return res.status(403).json({
          status: false,
          message: "Your customer account is blocked.",
        });
      }

      // Link Firebase UID if not already linked.
      if (!user.firebase_uid) {
        user.firebase_uid = firebaseUid;
      }

      user.mobile_verified = true;
      user.last_login_at = new Date();

      await user.save();
    }

    // ------------------------------------------------
    // 8. NEW CUSTOMER REGISTRATION
    // ------------------------------------------------
    else {
      // Firebase UID should not already belong to another user.
      if (firebaseUidUser) {
        return res.status(409).json({
          status: false,
          message: "Firebase account is already registered.",
        });
      }

      // Find CUSTOMER role.
      const customerRole = await Role.findOne({
        role_name: "CUSTOMER",
      });

      if (!customerRole) {
        return res.status(500).json({
          status: false,
          message: "Customer role is not configured.",
        });
      }

      // User and CustomerProfile must be created together.
      const mongoSession = await mongoose.startSession();

      try {
        await mongoSession.withTransaction(async () => {
          const createdUsers = await User.create(
            [
              {
                mobile: formattedPhone,
                firebase_uid: firebaseUid,
                role_id: customerRole._id,
                user_type: "CUSTOMER",
                mobile_verified: true,
                account_status: "ACTIVE",
                profile_completed: false,
                last_login_at: new Date(),
              },
            ],
            {
              session: mongoSession,
            },
          );

          user = createdUsers[0];

          const createdProfiles = await CustomerProfile.create(
            [
              {
                userId: user._id,
                isBlocked: false,
              },
            ],
            {
              session: mongoSession,
            },
          );

          customerProfile = createdProfiles[0];
        });

        isNewUser = true;
      } finally {
        await mongoSession.endSession();
      }
    }

    // ------------------------------------------------
    // 9. CREATE USER SESSION
    // ------------------------------------------------

    const deviceId = req.body.device_id || req.body.deviceId || null;

    const deviceName = req.body.deviceName || "Web Browser";
    const platform = req.body?.platform || "WEB";

    const allowedPlatforms = ["WEB", "ANDROID", "IOS"];

    if (!allowedPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid platform.",
      });
    }

    const sessionData = await createUserSession({
      user,
      platform,
      deviceId,
      deviceName,
    });

    // console.log("session data", sessionData);

    // ------------------------------------------------
    // 10. FETCH CUSTOMER ADDRESSES
    // ------------------------------------------------

    const addresses = await CustomerAddress.find({
      customer_id: customerProfile._id,
    })
      .populate("city_id")
      .sort({
        is_default: -1,
        created_at: -1,
      })
      .lean();

    const defaultAddress =
      addresses.find((address) => address.is_default) || null;

    const nextStep = isNewUser ? "PROFILE_REQUIRED" : "HOME";

    // ------------------------------------------------
    // 11. SET REFRESH TOKEN COOKIE
    // ------------------------------------------------

    res.cookie("kaamdaar_refresh_token", sessionData.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/api/v1/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    // ------------------------------------------------
    // 12. SUCCESS RESPONSE
    // ------------------------------------------------

    return res.status(isNewUser ? 201 : 200).json({
      status: true,

      message: isNewUser
        ? "Customer registered and verified successfully."
        : "Login successful.",

      data: {
        isNewUser,

        next_step: nextStep,

        user: {
          id: user._id,
          name: user.name,
          mobile: user.mobile,
          email: user.email,
          role: user.user_type,
          profile_image: user.profile_image,
          profile_completed: user.profile_completed,
          mobile_verified: user.mobile_verified,
        },

        customerProfile: {
          totalBookings: customerProfile.totalBookings,
          totalSpent: customerProfile.totalSpent,
          loyaltyPoints: customerProfile.loyaltyPoints,
          dateOfBirth: customerProfile.dateOfBirth,
          gender: customerProfile.gender,
          preferences: customerProfile.preferences,
          isBlocked: customerProfile.isBlocked,
        },

        addresses,
        defaultAddress,

        accessToken: sessionData.accessToken,

        session: {
          sessionId: sessionData.sessionId,
          expiresAt: sessionData.expiresAt,
        },
      },
    });
  } catch (error) {
    console.error("Verify OTP Server Error:", error.message);

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
    // 1. Validate platform before rotating tokens
    const platform = req.body?.platform;

    const allowedPlatforms = ["WEB", "ANDROID", "IOS", "OTHER"];

    if (!allowedPlatforms.includes(platform)) {
      return sendErrorResponse(
        res,
        400,
        "Invalid platform.",
        "INVALID_PLATFORM",
      );
    }

    // 2. Extract refresh token according to the platform
    const refreshToken =
      platform === "WEB"
        ? req.cookies?.[REFRESH_COOKIE_NAME]
        : req.body?.refreshToken;

    console.log("refresh token", refreshToken);

    if (typeof refreshToken !== "string" || !refreshToken.trim()) {
      return sendErrorResponse(
        res,
        401,
        "Refresh token is missing. Please log in again.",
        "REFRESH_TOKEN_REQUIRED",
      );
    }

    // 3. Rotate refresh token and generate new access token
    const tokens = await rotateRefreshToken(refreshToken.trim(), platform);

    // 4. WEB: store new refresh token in HttpOnly cookie
    if (platform === "WEB") {
      setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    }

    // 5. Return response
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
    // 6. Handle authentication-related errors
    const authenticationErrors = [
      "Invalid refresh token.",
      "Invalid or expired session.",
      "User account is unavailable.",
      "Refresh token has already been used or revoked.",
    ];

    if (authenticationErrors.includes(error.message)) {
      console.warn("Refresh authentication failed.");

      return sendErrorResponse(
        res,
        401,
        "Session expired. Please log in again.",
        "REFRESH_FAILED",
      );
    }

    // 7. Unexpected server error
    console.error("Refresh token internal error:", error);

    return sendErrorResponse(
      res,
      500,
      "Unable to refresh session. Please try again.",
      "INTERNAL_SERVER_ERROR",
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
          is_online: false,
        },
      },
      { returnDocument: "after" },
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

    const now = new Date();

    const result = await UserSession.updateMany(
      {
        user_id: userId,
        revoked_at: null,
      },
      {
        $set: {
          revoked_at: now,
          revoke_reason: "LOGOUT_ALL",
          is_online: false,
        },
      },
    );

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "All sessions logged out successfully.",
      data: {
        sessionsRevoked: result.modifiedCount,
      },
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
    console.log("authenticate user ", authenticatedUser)

    if (!authenticatedUser) {
      return sendErrorResponse(
        res,
        401,
        "Authentication required.",
        "UNAUTHENTICATED",
      );
    }

    const userId = authenticatedUser._id || authenticatedUser.userId;
    // console.log("userId", userId.toString())

    if (!isValidObjectId(userId.toString())) {
      return sendErrorResponse(
        res,
        401,
        "Invalid authenticated user.",
        "INVALID_USER",
      );
    }

    // Customer-specific data
    let customerProfile = null;
    let defaultAddress = null;

    if (authenticatedUser.user_type === "CUSTOMER") {
      customerProfile = await CustomerProfile.findOne({
        userId,
      }).lean();

      if (customerProfile) {
        defaultAddress = await CustomerAddress.findOne({
          customer_id: customerProfile._id,
          is_default: true,
        })
          .select(
            "label address_line1 address_line2 landmark city_id postal_code latitude longitude",
          )
          .lean();
      }
    }

    return res.status(200).json({
      success: true,
      message: "User details fetched successfully.",
      data: {
        user: {
          id: authenticatedUser._id.toString(),
          name: authenticatedUser.name,
          mobile: authenticatedUser.mobile,
          email: authenticatedUser.email ?? null,
          user_type: authenticatedUser.user_type,
          mobile_verified: authenticatedUser.mobile_verified,
          email_verified: authenticatedUser.email_verified,
          profile_completed: authenticatedUser.profile_completed,
          profile_image: authenticatedUser.profile_image,
          language: authenticatedUser.language,
          account_status: authenticatedUser.account_status,
          createdAt: authenticatedUser.createdAt,
        },

        profile: customerProfile
          ? {
              dateOfBirth: customerProfile.dateOfBirth,
              gender: customerProfile.gender,
              isBlocked: customerProfile.isBlocked,
              preferences: customerProfile.preferences,
              created_at: customerProfile.created_at,
              updated_at: customerProfile.updated_at,
            }
          : null,

        statistics: customerProfile
          ? {
              totalBookings: customerProfile.totalBookings,
              totalSpent: customerProfile.totalSpent,
              loyaltyPoints: customerProfile.loyaltyPoints,
            }
          : null,

        defaultAddress: defaultAddress
          ? {
              id: defaultAddress._id,
              label: defaultAddress.label,
              address_line1: defaultAddress.address_line1,
              address_line2: defaultAddress.address_line2,
              landmark: defaultAddress.landmark,
              city_id: defaultAddress.city_id,
              postal_code: defaultAddress.postal_code,
              latitude: defaultAddress.latitude,
              longitude: defaultAddress.longitude,
            }
          : null,
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

export const updateProfileController = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!isValidObjectId(userId))
      return sendErrorResponse(
        res,
        401,
        "Authentication required.",
        "INVALID_AUTHENTICATION",
      );

    const { firstName, lastName, email } = req.body;
    if (!firstName || !lastName) {
      return sendErrorResponse(res, 401, "Enter firstname and lastname");
    }
    if (typeof firstName !== "string" || typeof lastName !== "string") {
      return sendErrorResponse(
        es,
        422,
        "First name and last name are required.",
        "NAME_REQUIRED",
      );
    }
    const trimedFirstName = firstName.trim();
    const trimedLastName = lastName.trim();

    if (trimedFirstName.length < 2 || trimedLastName.length < 2) {
      return sendErrorResponse(
        res,
        422,
        "First name and last name must contain at least 2 characters.",
        "INVALID_NAME",
      );
    }

    if (trimedFirstName.length > 50 || trimedLastName.length > 50) {
      return sendErrorResponse(
        res,
        422,
        "First name and last name cannot exceed 50 characters.",
        "NAME_TOO_LONG",
      );
    }

    // validate optinal email
    let normalizedEmail;
    if (email !== undefined || email !== null) {
      if (typeof email !== "string") {
        return sendErrorResponse(
          res,
          422,
          "Invalid email address.",
          "INVALID_EMAIL",
        );
      }
    }

    normalizedEmail = email.trim().toLowerCase();

    if (
      normalizedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      return sendErrorResponse(
        res,
        422,
        "Please provide a valid email address.",
        "INVALID_EMAIL",
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendErrorResponse(res, 404, "User not found.", "USER_NOT_FOUND");
    }

    // 5. Only customers can update through this endpoint
    if (user.user_type !== "CUSTOMER") {
      return sendErrorResponse(
        res,
        403,
        "This endpoint is only available for customers.",
        "NOT_CUSTOMER",
      );
    }

    //update profile fields
    user.name = `${firstName}${lastName}`;

    if (normalizedEmail !== undefined) {
      if (normalizedEmail) {
        user.email = normalizedEmail;
      } else {
        user.email = undefined;
      }
    }

    //update profile completed
    user.profile_completed = true;

    await user.save();

    // 8. Return updated profile
    return res.status(200).json({
      status: true,
      message: "Profile updated successfully.",
      data: {
        user: {
          id: user._id,
          name: user.name,
          mobile: user.mobile,
          email: user.email || null,
          role: user.user_type,
          profile_image: user.profile_image,
          profile_completed: user.profile_completed,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendErrorResponse(
        res,
        409,
        "This email address is already registered.",
        "EMAIL_ALREADY_EXISTS",
      );
    }

    console.error("update profile error:", error.message);
    return sendErrorResponse(
      res,
      500,
      "Unable to update authenticated user.",
      "PROFILE_UPDATE_FAILED",
    );
  }
};
