import jwt from "jsonwebtoken";

// ==================================================
// CONFIGURATION
// ==================================================

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET;

if (!ACCESS_TOKEN_SECRET) {
  throw new Error("JWT_ACCESS_SECRET is missing");
}

const JWT_ISSUER = "kaamdaar-api";
const JWT_AUDIENCE = "kaamdaar-app";
const ACCESS_TOKEN_EXPIRY = "15m";

// ==================================================
// 1. GENERATE ACCESS TOKEN
// ==================================================

export const generateAccessToken = (user, sessionId) => {
  if (!user?._id) {
    throw new Error("Valid user is required to generate access token.");
  }

  if (!sessionId) {
    throw new Error("Session ID is required to generate access token.");
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.user_type,
      sessionId: sessionId.toString(),
    },
    ACCESS_TOKEN_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
};

// ==================================================
// 2. VERIFY ACCESS TOKEN
// ==================================================

export const verifyAccessToken = (token) => {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Access token is required.");
  }

  return jwt.verify(token, ACCESS_TOKEN_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ["HS256"],
  });
};