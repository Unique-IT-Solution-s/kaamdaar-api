import mongoose from "mongoose";

const serviceImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },

    public_id: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const servicePricingSchema = new mongoose.Schema(
  {
    // Store monetary values in paise.
    // Example: ₹699 = 69900 paise.

    base_price: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Base price must be a valid integer in paise.",
      },
    },

    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
      required: true,
    },
  },
  {
    _id: false,
  },
);

/* =========================================
   1. SERVICE MAIN SCHEMA
========================================= */

const serviceSchema = new mongoose.Schema(
  {
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    service_name: {
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

    short_description: {
      type: String,
      trim: true,
      maxlength: 250,
      default: null,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: null,
    },

    images: {
      type: [serviceImageSchema],
      default: [],
      validate: {
        validator: (images) => images.length <= 5,
        message: "Maximum 5 service images are allowed.",
      },
    },

    // -------------------------------------
    // FIXED SERVICE PRICING
    // -------------------------------------

    pricing: {
      type: servicePricingSchema,
      required: true,
    },

    // -------------------------------------
    // SERVICE DURATION
    // -------------------------------------

    estimated_duration_minutes: {
      type: Number,
      required: true,
      min: 5,
      max: 1440,
      validate: {
        validator: Number.isInteger,
        message: "Duration must be a whole number of minutes.",
      },
    },

    // -------------------------------------
    // SERVICE DISPLAY SETTINGS
    // -------------------------------------

    is_active: {
      type: Boolean,
      default: true,
    },

    is_featured: {
      type: Boolean,
      default: false,
    },

    sort_order: {
      type: Number,
      default: 0,
      min: 0,
      max: 10000,
      validate: {
        validator: Number.isInteger,
        message: "Sort order must be a whole number.",
      },
    },

    service_tagline: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    service_unit: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "per task",
    },

    // -------------------------------------
    // ADMIN TRACKING
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
    collection: "services",
  },
);

// Unique service slug.
serviceSchema.index(
  { slug: 1 },
  {
    unique: true,
    name: "unique_service_slug",
  },
);

// Find services belonging to a category.
serviceSchema.index({ category_id: 1, is_active: 1 });

// Fetch featured active services.
serviceSchema.index({ is_active: 1, is_featured: 1, sort_order: 1 });

serviceSchema.index(
  { category_id: 1, service_name: 1 },
  {
    unique: true,
    name: "unique_service_name_per_category",
    collation: { locale: "en", strength: 2 },
  },
);

/* =========================================
  2. EXPORT MODEL
========================================= */

const Service =
  mongoose.models.Service || mongoose.model("Service", serviceSchema);

export default Service;
