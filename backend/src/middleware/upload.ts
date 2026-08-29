import multer from 'multer';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || '';

// Supabase Storage exposes an S3-compatible API — same SDK already used
// elsewhere in this codebase (campaignArchive.service.ts, metaConnection.controller.ts)
// for real AWS S3, just pointed at Supabase's endpoint instead.
const s3 = new S3Client({
  region: process.env.SUPABASE_S3_REGION || 'us-east-1',
  endpoint: process.env.SUPABASE_S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY || '',
  },
});

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-zip-compressed',
  'text/csv',
];

/**
 * Multer storage engine that uploads straight to Supabase Storage instead of
 * local disk — local disk doesn't persist across serverless invocations.
 * Sets `file.path` to "{category}/{filename}" (the storage key) so
 * buildUploadUrl/filePathFromUploadUrl below, and every existing controller
 * call site that reads `req.file`, keep working unchanged.
 */
class SupabaseStorageEngine implements multer.StorageEngine {
  constructor(private category: string) {}

  _handleFile(
    _req: any,
    file: Express.Multer.File,
    cb: (error?: any, info?: Partial<Express.Multer.File>) => void,
  ): void {
    const chunks: Buffer[] = [];
    file.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    file.stream.on('error', (err) => cb(err));
    file.stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${Date.now()}-${base}${ext}`;
      const key = `${this.category}/${filename}`;

      s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.mimetype,
      }))
        .then(() => cb(null, { path: key, size: buffer.length } as Partial<Express.Multer.File>))
        .catch((err) => cb(err));
    });
  }

  _removeFile(
    _req: any,
    file: Express.Multer.File,
    cb: (error: Error | null) => void,
  ): void {
    s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: file.path }))
      .then(() => cb(null))
      .catch((err) => cb(err));
  }
}

/**
 * Creates a multer instance scoped to a named subfolder (category), so files
 * land grouped by what they are (vendor documents, payment proofs, campaign
 * attachments, ...) inside the Supabase Storage bucket instead of all mixed
 * into one flat prefix. Filenames keep the original name (sanitized) + a
 * timestamp prefix, same as before.
 */
export function createUpload(category: string) {
  return multer({
    storage: new SupabaseStorageEngine(category),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type not allowed: ${file.mimetype}`));
      }
    },
  });
}

/** Builds the servable /api/uploads/... URL for an uploaded file, preserving its category subfolder. */
export function buildUploadUrl(file: Express.Multer.File): string {
  return `/api/uploads/${file.path}`;
}

/** Resolves a stored /api/uploads/... URL back to its Supabase Storage key. */
export function filePathFromUploadUrl(fileUrl: string): string {
  return fileUrl.replace(/^\/api\/uploads\//, '');
}

/** Deletes a file from Supabase Storage, given the key from filePathFromUploadUrl. */
export async function deleteUploadedFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Uploads an already-built buffer (e.g. a generated PDF) to Supabase Storage
 * under "{category}/{filename}" and returns the same /api/uploads/... URL
 * shape used for form-uploaded files, so it can be stored/served identically.
 */
export async function uploadGeneratedFile(category: string, filename: string, body: Buffer, contentType: string): Promise<string> {
  const key = `${category}/${filename}`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return `/api/uploads/${key}`;
}

/** Generates a short-lived signed URL for a stored file, given its key. Used by the /api/uploads/* download route. */
export async function getSignedDownloadUrl(key: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

/** Total bytes stored in the uploads bucket — used by the System Health "storage used" stat. */
export async function getStorageUsageBytes(): Promise<number> {
  let total = 0;
  let continuationToken: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: continuationToken }));
    total += (page.Contents ?? []).reduce((sum, obj) => sum + (obj.Size ?? 0), 0);
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return total;
}
