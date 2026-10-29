import { Readable } from "node:stream";
import User from "../models/User.js";
import cloudinary from "../config/cloudinary.js";

console.log("Cloudinary configuration check:", {
  cloudNameLoaded: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
  apiKeyLoaded: Boolean(process.env.CLOUDINARY_API_KEY),
  apiSecretLoaded: Boolean(process.env.CLOUDINARY_API_SECRET),
});

// Helper: find the authenticated customer
const findCustomer = async (userId) => {
  return User.findOne({
    _id: userId,
    user_type: "CUSTOMER",
    is_active: true,
  });
};

// Helper: upload image buffer to Cloudinary
const uploadToCloudinary = (buffer, userId) => {
  return new Promise((resolve, reject) => {
    const publicId = `customer_${userId}_${Date.now()}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "kaamdaar/customer-avatars",
        public_id: publicId,
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(new Error("Cloudinary did not return an upload result."));
        }

        resolve(result);
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });
};

// Helper: delete an image from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;

  return cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
};

// 1. GET CUSTOMER AVATAR
export const getCustomerAvatar = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const customer = await findCustomer(userId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Active customer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer profile picture fetched successfully.",
      data: {
        profile_image: customer.profile_image ?? {
          url: null,
          public_id: null,
        },
      },
    });
  } catch (error) {
    console.error("Get customer avatar error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile picture.",
    });
  }
};

// 2. UPLOAD OR REPLACE CUSTOMER AVATAR
export const updateCustomerAvatar = async (req, res) => {
  let newPublicId = null;
  let savedSuccessfully = false;

  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image to upload.",
      });
    }

    const customer = await findCustomer(userId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Active customer not found.",
      });
    }

    // Remember the existing Cloudinary image
    const oldPublicId = customer.profile_image?.public_id ?? null;

    // Upload the new image first
    const result = await uploadToCloudinary(req.file.buffer, userId);

    newPublicId = result.public_id;

    // Update MongoDB only after Cloudinary upload succeeds
    customer.profile_image = {
      url: result.secure_url,
      public_id: result.public_id,
    };

    await customer.save();

    savedSuccessfully = true;

    // Delete the previous image after the database update succeeds
    if (oldPublicId && oldPublicId !== newPublicId) {
      try {
        await deleteFromCloudinary(oldPublicId);
      } catch (cleanupError) {
        // The new image is already saved. Do not fail the request
        // just because cleanup of the old image failed.
        console.error(
          "Failed to delete previous Cloudinary avatar:",
          cleanupError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture uploaded successfully.",
      data: {
        profile_image: {
          url: result.secure_url,
          public_id: result.public_id,
        },
      },
    });
  } catch (error) {
    console.error("Update customer avatar error:", error);

    // If the new image was uploaded but saving MongoDB failed,
    // clean up only the newly uploaded Cloudinary image.
    if (newPublicId && !savedSuccessfully) {
      try {
        await deleteFromCloudinary(newPublicId);
      } catch (cleanupError) {
        console.error(
          "Failed to clean up new Cloudinary avatar:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to upload profile picture.",
    });
  }
};

// 3. DELETE CUSTOMER AVATAR
export const deleteCustomerAvatar = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const customer = await findCustomer(userId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Active customer not found.",
      });
    }

    const oldPublicId = customer.profile_image?.public_id ?? null;

    // No existing picture: nothing to remove
    if (!customer.profile_image?.url && !oldPublicId) {
      return res.status(200).json({
        success: true,
        message: "Customer does not have a profile picture.",
        data: {
          profile_image: {
            url: null,
            public_id: null,
          },
        },
      });
    }

    // Clear MongoDB first
    customer.profile_image = {
      url: null,
      public_id: null,
    };

    await customer.save();

    // Then remove the old image from Cloudinary
    if (oldPublicId) {
      try {
        const result = await deleteFromCloudinary(oldPublicId);

        if (result?.result === "not found") {
          console.warn("Avatar was already absent from Cloudinary.");
        }
      } catch (cleanupError) {
        // MongoDB is already cleared, so don't report the deletion
        // as completely failed just because Cloudinary cleanup failed.
        console.error(
          "Failed to delete avatar from Cloudinary:",
          cleanupError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture removed successfully.",
      data: {
        profile_image: {
          url: null,
          public_id: null,
        },
      },
    });
  } catch (error) {
    console.error("Delete customer avatar error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove profile picture.",
    });
  }
};