import mongoose from "mongoose";

const fcmTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    guard: {
      type: String,
      enum: ["api", "web"],
      default: "api",
      required: true,
    },

    device_id: {
      type: String,
      required: true,
      trim: true,
    },

    token: {
      type: String,
      required: true,
      trim: true,
    },

    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// One active record per user, guard and device.
fcmTokenSchema.index(
  {
    user_id: 1,
    guard: 1,
    device_id: 1,
  },
  {
    unique: true,
  }
);

const FcmToken = mongoose.model("FcmToken", fcmTokenSchema);

export default FcmToken;