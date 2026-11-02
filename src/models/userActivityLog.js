import mongoose from "mongoose";

const userActivityLogSchema = new mongoose.Schema(
  {
    // User who performed the activity
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Session from which the activity occurred
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSession",
      default: null,
    },

    // Activity/event name
    event: {
      type: String,
      required: true,
      trim: true,
    },

    // Activity category
    category: {
      type: String,
      enum: [
        "AUTH",
        "PROFILE",
        "BOOKING",
        "PAYMENT",
        "ADDRESS",
        "SECURITY",
        "SYSTEM",
      ],
      required: true,
    },

    // Application platform
    platform: {
      type: String,
      enum: ["WEB", "ANDROID", "IOS", "ADMIN", "OTHER"],
      default: "OTHER",
    },

    // Additional event-specific information
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Request information
    ip_address: {
      type: String,
      default: null,
    },

    user_agent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: false,
    },
    collection: "user_activity_logs",
  }
);

// Query a user's activity history
userActivityLogSchema.index({
  user_id: 1,
  created_at: -1,
});

// Query events by category and date
userActivityLogSchema.index({
  category: 1,
  created_at: -1,
});

const UserActivityLog = mongoose.model(
  "UserActivityLog",
  userActivityLogSchema
);

export default UserActivityLog;
