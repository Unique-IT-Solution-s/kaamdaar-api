import mongoose from "mongoose";

import CustomerProfile from "../models/CustomerProfile.js";
import CustomerAddress from "../models/CustomerAddress.js";
import Pincode from "../models/Pincode.js";

export const addCustomerAddress = async (req, res) => {
  let session;

  try {
    // STEP 1: Get authenticated user
    const userId = req.user?.id;
    const userType = req.user?.user?.user_type;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // STEP 2: Check customer role
    if (userType !== "CUSTOMER") {
      return res.status(403).json({
        success: false,
        message: "Only customers can add customer addresses.",
      });
    }

    // STEP 3: Extract request body
    const { label, address_line1, address_line2, landmark, postal_code } =
      req.body;

    // STEP 4: Validate required fields
    if (
      typeof label !== "string" ||
      typeof address_line1 !== "string" ||
      typeof postal_code !== "string" ||
      !label.trim() ||
      !address_line1.trim() ||
      !postal_code.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Label, address and postal code are required.",
      });
    }

    // STEP 5: Validate label
    const normalizedLabel = label.trim().toUpperCase();

    if (!["HOME", "OFFICE", "OTHER"].includes(normalizedLabel)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address label. Use HOME, OFFICE or OTHER.",
      });
    }

    // STEP 6: Validate address line
    const normalizedAddress = address_line1.trim();

    if (normalizedAddress.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Address line must not exceed 150 characters.",
      });
    }

    // STEP 7: Validate optional fields
    if (
      address_line2 !== undefined &&
      address_line2 !== null &&
      (typeof address_line2 !== "string" || address_line2.trim().length > 150)
    ) {
      return res.status(400).json({
        success: false,
        message: "Address line 2 must not exceed 150 characters.",
      });
    }

    if (
      landmark !== undefined &&
      landmark !== null &&
      (typeof landmark !== "string" || landmark.trim().length > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Landmark must not exceed 100 characters.",
      });
    }

    // STEP 8: Validate PIN code
    const normalizedPostalCode = postal_code.trim();

    if (!/^[1-9][0-9]{5}$/.test(normalizedPostalCode)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 6-digit PIN code.",
      });
    }

    // STEP 9: Find PIN code mapping
    const pincodeMapping = await Pincode.findOne({
      postal_code: normalizedPostalCode,
      is_active: true,
    })
      .populate("city_id", "city_name state_id country_id is_active")
      .populate("state_id", "state_name country_id is_active")
      .populate("country_id", "country_name country_code is_active");

    if (
      !pincodeMapping ||
      !pincodeMapping.city_id ||
      !pincodeMapping.state_id ||
      !pincodeMapping.country_id
    ) {
      return res.status(404).json({
        success: false,
        message: "Location details not found for this PIN code.",
      });
    }

    // STEP 10: Verify location status
    const city = pincodeMapping.city_id;
    const state = pincodeMapping.state_id;
    const country = pincodeMapping.country_id;

    if (!city.is_active || !state.is_active || !country.is_active) {
      return res.status(400).json({
        success: false,
        message: "This location is currently unavailable.",
      });
    }

    // STEP 11: Verify location references
    if (
      city.state_id.toString() !== state._id.toString() ||
      city.country_id.toString() !== country._id.toString() ||
      state.country_id.toString() !== country._id.toString()
    ) {
      return res.status(409).json({
        success: false,
        message: "PIN code location mapping is inconsistent.",
      });
    }

    // STEP 12: Start transaction
    session = await mongoose.startSession();

    let savedAddressId = null;

    await session.withTransaction(async () => {
      // STEP 1: Find the authenticated customer's profile
      const customerProfile = await CustomerProfile.findOne({
        userId,
      }).session(session);

      if (!customerProfile) {
        const error = new Error("Customer profile not found.");
        error.statusCode = 404;
        throw error;
      }

      // STEP 2: Atomically reserve one address slot
      const updateResult = await CustomerProfile.updateOne(
        {
          _id: customerProfile._id,
          address_count: { $gte: 0, $lt: 5 },
        },
        {
          $inc: { address_count: 1 },
        },
        { session },
      );

      console.log("Address count update result:", updateResult);

      if (updateResult.matchedCount !== 1) {
        const error = new Error("You can add a maximum of 5 addresses.");
        error.statusCode = 409;
        throw error;
      }

      // STEP 3: Read the updated count
      const updatedProfile = await CustomerProfile.findById(
        customerProfile._id,
      ).session(session);

      if (!updatedProfile) {
        throw new Error("Updated customer profile not found.");
      }

      console.log("Updated address count:", updatedProfile.address_count);

      // STEP 4: Determine whether this is the first address
      const isDefault = updatedProfile.address_count === 1;

      // STEP 5: Create the address
      const [address] = await CustomerAddress.create(
        [
          {
            customer_id: updatedProfile._id,
            label: normalizedLabel,
            address_line1: normalizedAddress,
            address_line2: address_line2?.trim() || null,
            landmark: landmark?.trim() || null,
            city_id: city._id,
            postal_code: normalizedPostalCode,
            is_default: isDefault,
          },
        ],
        { session },
      );

      savedAddressId = address._id;
    });

    // STEP 13: Fetch saved address with location details
    const savedAddress = await CustomerAddress.findById(savedAddressId)
      .populate({
        path: "city_id",
        select: "city_name state_id country_id",
        populate: [
          {
            path: "state_id",
            select: "state_name country_id",
          },
          {
            path: "country_id",
            select: "country_name country_code",
          },
        ],
      })
      .lean();

    if (!savedAddress) {
      return res.status(500).json({
        success: false,
        message: "Address was created but could not be retrieved.",
      });
    }

    // STEP 14: Success response
    return res.status(201).json({
      success: true,
      message: "Address added successfully.",
      data: {
        address: savedAddress,
      },
    });
  } catch (error) {
    console.error("Add customer address error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A conflicting address record already exists.",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Failed to add customer address.",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

export const makeDefaultCustomerAddress = async (req, res) => {
  let session;
  try {
    // STEP 1: Get authenticated user
    const userId = req.user?.id;
    const userType = req.user?.user?.user_type;
    console.log("user id", userId)

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // STEP 2: Check customer role
    if (userType !== "CUSTOMER") {
      return res.status(403).json({
        success: false,
        message: "Only customers can change their default address.",
      });
    }

    // STEP 3: Get address ID from URL
    const { addressId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address ID.",
      });
    }

    // STEP 4: Find customer profile
    const customerProfile = await CustomerProfile.findOne({
      userId,
    }).select("_id");

    if (!customerProfile) {
      return res.status(404).json({
        success: false,
        message: "Customer profile not found.",
      });
    }
    console.log("customer profile", customerProfile)

    // console.log("addressid", addressId)
    // console.log("customer profile id", customerProfile._id.toString())
    // STEP 5: Find address and verify ownership
    const selectedAddress = await CustomerAddress.findOne({
      _id: addressId,
      customer_id: customerProfile._id.toString(),
    }).select("_id is_default");

    if (!selectedAddress) {
      return res.status(404).json({
        success: false,
        message: "Address not found.",
      });
    }

    // STEP 6: Check if already default
    if (selectedAddress.is_default) {
      const currentAddress = await CustomerAddress.findById(addressId)
        .populate({
          path: "city_id",
          select: "city_name state_id country_id",
          populate: [
            {
              path: "state_id",
              select: "state_name country_id",
            },
            {
              path: "country_id",
              select: "country_name country_code",
            },
          ],
        })
        .lean();

      return res.status(200).json({
        success: true,
        message: "This address is already your default address.",
        data: {
          address: currentAddress,
        },
      });
    }

    // STEP 7: Start transaction
    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      // STEP 8: Remove default status from existing address
      await CustomerAddress.updateMany(
        {
          customer_id: customerProfile._id,
          is_default: true,
        },
        {
          $set: { is_default: false },
        },
        { session },
      );

      // STEP 9: Make selected address the default
      const updateResult = await CustomerAddress.updateOne(
        {
          _id: addressId,
          customer_id: customerProfile._id,
        },
        {
          $set: { is_default: true },
        },
        { session },
      );

      if (updateResult.matchedCount !== 1) {
        const error = new Error("Unable to set this address as default.");
        error.statusCode = 404;
        throw error;
      }
    });

    // STEP 10: Fetch updated address
    const updatedAddress = await CustomerAddress.findOne({
      _id: addressId,
      customer_id: customerProfile._id,
    })
      .populate({
        path: "city_id",
        select: "city_name state_id country_id",
        populate: [
          {
            path: "state_id",
            select: "state_name country_id",
          },
          {
            path: "country_id",
            select: "country_name country_code",
          },
        ],
      })
      .lean();

    if (!updatedAddress) {
      return res.status(404).json({
        success: false,
        message: "Updated address not found.",
      });
    }

    // STEP 11: Success response
    return res.status(200).json({
      success: true,
      message: "Default address updated successfully.",
      data: {
        address: updatedAddress,
      },
    });
  } catch (error) {
    console.error("Make default address error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A default address already exists for this customer.",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Failed to update default address.",
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};


export const deleteCustomerAddress = async (req, res) => {
  let session;

  try {
    // STEP 1: Get authenticated user
    const userId = req.user?.id;
    const userType = req.user?.user?.user_type;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // STEP 2: Check customer role
    if (userType !== "CUSTOMER") {
      return res.status(403).json({
        success: false,
        message: "Only customers can delete customer addresses.",
      });
    }

    // STEP 3: Get address ID from URL
    const { addressId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid address ID.",
      });
    }

    // STEP 4: Start transaction
    session = await mongoose.startSession();

    let deletedAddressId = null;
    let newDefaultAddressId = null;

    await session.withTransaction(async () => {

      // STEP 1: Find customer profile
      const customerProfile = await CustomerProfile.findOne({
        userId,
      })
        .select("_id address_count")
        .session(session);

      if (!customerProfile) {
        const error = new Error("Customer profile not found.");
        error.statusCode = 404;
        throw error;
      }

      // STEP 2: Find address and verify ownership
      const address = await CustomerAddress.findOne({
        _id: addressId,
        customer_id: customerProfile._id.toString(),
      })
        .select("_id is_default")
        .session(session);

      if (!address) {
        const error = new Error("Address not found.");
        error.statusCode = 404;
        throw error;
      }

      // STEP 3: Check whether the address is default
      const wasDefault = address.is_default;

      // STEP 4: Delete the address
      const deleteResult = await CustomerAddress.deleteOne(
        {
          _id: address._id,
          customer_id: customerProfile._id,
        },
        { session },
      );

      if (deleteResult.deletedCount !== 1) {
        const error = new Error("Unable to delete the address.");
        error.statusCode = 409;
        throw error;
      }

      deletedAddressId = address._id;

      // STEP 5: Decrease address count
      const updateResult = await CustomerProfile.updateOne(
        {
          _id: customerProfile._id,
          address_count: { $gt: 0 },
        },
        {
          $inc: { address_count: -1 },
        },
        { session },
      );
      console.log("update result", updateResult)

      if (updateResult.matchedCount !== 1) {
        const error = new Error(
          "Customer address count is inconsistent. Please contact support.",
        );
        error.statusCode = 409;
        throw error;
      }

      // STEP 6: If deleted address was default,
      // make another saved address the default
      if (wasDefault) {

        const nextDefaultAddress = await CustomerAddress.findOne({
          customer_id: customerProfile._id,
        })
          .sort({ created_at: -1, _id: -1 })
          .session(session);

        if (nextDefaultAddress) {

          const defaultUpdateResult = await CustomerAddress.updateOne(
            {
              _id: nextDefaultAddress._id,
              customer_id: customerProfile._id,
            },
            {
              $set: { is_default: true },
            },
            { session },
          );

          if (defaultUpdateResult.matchedCount !== 1) {
            throw new Error("Unable to assign a new default address.");
          }

          newDefaultAddressId = nextDefaultAddress._id;
        }
      }
    });

    // STEP 7: Success response
    return res.status(200).json({
      success: true,
      message: "Address deleted successfully.",
      data: {
        deleted_address_id: deletedAddressId,
        new_default_address_id: newDefaultAddressId,
      },
    });

  } catch (error) {
    console.error("Delete customer address error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A conflicting address record already exists.",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Failed to delete customer address.",
    });

  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

