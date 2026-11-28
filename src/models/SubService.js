import mongoose from "mongoose";

const subServiceImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      default: null,
    },

    public_id: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const subServicePricingSchema = new mongoose.Schema(
  {
    pricing_type: {
      type: String,
      enum: ["PER_UNIT", "PER_HOUR", "PER_TASK"],
      required: true,
      default: "PER_TASK",
    },

    base_price: {
      type: Number,
      min: 1,
      default: null,
      validate: {
        validator: (value) => value === null || Number.isSafeInteger(value),
        message: "Price must be an integer in paise.",
      },
    },

    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
    },

    min_quantity: {
      type: Number,
      min: 1,
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: "Minimum quantity must be a whole number.",
      },
    },

    max_quantity: {
      type: Number,
      min: 1,
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: "Maximum quantity must be a whole number.",
      },
    },
  },
  { _id: false },
);

const subServiceSchema = new mongoose.Schema(
  {
    service_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },

    subservice_name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 180,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },

    pricing: {
      type: subServicePricingSchema,
      default: () => ({}),
    },

    estimated_duration_minutes: {
      type: Number,
      min: 1,
      default: null,
      validate: {
        validator: (value) => value === null || Number.isInteger(value),
        message: "Duration must be a whole number of minutes.",
      },
    },

    unit: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "per task",
    },

    tagline: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    // C. SUBSERVICE IMAGE
    image: {
      type: subServiceImageSchema,
      default: () => ({}),
    },

    // -------------------------------------
    // D. DISPLAY SETTINGS
    // -------------------------------------

    is_active: {
      type: Boolean,
      default: true,
    },

    sort_order: {
      type: Number,
      default: 0,
      min: 0,
      max: 10000,
    },

    // -------------------------------------
    // E. ADMIN TRACKING
    // -------------------------------------

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },

  {
    timestamps: true,
    collection: "subservices",
  },
);

/* =========================================
   3. INDEXES
========================================= */

// A slug must be unique within its parent service.
subServiceSchema.index(
  {
    service_id: 1,
    slug: 1,
  },
  {
    unique: true,
    name: "unique_subservice_slug_per_service",
  },
);

// Fetch active subservices in display order.
subServiceSchema.index(
  {
    service_id: 1,
    is_active: 1,
    sort_order: 1,
  },
  {
    name: "active_subservices_by_service",
  },
);

/* =========================================
   4. EXPORT MODEL
========================================= */

const SubService =
  mongoose.models.SubService || mongoose.model("SubService", subServiceSchema);

export default SubService;
