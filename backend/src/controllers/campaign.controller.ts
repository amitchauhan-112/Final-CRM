import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { buildUploadUrl, filePathFromUploadUrl, deleteUploadedFile } from '../middleware/upload.js';
import { isWholeAmount, WHOLE_AMOUNT_ERROR } from '../utils/amountValidation.js';
import { reconcileCampaignEmployees } from '../services/lead.service.js';
import { createNotification } from '../services/notification.service.js';

// keywords is stored as JSON string in DB; parse before sending to client
function parseCampaign(c: any) {
  try { return { ...c, keywords: JSON.parse(c.keywords || '[]') }; }
  catch { return { ...c, keywords: [] }; }
}

export const getCampaigns = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Record<string, unknown> = {
      archivedAt: null,  // exclude archived campaigns from main list
    };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { destination: { contains: search as string } },
      ];
    }

    if (req.user?.role === 'EMPLOYEE') {
      where.employees = { some: { userId: req.user.id } };
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          employees: { include: { user: { select: { id: true, name: true, email: true } } } },
          _count: { select: { leads: { where: { deletedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.campaign.count({ where }),
    ]);

    res.json({
      success: true,
      data: campaigns.map(parseCampaign),
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getCampaignById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        employees: { include: { user: { select: { id: true, name: true, email: true } } } },
        leads: {
          where: { deletedAt: null },
          include: { assignedTo: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: { select: { leads: { where: { deletedAt: null } } } },
      },
    });

    if (!campaign) {
      res.status(404).json({ success: false, error: 'Campaign not found' });
      return;
    }
    res.json({ success: true, data: parseCampaign(campaign) });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const createCampaign = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      name, destination, description, status, startDate, endDate,
      targetLeads, budget, whatsappNumber, instagramAdId,
      utmSource, utmCampaign, keywords, employeeIds,
    } = req.body;
    if (!isWholeAmount(budget)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    const campaign = await prisma.campaign.create({
      data: {
        name, destination, description,
        status: status || 'ACTIVE',
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        targetLeads: targetLeads ? Number(targetLeads) : undefined,
        budget: budget ? Number(budget) : undefined,
        whatsappNumber, instagramAdId, utmSource, utmCampaign,
        keywords: JSON.stringify(Array.isArray(keywords) ? keywords : []),
        employees: employeeIds?.length
          ? { create: employeeIds.map((uid: string) => ({ userId: uid })) }
          : undefined,
      },
      include: {
        employees: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { leads: { where: { deletedAt: null } } } },
      },
    });

    res.status(201).json({ success: true, data: parseCampaign(campaign) });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateCampaign = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { employeeIds, keywords, ...rest } = req.body;
    if (!isWholeAmount(rest.budget)) { res.status(400).json({ success: false, error: WHOLE_AMOUNT_ERROR }); return; }

    await prisma.campaign.update({
      where: { id },
      data: {
        ...rest,
        keywords: JSON.stringify(Array.isArray(keywords) ? keywords : []),
        startDate: rest.startDate ? new Date(rest.startDate) : undefined,
        endDate: rest.endDate ? new Date(rest.endDate) : undefined,
        targetLeads: rest.targetLeads ? Number(rest.targetLeads) : undefined,
        budget: rest.budget ? Number(rest.budget) : undefined,
      },
    });

    if (employeeIds !== undefined) {
      const oldEmployeeIds = (await prisma.campaignEmployee.findMany({
        where: { campaignId: id },
        orderBy: { assignedAt: 'asc' },
        select: { userId: true },
      })).map((a) => a.userId);

      await prisma.campaignEmployee.deleteMany({ where: { campaignId: id } });
      if (employeeIds.length > 0) {
        // Inserted one at a time (not createMany) so assignedAt is strictly
        // increasing in the order the admin picked them — that order is
        // what assignEmployeeForCampaign() ties-break on when leads are
        // otherwise evenly split. Duplicate ids in the input are just
        // skipped (already deleted above, so nothing to conflict with
        // except a repeat within this same list).
        const seen = new Set<string>();
        for (const uid of employeeIds as string[]) {
          if (seen.has(uid)) continue;
          seen.add(uid);
          await prisma.campaignEmployee.create({ data: { campaignId: id, userId: uid } });
        }
      }

      // Reconciles existing leads against the roster change — see
      // reconcileCampaignEmployees() in lead.service.ts for the exact rules
      // (first-ever assignment / employee added / employee removed). New
      // leads follow the same spirit via assignEmployeeForCampaign()'s
      // "since the roster last changed" rotation.
      const movedCounts = await reconcileCampaignEmployees(id, oldEmployeeIds, employeeIds);
      if (movedCounts.size > 0) {
        const campaignName = (await prisma.campaign.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'this campaign';
        await Promise.all(
          Array.from(movedCounts.entries()).map(([employeeId, count]) =>
            createNotification(
              employeeId,
              'NEW_LEAD_ASSIGNED',
              'Campaign Leads Assigned',
              `${count} lead${count === 1 ? '' : 's'} from campaign "${campaignName}" ${count === 1 ? 'has' : 'have'} been assigned to you`,
            )
          )
        );
      }
    }

    const updated = await prisma.campaign.findUnique({
      where: { id },
      include: {
        employees: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { leads: { where: { deletedAt: null } } } },
      },
    });

    res.json({ success: true, data: parseCampaign(updated) });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteCampaign = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await prisma.campaign.update({ where: { id }, data: { status: 'COMPLETED' } });
    res.json({ success: true, message: 'Campaign marked as completed' });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const getCampaignStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.organizationId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgWhere: any = orgId ? { organizationId: orgId } : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campaigns: any[] = await prisma.campaign.findMany({
      where: orgWhere,
      include: {
        leads: {
          where: { deletedAt: null } as any,
          select: { status: true },
        },
        _count: { select: { leads: { where: { deletedAt: null } as any } } },
      },
    });

    const stats = campaigns.map((c: any) => {
      const total: number = c.leads.length;
      const confirmed: number = c.leads.filter((l: any) => l.status === 'CONFIRMED').length;
      const lost: number = c.leads.filter((l: any) => l.status === 'LOST').length;
      const pending: number = c.leads.filter((l: any) => !['CONFIRMED', 'LOST'].includes(l.status)).length;
      const conversionRate = total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0';
      return {
        id: c.id, name: c.name, destination: c.destination, status: c.status,
        total, confirmed, lost, pending,
        active: total - confirmed - lost,
        conversionRate, targetLeads: c.targetLeads,
      };
    });

    res.json({ success: true, data: stats });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const exportCampaigns = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.organizationId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgWhere: any = orgId ? { organizationId: orgId } : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campaigns: any[] = await prisma.campaign.findMany({
      where: orgWhere,
      include: {
        leads: { where: { deletedAt: null } as any, select: { status: true } },
        employees: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = campaigns.map((c: any) => {
      const total: number = c.leads.length;
      const confirmed: number = c.leads.filter((l: any) => l.status === 'CONFIRMED').length;
      const lost: number = c.leads.filter((l: any) => l.status === 'LOST').length;
      return {
        Name: c.name,
        Destination: c.destination,
        Status: c.status,
        'Total Leads': total,
        Confirmed: confirmed,
        Lost: lost,
        Pending: total - confirmed - lost,
        'Conversion %': total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0',
        Budget: c.budget ?? '',
        'Target Leads': c.targetLeads ?? '',
        Employees: c.employees.map((e: any) => e.user.name).join(', '),
        'Start Date': c.startDate ? c.startDate.toISOString().slice(0, 10) : '',
        'End Date': c.endDate ? c.endDate.toISOString().slice(0, 10) : '',
        'Created At': c.createdAt.toISOString().slice(0, 10),
      };
    });

    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Campaign Notes ───────────────────────────────────────────────────────────

const noteInclude = {
  author: { select: { id: true, name: true, avatar: true, role: true } },
};

export const getCampaignNotes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const notes = await prisma.campaignNote.findMany({
      where: { campaignId: id },
      include: noteInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: notes });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const createCampaignNote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content?.trim()) { res.status(400).json({ success: false, error: 'Content is required' }); return; }
    const note = await prisma.campaignNote.create({
      data: { content: content.trim(), campaignId: id, authorId: req.user!.id },
      include: noteInclude,
    });
    res.status(201).json({ success: true, data: note });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const updateCampaignNote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { noteId } = req.params;
    const { content } = req.body;
    const existing = await prisma.campaignNote.findUnique({ where: { id: noteId } });
    if (!existing) { res.status(404).json({ success: false, error: 'Note not found' }); return; }
    if (existing.authorId !== req.user!.id && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Not authorized' }); return;
    }
    const note = await prisma.campaignNote.update({
      where: { id: noteId },
      data: { content: content.trim(), isEdited: true },
      include: noteInclude,
    });
    res.json({ success: true, data: note });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteCampaignNote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { noteId } = req.params;
    const existing = await prisma.campaignNote.findUnique({ where: { id: noteId } });
    if (!existing) { res.status(404).json({ success: false, error: 'Note not found' }); return; }
    if (existing.authorId !== req.user!.id && req.user?.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Not authorized' }); return;
    }
    await prisma.campaignNote.delete({ where: { id: noteId } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Campaign Attachments ────────────────────────────────────────────────────

export const getCampaignAttachments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const attachments = await prisma.campaignAttachment.findMany({
      where: { campaignId: id },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: attachments });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const uploadCampaignAttachment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const file = (req as any).file;
    if (!file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }

    const fileUrl = buildUploadUrl(file);
    const attachment = await prisma.campaignAttachment.create({
      data: {
        name: file.originalname,
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        campaignId: id,
        uploadedById: req.user!.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: attachment });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── Archived Campaigns ───────────────────────────────────────────────────────

export const getArchivedCampaigns = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const orgId = req.user?.organizationId;
    const where: Record<string, unknown> = { archivedAt: { not: null } };
    if (orgId) where.organizationId = orgId;

    const campaigns = await prisma.campaign.findMany({
      where,
      select: {
        id: true, name: true, destination: true, metaCampaignId: true,
        archivedAt: true, archiveS3Key: true, createdAt: true,
        _count: { select: { leads: true } },
      },
      orderBy: { archivedAt: 'desc' },
      take: 100,
    } as any);

    res.json({ success: true, data: campaigns });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const deleteCampaignAttachment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { attachmentId } = req.params;
    const attachment = await prisma.campaignAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) { res.status(404).json({ success: false, error: 'Attachment not found' }); return; }

    // Delete file from storage
    await deleteUploadedFile(filePathFromUploadUrl(attachment.fileUrl)).catch(() => {});

    await prisma.campaignAttachment.delete({ where: { id: attachmentId } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
