const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

// Storage configuration automatically infers credentials from Google ADC
// (Application Default Credentials) when running locally or on GCP.
// If GOOGLE_APPLICATION_CREDENTIALS env variable is set, it will use that credentials file.
// NOTE: projectId and bucketName are read lazily (at call time) to avoid crashing when
// running locally without a .env before GCP has been configured.
let _storage = null;
function getStorage() {
  if (!_storage) {
    _storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
  }
  return _storage;
}

function getBucket() {
  const bucketName = process.env.GCS_BUCKET_NAME;
  return getStorage().bucket(bucketName);
}

/**
 * Uploads a file buffer to Google Cloud Storage and returns the public link
 * @param {Buffer} fileBuffer The file buffer to upload
 * @param {string} originalName The original filename
 * @param {string} mimeType The mime type (e.g., image/jpeg)
 */
async function uploadImage(fileBuffer, originalName, mimeType) {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME is not configured in environment variables.');
  }

  // Sanitize name and create unique path
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.]/g, '_');
  const uniqueName = `recipes/${Date.now()}-${sanitizedName}`;
  const file = getBucket().file(uniqueName);

  console.log(`Uploading ${uniqueName} to GCS bucket: ${bucketName}...`);

  return new Promise((resolve, reject) => {
    const stream = file.createWriteStream({
      metadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000',
      },
      resumable: false,
    });

    stream.on('error', (err) => {
      console.error('Error writing file stream to GCS:', err);
      reject(err);
    });

    stream.on('finish', () => {
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${uniqueName}`;
      console.log(`Upload complete. File available at: ${publicUrl}`);
      resolve(publicUrl);
    });

    stream.end(fileBuffer);
  });
}

/**
 * Checks GCS connectivity
 */
async function checkBucketConnectivity() {
  const bucketName = process.env.GCS_BUCKET_NAME;
  try {
    if (!bucketName) {
      return { status: 'Unconfigured', message: 'GCS_BUCKET_NAME not set' };
    }
    const [exists] = await getBucket().exists();
    if (!exists) {
      return { status: 'Error', message: `Bucket ${bucketName} does not exist.` };
    }
    return { status: 'OK', message: `Connected. Bucket ${bucketName} exists.` };
  } catch (error) {
    console.error('GCS bucket connection failed:', error.message);
    return { status: 'Error', message: error.message };
  }
}

module.exports = {
  uploadImage,
  checkBucketConnectivity,
  getStorage
};
