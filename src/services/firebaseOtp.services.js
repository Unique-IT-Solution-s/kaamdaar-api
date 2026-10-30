const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

const FIREBASE_AUTH_URL =
  "https://identitytoolkit.googleapis.com/v1";

const FIREBASE_SEND_OTP_URL =
  `${FIREBASE_AUTH_URL}/accounts:sendVerificationCode`;

const FIREBASE_VERIFY_OTP_URL =
  `${FIREBASE_AUTH_URL}/accounts:signInWithPhoneNumber`;

// Send OTP using Firebase REST API
export const sendFirebaseOtp = async ({
  phoneNumber,
  recaptchaToken,
}) => {
  const response = await fetch(
    `${FIREBASE_SEND_OTP_URL}?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber,
        recaptchaToken,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "Failed to send OTP"
    );
  }

  return result;
};

// Verify OTP using Firebase REST API
export const verifyFirebaseOtp = async ({
  sessionInfo,
  code,
}) => {
  const response = await fetch(
    `${FIREBASE_VERIFY_OTP_URL}?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionInfo,
        code,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "OTP verification failed"
    );
  }

  return result;
};