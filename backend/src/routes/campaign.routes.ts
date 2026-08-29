import { Router } from 'express';
import {
  getCampaigns, getCampaignById, createCampaign, updateCampaign, deleteCampaign,
  getCampaignStats, exportCampaigns,
  getCampaignNotes, createCampaignNote, updateCampaignNote, deleteCampaignNote,
  getCampaignAttachments, uploadCampaignAttachment, deleteCampaignAttachment,
  getArchivedCampaigns,
} from '../controllers/campaign.controller.js';
import { getArchiveDownload } from './metaConnection.routes.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { createUpload } from '../middleware/upload.js';
const upload = createUpload('campaign-attachments');

const router = Router();

router.use(authenticate);
router.get('/', getCampaigns);
router.get('/archived', requireAdmin, getArchivedCampaigns);
router.get('/stats', requireAdmin, getCampaignStats);
router.get('/export', requireAdmin, exportCampaigns);
router.get('/:id/archive-download', requireAdmin, getArchiveDownload);
router.get('/:id', getCampaignById);
router.post('/', requireAdmin, createCampaign);
router.put('/:id', requireAdmin, updateCampaign);
router.delete('/:id', requireAdmin, deleteCampaign);

// Notes
router.get('/:id/notes', getCampaignNotes);
router.post('/:id/notes', createCampaignNote);
router.put('/:id/notes/:noteId', updateCampaignNote);
router.delete('/:id/notes/:noteId', deleteCampaignNote);

// Attachments
router.get('/:id/attachments', getCampaignAttachments);
router.post('/:id/attachments', upload.single('file'), uploadCampaignAttachment);
router.delete('/:id/attachments/:attachmentId', deleteCampaignAttachment);

export default router;
