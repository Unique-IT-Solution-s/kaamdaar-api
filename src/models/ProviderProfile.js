import mongoose from "mongoose";

/* =========================================
   1. PROVIDER KYC DOCUMENT SCHEMA
========================================= */

const providerDocumentSchema = new mongoose.Schema(
  {
    document_type: {
      type: String,
      enum: [
        "IDENTITY_PROOF",
        "ADDRESS_PROOF",
        "BUSINESS_REGISTRATION",
        "TAX_REGISTRATION",
        "PROFESSIONAL_CERTIFICATE",
        "OTHER",
      ],
      required: true,
    },

    // Private storage key (Cloudinary public_id or
    // private object-storage key), not a public URL.
    storage_key: {
      type: String,
      required: true,
      trim: true,
    },

    original_filename: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },

    mime_type: {
      type: String,
      trim: true,
      default: null,
    },

    size_bytes: {
      type: Number,
      min: 0,
      default: null,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    submitted_at: {
      type: Date,
      default: Date.now,
    },

    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewed_at: {
      type: Date,
      default: null,
    },

    rejection_reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  { _id: true }
);


/* =========================================
   2. PROVIDER SERVICE AREA SCHEMA
========================================= */

const providerServiceAreaSchema = new mongoose.Schema(
  {
    city_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      required: true,
    },

    pincode_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pincode",
      },
    ],
  },
  { _id: false }
);


/* =========================================
   3. PROVIDER RATING SCHEMA
========================================= */

const providerRatingSchema = new mongoose.Schema(
  {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    total_reviews: {
      type: Number,
      default: 0,
      min: 0,
    },

    distribution: {
      one_star: {
        type: Number,
        default: 0,
        min: 0,
      },

      two_star: {
        type: Number,
        default: 0,
        min: 0,
      },

      three_star: {
        type: Number,
        default: 0,
        min: 0,
      },

      four_star: {
        type: Number,
        default: 0,
        min: 0,
      },

      five_star: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  { _id: false }
);


/* =========================================
   4. PROVIDER PERFORMANCE SCHEMA
========================================= */

const providerPerformanceSchema = new mongoose.Schema(
  {
    total_bookings: {
      type: Number,
      default: 0,
      min: 0,
    },

    completed_bookings: {
      type: Number,
      default: 0,
      min: 0,
    },

    cancelled_bookings: {
      type: Number,
      default: 0,
      min: 0,
    },

    active_bookings: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);


/* =========================================
   5. PROVIDER PROFILE MAIN SCHEMA
========================================= */

const providerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },


    // -------------------------------------
    // B. BASIC PROVIDER INFORMATION
    // -------------------------------------

    provider_type: {
      type: String,
      enum: ["INDIVIDUAL", "BUSINESS"],
      required: true,
    },

    display_name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    business_name: {
      type: String,
      trim: true,
      maxlength: 150,
      default: null,

      required: function () {
        return this.provider_type === "BUSINESS";
      },
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    experience_years: {
      type: Number,
      min: 0,
      max: 60,
      default: 0,
    },


    // -------------------------------------
    // C. PROVIDER APPROVAL
    // -------------------------------------

    approval: {
      status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED"],
        default: "PENDING",
      },

      reviewed_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      reviewed_at: {
        type: Date,
        default: null,
      },

      rejection_reason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
      },
    },


    // -------------------------------------
    // D. KYC VERIFICATION
    // -------------------------------------

    kyc: {
      status: {
        type: String,enum: [ "NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"],
        default: "NOT_SUBMITTED",
      },

      documents: {
        type: [providerDocumentSchema],
        default: [],
      },
    },


    // -------------------------------------
    // E. SERVICES OFFERED
    // -------------------------------------

    service_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
      },
    ],


    // -------------------------------------
    // F. SERVICE LOCATIONS
    // -------------------------------------

    service_areas: {
      type: [providerServiceAreaSchema],
      default: [],
    },


    // -------------------------------------
    // G. PROVIDER RATINGS
    // -------------------------------------

    rating: {
      type: providerRatingSchema,
      default: () => ({}),
    },


    // -------------------------------------
    // H. PROVIDER BOOKING PERFORMANCE
    // -------------------------------------

    performance: {
      type: providerPerformanceSchema,
      default: () => ({}),
    },


    // -------------------------------------
    // I. BOOKING AVAILABILITY
    // -------------------------------------

    is_accepting_bookings: {
      type: Boolean,
      default: false,
    },
  },

  {
    timestamps: true,
    collection: "provider_profiles",
  }
);


/* =========================================
   6. INDEXES
========================================= */

// Find provider profile using User ID.
providerProfileSchema.index(
  { userId: 1 },
  { unique: true }
);

// Admin KYC queue and approval filtering.
providerProfileSchema.index({
  "approval.status": 1,
  createdAt: -1,
});

providerProfileSchema.index({
  "kyc.status": 1,
});

// Find providers offering a particular service.
providerProfileSchema.index({
  service_ids: 1,
});

// Find providers operating in a city.
providerProfileSchema.index({
  "service_areas.city_id": 1,
});

// Find providers operating in a particular pincode.
providerProfileSchema.index({
  "service_areas.pincode_ids": 1,
});

// Find available and approved providers.
providerProfileSchema.index({
  "approval.status": 1,
  is_accepting_bookings: 1,
});


/* =========================================
   7. EXPORT MODEL
========================================= */

const ProviderProfile =
  mongoose.models.ProviderProfile ||
  mongoose.model("ProviderProfile", providerProfileSchema);

export default ProviderProfile;
   