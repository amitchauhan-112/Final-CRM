import { Response } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { runMetaSync } from '../services/metaSync.service.js';
import { backfillLeadsForOrg } from '../services/metaLeadBackfill.service.js';
import logger from '../utils/logger.js';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });

function orgFilter(req: AuthenticatedRequest): Record<string, unknown> {
  return req.user?.organizationId ? { organizationId: req.user.organizationId } : {};
}

// ── Get connection status ─────────────────────────────────────────────────────

export const getMetaConnection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) { res.json({ success: true, data: null }); return; }

    const conn = await (prisma as any).metaConnection.findUnique({
      where: { organizationId: orgId },
    });

    if (!conn) { res.json({ success: true, data: null }); return; }

    // Never return raw token — derive last 4 chars only
    let tokenLastFour = '????';
    try {
      tokenLastFour = decrypt(conn.systemUserToken).slice(-4);
    } catch {
      // token decryption failed (key rotation?) — still return status
    }

    res.json({
      success: true,
      data: {
        id: conn.id,
        adAccountId: conn.adAccountId,
        pageId: conn.pageId,
        tokenLastFour,
        isActive: conn.isActive,
        lastSyncAt: conn.lastSyncAt,
        lastSyncError: conn.lastSyncError,
        lastLeadBackfillAt: conn.lastLeadBackfillAt,
        lastLeadBackfillResult: conn.lastLeadBackfillResult,
      },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Save / update connection ──────────────────────────────────────────────────

export const saveMetaConnection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) { res.status(400).json({ success: false, error: 'No organization attached to user' }); return; }

    const { adAccountId, pageId, systemUserToken } = req.body;

    if (!adAccountId?.trim()) {
      res.status(400).json({ success: false, error: 'adAccountId is required' });
      return;
    }
    if (!systemUserToken?.trim()) {
      res.status(400).json({ success: false, error: 'systemUserToken is required' });
      return;
    }

    let encryptedToken: string;
    try {
      encryptedToken = encrypt(systemUserToken.trim());
    } catch (e: any) {
      res.status(500).json({ success: false, error: `Encryption error: ${e.message}` });
      return;
    }

    const existing = await (prisma as any).metaConnection.findUnique({ where: { organizationId: orgId } });

    if (existing) {
      await (prisma as any).metaConnection.update({
        where: { organizationId: orgId },
        data: {
          adAccountId: adAccountId.trim(),
          pageId: pageId?.trim() || null,
          systemUserToken: encryptedToken,
          isActive: true,
          lastSyncError: null,
        },
      });
    } else {
      await (prisma as any).metaConnection.create({
        data: {
          organizationId: orgId,
          adAccountId: adAccountId.trim(),
          pageId: pageId?.trim() || null,
          systemUserToken: encryptedToken,
        },
      });
    }

    res.json({ success: true, message: 'Meta connection saved successfully' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Disconnect ────────────────────────────────────────────────────────────────

export const deleteMetaConnection = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) { res.status(400).json({ success: false, error: 'No organization' }); return; }

    await (prisma as any).metaConnection.deleteMany({ where: { organizationId: orgId } });
    res.json({ success: true, message: 'Meta connection removed' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Manual sync trigger ───────────────────────────────────────────────────────

export const triggerSync = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Respond immediately; run sync in background
    res.json({ success: true, message: 'Sync started' });
    runMetaSync().catch((err) => {
      logger.error(`[metaSync] Manual trigger failed: ${err?.response?.data?.error?.message || err?.message || 'Unknown error'}`);
    });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Historical lead backfill (one-off, separate from the per-minute campaign sync) ─

export const backfillLeads = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) { res.status(400).json({ success: false, error: 'No organization attached to user' }); return; }

    // Runs can take a while for large accounts (many forms x paginated leads),
    // so respond immediately and let the frontend poll GET / for the result.
    res.json({ success: true, message: 'Lead backfill started — check back in a minute for results' });
    backfillLeadsForOrg(orgId).catch((err) => {
      logger.error(`[metaLeadBackfill] Trigger failed for org ${orgId}: ${err?.response?.data?.error?.message || err?.message || 'Unknown error'}`);
    });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ── Presigned S3 download URL for archived campaign ──────────────────────────

export const getArchiveDownload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findFirst({
      where: { id, ...orgFilter(req) },
      select: { id: true, archiveS3Key: true, archivedAt: true } as any,
    });

    if (!campaign) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }

    const s3Key = (campaign as any).archiveS3Key;
    if (!s3Key) {
      res.status(404).json({ success: false, error: 'No archive found for this campaign' });
      return;
    }

    const bucket = process.env.ARCHIVE_S3_BUCKET;
    if (!bucket) {
      res.status(500).json({ success: false, error: 'ARCHIVE_S3_BUCKET not configured' });
      return;
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
      { expiresIn: 900 }, // 15-minute expiry
    );

    res.json({ success: true, data: { url, expiresIn: 900 } });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
