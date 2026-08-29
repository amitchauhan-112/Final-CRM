import { Router } from 'express';
import { getSignedDownloadUrl } from '../middleware/upload.js';

const router = Router();

// Replaces the old express.static('/api/uploads', ...) local-disk serving —
// files now live in Supabase Storage, so a request for a stored fileUrl
// (still shaped like /api/uploads/{category}/{filename}, unchanged from
// before) gets redirected to a short-lived signed URL instead.
router.get('/:category/:filename', async (req, res) => {
  try {
    const key = `${req.params.category}/${req.params.filename}`;
    const url = await getSignedDownloadUrl(key);
    res.redirect(url);
  } catch {
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

export default router;
