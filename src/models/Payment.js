import mongoose from "mongoose";

/* =========================================
   1. CASH PAYMENT CONFIRMATION SCHEMA
========================================= */

const cashConfirmationSchema = new mongoose.Schema(
  {
    customer_confirmed: {
      type: Boolean,
      default: false,
    },

    customer_confirmed_at: {
      type: Date,
      default: null,
    },

    provider_confirmed: {
      type: Boolean,
      default: false,
    },

    provider_confirmed_at: {
      type: Date,
      default: null,
    },

    confirmation_note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  { _id: false },
);

/* =========================================
   2. PAYMENT MAIN SCHEMA
========================================= */

const paymentSchema = new mongoose.Schema(
  {
    // -------------------------------------
    // A. BOOKING AND USER REFERENCES
    // -------------------------------------

    booking_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      immutable: true,
    },

    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    provider_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    // Payment attempt number for this booking.
    // Example: 1, 2, 3 when online payments are retried.
    attempt_number: {
      type: Number,
      required: true,
      min: 1,
    },

    // -------------------------------------
    // B. PAYMENT AMOUNT
    // -------------------------------------

    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Payment amount must be an integer in paise.",
      },
    },

    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
      required: true,
    },

    // -------------------------------------
    // C. PAYMENT METHOD
    // -------------------------------------

    payment_method: {
      type: String,
      enum: ["ONLINE", "CASH"],
      required: true,
    },

    // -------------------------------------
    // D. ONLINE PAYMENT GATEWAY
    // -------------------------------------

    gateway: {
      type: String,
      enum: ["RAZORPAY", "STRIPE", "OTHER"],
      default: null,
    },

    gateway_order_id: {
      type: String,
      trim: true,
      default: null,
    },

    gateway_payment_id: {
      type: String,
      trim: true,
      default: null,
    },

    gateway_signature_verified: {
      type: Boolean,
      default: false,
    },

    gateway_verified_at: {
      type: Date,
      default: null,
    },

    webhook_event_id: {
      type: String,
      trim: true,
      default: null,
    },

    // -------------------------------------
    // E. CASH PAYMENT CONFIRMATION
    // -------------------------------------

    cash_confirmation: {
      type: cashConfirmationSchema,
      default: () => ({}),
    },

    // -------------------------------------
    // F. PAYMENT STATUS
    // -------------------------------------

    payment_status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "PAID",
        "FAILED",
        "CANCELLED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ],
      default: "PENDING",
      required: true,
    },

    // -------------------------------------
    // G. PAYMENT FAILURE DETAILS
    // -------------------------------------

    failure_reason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    failure_code: {
      type: String,
      trim: true,
      default: null,
    },

    // -------------------------------------
    // H. REFUND DETAILS
    // -------------------------------------

    refund_amount: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Refund amount must be an integer in paise.",
      },
    },

    refund_reference: {
      type: String,
      trim: true,
      default: null,
    },

    refund_reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    refunded_at: {
      type: Date,
      default: null,
    },

    // -------------------------------------
    // I. IDEMPOTENCY
    // -------------------------------------

    idempotency_key: {
      type: String,
      trim: true,
      default: null,
    },

    // -------------------------------------
    // J. IMPORTANT TIMESTAMPS
    // -------------------------------------

    paid_at: {
      type: Date,
      default: null,
    },

    failed_at: {
      type: Date,
      default: null,
    },

    cancelled_at: {
      type: Date,
      default: null,
    },

    // -------------------------------------
    // K. ADMIN / SYSTEM TRACKING
    // -------------------------------------

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
    collection: "payments",
  },
);

/* =========================================
   3. CUSTOM VALIDATION
========================================= */

// Validate payment method and related fields.
paymentSchema.pre("validate", function () {
  if (this.payment_method === "ONLINE") {
    if (!this.gateway) {
      this.invalidate(
        "gateway",
        "Payment gateway is required for online payments.",
      );
    }
  }

  if (this.payment_method === "CASH") {
    if (this.gateway) {
      this.invalidate(
        "gateway",
        "Cash payments must not have a payment gateway.",
      );
    }
  }

  if (this.refund_amount > this.amount) {
    this.invalidate(
      "refund_amount",
      "Refund amount cannot exceed the original payment amount.",
    );
  }
  if (
    this.payment_status === "REFUNDED" &&
    this.refund_amount !== this.amount
  ) {
    this.invalidate(
      "refund_amount",
      "Fully refunded payment must have refund amount equal to payment amount.",
    );
  }

  if (
    this.payment_status === "PARTIALLY_REFUNDED" &&
    (this.refund_amount <= 0 || this.refund_amount >= this.amount)
  ) {
    this.invalidate(
      "refund_amount",
      "Partial refund amount must be greater than zero and less than payment amount.",
    );
  }
});

/* =========================================
   4. INDEXES
========================================= */

// Find all payment attempts for a booking.
paymentSchema.index(
  {
    booking_id: 1,
    attempt_number: 1,
  },
  {
    unique: true,
    name: "unique_booking_payment_attempt",
  },
);

// Find payments belonging to a booking.
paymentSchema.index({
  booking_id: 1,
  created_at: -1,
});

// Customer payment history.
paymentSchema.index({
  customer_id: 1,
  created_at: -1,
});

// Provider payment history.
paymentSchema.index({
  provider_id: 1,
  created_at: -1,
});

// Admin revenue and payment status reports.
paymentSchema.index({
  payment_status: 1,
  created_at: -1,
});

// Prevent duplicate gateway payment IDs.
paymentSchema.index(
  {
    gateway: 1,
    gateway_payment_id: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      gateway_payment_id: { $type: "string" },
    },
    name: "unique_gateway_payment_id",
  },
);

// Prevent duplicate webhook event processing.
paymentSchema.index(
  { webhook_event_id: 1, gateway: 1 },
  {
    unique: true,
    partialFilterExpression: {
      webhook_event_id: { $type: "string" },
    },
    name: "unique_webhook_event_id",
  },
);

// Prevent duplicate payment requests.
paymentSchema.index(
  { idempotency_key: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotency_key: { $type: "string" },
    },
    name: "unique_payment_idempotency_key",
  },
);

/* =========================================
   5. EXPORT MODEL
========================================= */

const Payment =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

export default Payment;
