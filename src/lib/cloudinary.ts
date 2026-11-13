import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

// Auto-load .env for standalone script contexts if not already loaded by Next.js
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // Ignore in production environments where env is injected externally
  }
}

function initCloudinary() {
  const cloudName =
    process.env.ClOUDE_NAME ||
    process.env.CLOUDE_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
}

export { cloudinary };

/**
 * Upload a file Buffer directly to Cloudinary using upload_stream.
 * Supports all image formats (JPG, PNG, WebP, GIF, SVG, BMP, TIFF, AVIF, HEIC),
 * PDF, Word documents, and other file types using resource_type: 'auto'.
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  options: {
    folder?: string;
    filename?: string;
    resourceType?: 'auto' | 'image' | 'raw';
  } = {}
): Promise<UploadApiResponse> {
  const client = initCloudinary();
  const { folder = 'manpower_erp', filename, resourceType = 'auto' } = options;

  return new Promise((resolve, reject) => {
    const uploadStream = client.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: filename ? filename.replace(/\.[^/.]+$/, '') : undefined,
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Cloudinary upload returned empty result'));
        }
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
}
