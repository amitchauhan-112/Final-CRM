import multer from 'multer';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(UPLOAD_DIR);

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-zip-compressed',
  'text/csv',
];

/**
 * Creates a multer instance scoped to a named subfolder under UPLOAD_DIR, so
 * files land grouped by what they are (vendor documents, payment proofs,
 * campaign attachments, ...) instead of all mixed into one flat folder.
 * Filenames keep the original name (sanitized) + a timestamp prefix, so a
 * folder listing alone is enough to identify what each file is.
 */
export function createUpload(category: string) {
  const dir = path.join(UPLOAD_DIR, category);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, `${Date.now()}-${base}${ext}`);
    },
  });

  return multer({
    storage,
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

/** Builds the public /api/uploads/... URL for an uploaded file, preserving its category subfolder. */
export function buildUploadUrl(file: Express.Multer.File): string {
  const rel = path.relative(UPLOAD_DIR, file.path).split(path.sep).join('/');
  return `/api/uploads/${rel}`;
}

/** Resolves a stored /api/uploads/... URL back to its real path on disk, subfolder included. */
export function filePathFromUploadUrl(fileUrl: string): string {
  const rel = fileUrl.replace(/^\/api\/uploads\//, '');
  return path.join(UPLOAD_DIR, rel);
}

export const UPLOAD_DIR_PATH = UPLOAD_DIR;
