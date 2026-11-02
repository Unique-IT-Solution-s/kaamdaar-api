import mongoose from "mongoose";

const userSessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    refresh_token_hash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    device_id: {
      type: String,
      default: null,
    },

    device_name: {
      type: String,
      default: null,
      trim: true,
    },

    platform: {
      type: String,
      enum: ["WEB", "ANDROID", "IOS", "OTHER"],
      default: "OTHER",
    },

    expires_at: {
      type: Date,
      required: true,
    },

    last_used_at: {
      type: Date,
      default: Date.now,
    },

    revoked_at: {
      type: Date,
      default: null,
    },

    revoke_reason: {
      type: String,
      enum: [
        "LOGOUT",
        "LOGOUT_ALL",
        "TOKEN_ROTATION",
        "ACCOUNT_DISABLED",
        "SECURITY",
      ],
      default: null,
    },
    
    is_online: {
      type: Boolean,
      default: false,
    },

    last_active: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    collection: "user_sessions",
  },
);

userSessionSchema.index({ user_id: 1, revoked_at: 1 });
userSessionSchema.index({ expires_at: 1 });

const UserSession = mongoose.model("UserSession", userSessionSchema);

export default UserSession;
