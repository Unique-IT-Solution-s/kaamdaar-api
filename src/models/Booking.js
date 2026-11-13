
import mongoose from "mongoose";

/* =========================================
   1. BOOKING ADDRESS SNAPSHOT
========================================= */

const bookingAddressSchema = new mongoose.Schema(
  {
    recipient_name: {
      type: String,
      trim: true,
      default: null,
    },

    recipient_mobile: {
      type: String,
      trim: true,
      default: null,
    },

    address_line1: {
      type: String,
      required: true,
      trim: true,
    },

    address_line2: {
      type: String,
      trim: true,
      default: null,
    },

    landmark: {
      type: String,
      trim: true,
      default: null,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    postal_code: {
      type: String,
      required: true,
      trim: true,
    },

    latitude: {
      type: Number,
      min: -90,
      max: 90,
      required: true,
    },

    longitude: {
      type: Number,
      min: -180,
      max: 180,
      required: true,
    },
  },
  { _id: false }
);


/* =========================================
   2. BOOKING PRICING SNAPSHOT
========================================= */

const bookingPricingSchema = new mongoose.Schema(
  {
    service_price: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Service price must be an integer in paise.",
      },
    },

    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
      required: true,
    },

    commission_percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    commission_amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Commission amount must be an integer in paise.",
      },
    },

    provider_earning: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Provider earning must be an integer in paise.",
      },
    },

    total_amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Total amount must be an integer in paise.",
      },
    },
  },
  { _id: false }
);


/* =========================================
   3. PROVIDER ASSIGNMENT HISTORY
========================================= */

const assignmentHistorySchema = new mongoose.Schema(
  {
    provider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    action: {
      type: String,
      enum: [
        "ASSIGNED",
        "ACCEPTED",
        "CANCELLED",
        "REASSIGNED",
      ],
      required: true,
    },

    reason: {
      type: String,
      trim: true,
      default: null,
    },

    action_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);


/* =========================================
   4. BOOKING STATUS HISTORY
========================================= */

const bookingStatusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "SEARCHING_PROVIDER",
        "CONFIRMED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "NO_PROVIDER_FOUND",
      ],
      required: true,
    },

    changed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    changed_by_role: {
      type: String,
      enum: ["CUSTOMER", "PROVIDER", "ADMIN", "SYSTEM"],
      required: true,
    },

    note: {
      type: String,
      trim: true,
      default: null,
    },

    changed_at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);


/* =========================================
   5. BOOKING CANCELLATION
========================================= */

const cancellationSchema = new mongoose.Schema(
  {
    cancelled_by: {
      type: String,
      enum: ["CUSTOMER", "PROVIDER", "ADMIN"],
      default: null,
    },

    cancelled_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellation_reason: {
      type: String,
      trim: true,
      default: null,
    },

    cancellation_note: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    cancellation_fee: {
      type: Number,
      default: 0,
      min: 0,
    },

    cancelled_at: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);


/* =========================================
   6. BOOKING MAIN SCHEMA
========================================= */

const bookingSchema = new mongoose.Schema(
  {
    // -------------------------------------
    // A. BOOKING IDENTIFICATION
    // -------------------------------------

    booking_number: {
      type: String,
      required: true,
      trim: true,
    },


    // -------------------------------------
    // B. CUSTOMER AND PROVIDER
    // -------------------------------------

    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    provider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },


    // -------------------------------------
    // C. CATEGORY AND SERVICE
    // -------------------------------------

    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    service_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },

    service_snapshot: {
      service_name: {
        type: String,
        required: true,
        trim: true,
      },

      category_name: {
        type: String,
        required: true,
        trim: true,
      },

      estimated_duration_minutes: {
        type: Number,
        required: true,
        min: 1,
      },
    },


    // -------------------------------------
    // D. SERVICE ADDRESS
    // -------------------------------------

    address_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerAddress",
      required: true,
    },

    address_snapshot: {
      type: bookingAddressSchema,
      required: true,
    },


    // -------------------------------------
    // E. BOOKING SCHEDULE
    // -------------------------------------

    booking_type: {
      type: String,
      enum: ["INSTANT", "SCHEDULED"],
      required: true,
    },

    scheduled_at: {
      type: Date,
      required: true,
    },

    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },


    // -------------------------------------
    // F. BOOKING STATUS
    // -------------------------------------

    booking_status: {
      type: String,
      enum: [
        "SEARCHING_PROVIDER",
        "CONFIRMED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "NO_PROVIDER_FOUND",
      ],
      default: "SEARCHING_PROVIDER",
      required: true,
    },


    // -------------------------------------
    // G. PRICING SNAPSHOT
    // -------------------------------------

    pricing: {
      type: bookingPricingSchema,
      required: true,
    },


    // -------------------------------------
    // H. PAYMENT TRACKING
    // -------------------------------------

    payment_status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "PAID",
        "FAILED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ],
      default: "PENDING",
    },

    payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },


    // -------------------------------------
    // I. BOOKING INSTRUCTIONS
    // -------------------------------------

    special_instructions: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },


    // -------------------------------------
    // J. PROVIDER ASSIGNMENT HISTORY
    // -------------------------------------

    assignment_history: {
      type: [assignmentHistorySchema],
      default: [],
    },


    // -------------------------------------
    // K. BOOKING STATUS HISTORY
    // -------------------------------------

    status_history: {
      type: [bookingStatusHistorySchema],
      default: [],
    },


    // -------------------------------------
    // L. CANCELLATION DETAILS
    // -------------------------------------

    cancellation: {
      type: cancellationSchema,
      default: () => ({}),
    },


    // -------------------------------------
    // M. IMPORTANT TIMESTAMPS
    // -------------------------------------

    confirmed_at: {
      type: Date,
      default: null,
    },

    started_at: {
      type: Date,
      default: null,
    },

    completed_at: {
      type: Date,
      default: null,
    },

    cancelled_at: {
      type: Date,
      default: null,
    },


    // -------------------------------------
    // N. ADMIN TRACKING
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
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    collection: "bookings",
  }
);


/* =========================================
   7. INDEXES
========================================= */

// Unique booking number.
bookingSchema.index(
  { booking_number: 1 },
  {
    unique: true,
    name: "unique_booking_number",
  }
);

// Customer booking history.
bookingSchema.index({
  customer_id: 1,
  created_at: -1,
});

// Provider booking history.
bookingSchema.index({
  provider_id: 1,
  booking_status: 1,
});

// Admin dashboard booking filters.
bookingSchema.index({
  booking_status: 1,
  created_at: -1,
});

// Scheduled booking lookup.
bookingSchema.index({
  booking_status: 1,
  scheduled_at: 1,
});

// Service analytics.
bookingSchema.index({
  service_id: 1,
  created_at: -1,
});

// Category analytics.
bookingSchema.index({
  category_id: 1,
  created_at: -1,
});


/* =========================================
   8. EXPORT MODEL
========================================= */

const Booking =
  mongoose.models.Booking ||
  mongoose.model("Booking", bookingSchema);

export default Booking;
