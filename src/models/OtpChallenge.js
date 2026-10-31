import mongoose from "mongoose";

const otpChallengeSchema = new mongoose.Schema(
  {
    challenge_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    mobile: {
      type: String,
      required: true,
      trim: true,
      match: /^\+[1-9]\d{7,14}$/,
    },

    session_info: {
      type: String,
      required: true,
      select: false,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    platform: {
      type: String,
      enum: ["WEB", "ANDROID", "IOS"],
      default: "WEB",
      required: true,
    },

    expires_at: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "otp_challenges",
  }
);

// Automatically remove expired OTP challenges.
// MongoDB TTL deletion is asynchronous.
otpChallengeSchema.index(
  { expires_at: 1 },
  { expireAfterSeconds: 0 }
);

const OtpChallenge = mongoose.model(
  "OtpChallenge",
  otpChallengeSchema
);

export default OtpChallenge;