import cloudinary from "../config/cloudinary.js";


export const uploadImageToCloudinary = (
  fileBuffer,
  folder = "kaamdaar/services"
) => {
  return new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(fileBuffer)) {
      return reject(new Error("Invalid image buffer."));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(
            new Error("Cloudinary upload failed.")
          );
        }

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    uploadStream.end(fileBuffer);
  });
};



export const deleteImageFromCloudinary = async (publicId) => {
  if (!publicId) {
    throw new Error("Cloudinary public_id is required.");
  }

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });

  if (!["ok", "not found"].includes(result.result)) {
    throw new Error(
      `Cloudinary image deletion failed: ${result.result}`
    );
  }

  return result;
};



export const uploadMultipleImagesToCloudinary = async (
  files,
  folder = "kaamdaar/services"
) => {
  const uploadedImages = [];

  try {
    for (const file of files) {
      const uploadedImage = await uploadImageToCloudinary(
        file.buffer,
        folder
      );

      uploadedImages.push(uploadedImage);
    }

    return uploadedImages;
  } catch (error) {
    // Clean up images uploaded before the failure
    const cleanupResults = await Promise.allSettled(
      uploadedImages.map((image) =>
        deleteImageFromCloudinary(image.public_id)
      )
    );

    cleanupResults.forEach((result) => {
      if (result.status === "rejected") {
        console.error(
          "Cloudinary cleanup failed:",
          result.reason
        );
      }
    });

    throw error;
  }
};
