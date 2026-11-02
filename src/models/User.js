import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 100,
      default: null,
    },

    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\+[1-9]\d{7,14}$/,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      default: undefined,
    },

    role_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },

    user_type: {
      type: String,
      enum: ["CUSTOMER", "PROVIDER", "ADMIN", "SUPER_ADMIN"],
      default: "CUSTOMER",
      required: true,
    },

    mobile_verified: {
      type: Boolean,
      default: false,
    },

    email_verified: {
      type: Boolean,
      default: false,
    },

    language: {
      type: String,
      default: "en",
    },

    firebase_uid: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    profile_image: {
      url: {
        type: String,
        default: null,
      },
      public_id: {
        type: String,
        default: null,
      },
    },

    profile_completed: {
      type: Boolean,
      default: false,
    },
    last_login_at: {
      type: Date,
      default: null,
    },
    last_seen_at: {
      type: Date,
      default: null,
    },
    account_status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "DEACTIVATED"],
      default: "ACTIVE",
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
    },
  },
);

const User = mongoose.model("User", userSchema);

export default User;
