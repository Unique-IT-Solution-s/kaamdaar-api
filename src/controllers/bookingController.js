import mongoose from "mongoose";

import User from "../models/User.js";
import CustomerProfile from "../models/CustomerProfile.js";
import CustomerAddress from "../models/CustomerAddress.js";
import Category from "../models/Category.js";
import Service from "../models/Service.js";
import SubService from "../models/SubService.js";
import City from "../models/City.js";
import State from "../models/State.js";
import Country from "../models/Country.js";

// Normalize service unit
const normalizeServiceUnit = (unit = "") => {
  const value = unit.trim().toLowerCase();

  if (["per task", "task", "fixed"].includes(value)) return "PER_TASK";
  if (["per hour", "hour", "hourly"].includes(value)) return "PER_HOUR";

  if (
    value.startsWith("per ") ||
    ["unit", "piece", "quantity"].includes(value)
  ) {
    return "PER_UNIT";
  }

  return null;
};

// Validate coordinates
const isValidCoordinate = (value, min, max) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

export const previewBooking = async (req, res) => {
  try {
    // STEP 1: Validate customer authentication
    const customerId = req.user?.id;
    console.log("Authenticated user:", req.user);
    console.log("customer Id", customerId);

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(401).json({
        success: false,
        message: "Valid customer authentication is required.",
      });
    }

    // STEP 2: Find active customer
    const customer = await User.findOne({
      _id: customerId,
      user_type: "CUSTOMER",
      account_status: "ACTIVE",
    })
      .select("_id name mobile")
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Active customer account not found.",
      });
    }

    // STEP 3: Find customer profile
    const customerProfile = await CustomerProfile.findOne({
      userId: customer._id,
    }).lean();

    if (!customerProfile) {
      return res.status(404).json({
        success: false,
        message: "Customer profile not found.",
      });
    }

    // STEP 4: Get request body
    const {
      category_id,
      service_id,
      sub_service_id,
      address_id,
      address,
      save_address = false,
      booking_type,
      scheduled_at,
      quantity,
      special_instructions,
    } = req.body;

    // STEP 5: Validate required IDs
    if (
      !mongoose.Types.ObjectId.isValid(category_id) ||
      !mongoose.Types.ObjectId.isValid(service_id) ||
      !mongoose.Types.ObjectId.isValid(sub_service_id)
    ) {
      return res.status(422).json({
        success: false,
        message:
          "Valid category_id, service_id and sub_service_id are required.",
      });
    }

    // STEP 6: Validate category
    const category = await Category.findOne({
      _id: category_id,
      is_active: true,
    }).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Selected category does not exist or is inactive.",
      });
    }

    // STEP 7: Validate service
    const service = await Service.findOne({
      _id: service_id,
      category_id: category._id,
      is_active: true,
    }).lean();

    if (!service) {
      return res.status(404).json({
        success: false,
        message:
          "Selected service does not exist, is inactive, or does not belong to this category.",
      });
    }

    // STEP 8: Validate subservice
    const subService = await SubService.findOne({
      _id: sub_service_id,
      service_id: service._id,
      is_active: true,
    }).lean();

    if (!subService) {
      return res.status(404).json({
        success: false,
        message:
          "Selected subservice does not exist, is inactive, or does not belong to this service.",
      });
    }

    // STEP 9: Validate booking type
    if (!["INSTANT", "SCHEDULED"].includes(booking_type)) {
      return res.status(422).json({
        success: false,
        message: "Booking type must be INSTANT or SCHEDULED.",
      });
    }

    let scheduledDate = null;

    if (booking_type === "INSTANT") {
      if (
        scheduled_at !== undefined &&
        scheduled_at !== null &&
        scheduled_at !== ""
      ) {
        return res.status(422).json({
          success: false,
          message: "scheduled_at must not be provided for instant bookings.",
        });
      }
    } else {
      // Scheduled booking validation
      if (typeof scheduled_at !== "string") {
        return res.status(422).json({
          success: false,
          message: "scheduled_at is required for scheduled bookings.",
        });
      }

      // Require explicit timezone
      const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(scheduled_at);

      if (!hasTimezone) {
        return res.status(422).json({
          success: false,
          message: "scheduled_at must include a timezone, for example +05:30.",
        });
      }

      scheduledDate = new Date(scheduled_at);

      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(422).json({
          success: false,
          message: "Invalid scheduled_at date.",
        });
      }

      const now = new Date();
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      if (scheduledDate <= now || scheduledDate > sevenDaysLater) {
        return res.status(422).json({
          success: false,
          message: "Scheduled booking must be within the next 7 days.",
        });
      }

      if (
        scheduledDate.getMinutes() % 30 !== 0 ||
        scheduledDate.getSeconds() !== 0 ||
        scheduledDate.getMilliseconds() !== 0
      ) {
        return res.status(422).json({
          success: false,
          message: "Booking time must be in 30-minute intervals.",
        });
      }
    }

    // STEP 10: Validate address input
    if ((address_id && address) || (!address_id && !address)) {
      return res.status(422).json({
        success: false,
        message:
          "Provide either address_id or address. Both cannot be provided together.",
      });
    }

    if (typeof save_address !== "boolean") {
      return res.status(422).json({
        success: false,
        message: "save_address must be a boolean value.",
      });
    }

    let addressData;
    let resolvedAddressId = null;

    // STEP 11: Get saved customer address
    if (address_id) {
      if (!mongoose.Types.ObjectId.isValid(address_id)) {
        return res.status(422).json({
          success: false,
          message: "Invalid address_id.",
        });
      }

      const savedAddress = await CustomerAddress.findOne({
        _id: address_id,
        customer_id: customerProfile._id,
      }).lean();

      if (!savedAddress) {
        return res.status(404).json({
          success: false,
          message: "Selected customer address not found.",
        });
      }

      addressData = savedAddress;
      resolvedAddressId = savedAddress._id;
    } else {
      // STEP 12: Validate new address
      if (!address || typeof address !== "object" || Array.isArray(address)) {
        return res.status(422).json({
          success: false,
          message: "Valid address details are required.",
        });
      }

      const {
        label,
        address_line1,
        address_line2,
        landmark,
        city_id,
        postal_code,
        latitude,
        longitude,
      } = address;

      if (!["HOME", "OFFICE", "OTHER"].includes(label)) {
        return res.status(422).json({
          success: false,
          message: "Address label must be HOME, OFFICE or OTHER.",
        });
      }

      if (
        typeof address_line1 !== "string" ||
        !address_line1.trim() ||
        address_line1.trim().length > 150
      ) {
        return res.status(422).json({
          success: false,
          message: "Valid address_line1 is required.",
        });
      }

      if (
        address_line2 !== undefined &&
        address_line2 !== null &&
        typeof address_line2 !== "string"
      ) {
        return res.status(422).json({
          success: false,
          message: "address_line2 must be a string.",
        });
      }

      if (
        landmark !== undefined &&
        landmark !== null &&
        typeof landmark !== "string"
      ) {
        return res.status(422).json({
          success: false,
          message: "landmark must be a string.",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(city_id)) {
        return res.status(422).json({
          success: false,
          message: "Valid city_id is required.",
        });
      }

      if (
        typeof postal_code !== "string" ||
        !/^[1-9][0-9]{5}$/.test(postal_code.trim())
      ) {
        return res.status(422).json({
          success: false,
          message: "Valid 6-digit postal code is required.",
        });
      }

      addressData = {
        label,
        address_line1: address_line1.trim(),
        address_line2: address_line2?.trim() || null,
        landmark: landmark?.trim() || null,
        city_id,
        postal_code: postal_code.trim(),
        latitude,
        longitude,
      };
    }

    // STEP 13: Validate address coordinates
    console.log("Selected Address:", {
      address_id: addressData._id,
      latitude: addressData.latitude,
      longitude: addressData.longitude,
      //   latitude_type: typeof addressData.latitude,
      //   longitude_type: typeof addressData.longitude,
    });
    if (
      !isValidCoordinate(addressData.latitude, -90, 90) ||
      !isValidCoordinate(addressData.longitude, -180, 180)
    ) {
      return res.status(422).json({
        success: false,
        message: "Selected address must have valid latitude and longitude.",
      });
    }

    // STEP 14: Validate city
    const city = await City.findOne({
      _id: addressData.city_id,
      is_active: true,
    }).lean();

    if (!city) {
      return res.status(404).json({
        success: false,
        message: "Selected city does not exist or is inactive.",
      });
    }

    // STEP 15: Validate state
    const state = await State.findOne({
      _id: city.state_id,
      country_id: city.country_id,
      is_active: true,
    }).lean();

    if (!state) {
      return res.status(404).json({
        success: false,
        message: "Selected state does not exist or is inactive.",
      });
    }

    // STEP 16: Validate country
    const country = await Country.findOne({
      _id: city.country_id,
      is_active: true,
    }).lean();

    if (!country) {
      return res.status(404).json({
        success: false,
        message: "Selected country does not exist or is inactive.",
      });
    }

    // STEP 17: Create address snapshot
    const addressSnapshot = {
      label: addressData.label,
      recipient_name: customer.name,
      recipient_mobile: customer.mobile,
      address_line1: addressData.address_line1,
      address_line2: addressData.address_line2 || null,
      landmark: addressData.landmark || null,
      city_id: city._id,
      city: city.city_name,
      state_id: state._id,
      state: state.state_name,
      country_id: country._id,
      country: country.country_name,
      postal_code: addressData.postal_code,
      latitude: addressData.latitude,
      longitude: addressData.longitude,
    };

    // STEP 18: Resolve subservice pricing
    const subPricing = subService.pricing;

    if (!subPricing || !subPricing.pricing_type) {
      return res.status(422).json({
        success: false,
        message: "Subservice pricing configuration is missing.",
      });
    }

    const pricingType = subPricing.pricing_type;

    if (!["PER_UNIT", "PER_HOUR", "PER_TASK"].includes(pricingType)) {
      return res.status(422).json({
        success: false,
        message: "Invalid subservice pricing type.",
      });
    }

    let unitPrice = subPricing.base_price;
    let priceSource = "SUBSERVICE";

    // STEP 19: Inherit service price if subservice price is null
    if (unitPrice === null || unitPrice === undefined) {
      const servicePricingType = normalizeServiceUnit(service.service_unit);

      if (servicePricingType !== pricingType) {
        return res.status(422).json({
          success: false,
          message:
            "Subservice price is missing and parent service pricing unit does not match.",
        });
      }

      unitPrice = service.pricing?.base_price;
      priceSource = "SERVICE";
    }

    if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) {
      return res.status(422).json({
        success: false,
        message: "Valid service price is not configured.",
      });
    }

    // STEP 20: Validate quantity
    let selectedQuantity = 1;

    if (pricingType === "PER_TASK") {
      if (quantity !== undefined && quantity !== 1) {
        return res.status(422).json({
          success: false,
          message: "PER_TASK pricing only allows quantity 1.",
        });
      }
    } else {
      if (
        !Number.isInteger(quantity) ||
        quantity < subPricing.min_quantity ||
        quantity > subPricing.max_quantity
      ) {
        return res.status(422).json({
          success: false,
          message: `Quantity must be between ${subPricing.min_quantity} and ${subPricing.max_quantity}.`,
        });
      }

      selectedQuantity = quantity;
    }

    // STEP 21: Calculate subtotal
    const subtotal = unitPrice * selectedQuantity;

    if (!Number.isSafeInteger(subtotal)) {
      return res.status(422).json({
        success: false,
        message: "Calculated booking amount is invalid.",
      });
    }

    // STEP 22: Calculate commission
    const commissionPercentage = Number.isFinite(category.commission_percentage)
      ? category.commission_percentage
      : 10;

    if (commissionPercentage < 0 || commissionPercentage > 100) {
      return res.status(422).json({
        success: false,
        message: "Invalid category commission percentage.",
      });
    }

    const commissionAmount = Math.round(
      (subtotal * commissionPercentage) / 100,
    );

    const providerEarning = subtotal - commissionAmount;

    // STEP 23: Validate special instructions
    if (
      special_instructions !== undefined &&
      special_instructions !== null &&
      (typeof special_instructions !== "string" ||
        special_instructions.length > 1000)
    ) {
      return res.status(422).json({
        success: false,
        message:
          "Special instructions must be a string of maximum 1000 characters.",
      });
    }

    // STEP 24: Return booking preview
    return res.status(200).json({
      success: true,
      message: "Booking preview generated successfully.",
      data: {
        booking_type,
        scheduled_at: scheduledDate,
        timezone: "Asia/Kolkata",

        service: {
          category_id: category._id,
          category_name: category.category_name,
          service_id: service._id,
          service_name: service.service_name,
          sub_service_id: subService._id,
          subservice_name: subService.subservice_name,
          estimated_duration_minutes:
            subService.estimated_duration_minutes ||
            service.estimated_duration_minutes,
        },

        address: {
          address_id: resolvedAddressId,
          address_snapshot: addressSnapshot,
          save_address: address_id ? false : save_address,
        },

        pricing: {
          pricing_type: pricingType,
          price_source: priceSource,
          service_price: unitPrice,
          quantity: selectedQuantity,
          subtotal,
          currency: subPricing.currency || "INR",
          commission_percentage: commissionPercentage,
          commission_amount: commissionAmount,
          provider_earning: providerEarning,
          total_amount: subtotal,
        },

        special_instructions: special_instructions?.trim() || null,
      },
    });
  } catch (error) {
    console.error("Preview booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to generate booking preview.",
    });
  }
};
