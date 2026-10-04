const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

function createObjectStorage(environment = process.env) {
  if (!environment.S3_BUCKET) return null;
  if (Boolean(environment.S3_ACCESS_KEY_ID) !== Boolean(environment.S3_SECRET_ACCESS_KEY))
    throw new Error('Both S3 credential fields must be configured together.');
  const client = new S3Client({
    region: environment.S3_REGION || 'auto',
    endpoint: environment.S3_ENDPOINT || undefined,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE === 'true',
    maxAttempts: 2,
    requestHandler: { requestTimeout: 10000, connectionTimeout: 5000 },
    credentials: environment.S3_ACCESS_KEY_ID
      ? {
          accessKeyId: environment.S3_ACCESS_KEY_ID,
          secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
  return {
    async put(key, media) {
      await client.send(
        new PutObjectCommand({
          Bucket: environment.S3_BUCKET,
          Key: key,
          Body: media.data,
          ContentType: media.type,
          CacheControl: 'private, no-store',
        }),
      );
    },
    async get(key) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: environment.S3_BUCKET, Key: key }),
      );
      return Buffer.from(await response.Body.transformToByteArray());
    },
  };
}
module.exports = { createObjectStorage };
