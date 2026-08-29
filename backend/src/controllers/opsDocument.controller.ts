import { Response } from 'express';
import fs from 'fs';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { emitOperationsUpdated } from '../services/notification.service.js';
import { buildUploadUrl, filePathFromUploadUrl } from '../middleware/upload.js';

const orgId = (req: AuthenticatedRequest) => req.user?.organizationId ?? null;

export const uploadDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { departureId } = req.params;
    const departure = await prisma.departure.findFirst({
      where: { id: departureId, ...(orgId(req) ? { organizationId: orgId(req) } : {}) },
    });
    if (!departure) { res.status(404).json({ success: false, error: 'Departure not found' }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ success: false, error: 'File is required' }); return; }

    const { type } = req.body;

    const document = await prisma.operationsDocument.create({
      data: {
        departureId,
        name: file.originalname,
        type: type || 'OTHER',
        fileUrl: buildUploadUrl(file),
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: req.user!.id,
      },
    });

    await prisma.activityLog.create({
      data: { action: 'Document Uploaded', details: `"${document.name}" uploaded for ${departure.destination}`, entityType: 'DEPARTURE', entityId: departureId, userId: req.user!.id },
    });
    emitOperationsUpdated(departureId);

    res.status(201).json({ success: true, data: document });
  } catch (e) {
    console.error('[operations] uploadDocument error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteDocument = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.operationsDocument.findUnique({ where: { id }, include: { departure: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Document not found' }); return; }
    if (orgId(req) && existing.departure.organizationId !== orgId(req)) { res.status(404).json({ success: false, error: 'Document not found' }); return; }

    await prisma.operationsDocument.delete({ where: { id } });

    const filePath = filePathFromUploadUrl(existing.fileUrl);
    fs.unlink(filePath, () => {});

    emitOperationsUpdated(existing.departureId);
    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('[operations] deleteDocument error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
