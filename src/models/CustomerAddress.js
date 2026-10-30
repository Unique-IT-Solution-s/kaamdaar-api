import mongoose from "mongoose";

const customerAddressSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerProfile",
      required: true,
      index: true,
    },

    label: {
      type: String,
      enum: ["HOME", "OFFICE", "OTHER"],
      required: true,
    },

    address_line1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    address_line2: {
      type: String,
      trim: true,
      maxlength: 150,
      default: null,
    },

    landmark: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    city_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      required: true,
    },

    postal_code: {
      type: String,
      trim: true,
      required: true,
      match: /^[1-9][0-9]{5}$/,
    },

    latitude: {
      type: Number,
      min: -90,
      max: 90,
      default: null,
    },

    longitude: {
      type: Number,
      min: -180,
      max: 180,
      default: null,
    },

    is_default: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    collection: "customer_addresses",
  },
);

customerAddressSchema.index({ customer_id: 1, is_default: 1 });

// Ensure at most one default address per customer
customerAddressSchema.index(
  {customer_id : 1}, 
  {unique : true, partialFilterExpression : {is_default : true}}, 
  {name : "one_default_address_per_customer"}
)

const CustomerAddress = mongoose.model("CustomerAddress", customerAddressSchema);

export default CustomerAddress;
