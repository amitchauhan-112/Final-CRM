// One-time migration: the Lead workspace's "Notes" tab (a single free-text
// Lead.notes field) has been merged into the "Comments" tab (LeadComment,
// which already supports authorship, timestamps, editing and threading).
// This carries forward any existing note text as the first comment on its
// lead, so nothing written before the merge is lost. Safe to re-run — it
// skips leads that already have a comment with identical content.
import prisma from '../lib/prisma.js';

async function main() {
  const leads = await prisma.lead.findMany({
    where: { notes: { not: null } },
    select: { id: true, notes: true, updatedAt: true, assignedToId: true, organizationId: true },
  });

  const activeLeads = leads.filter((l) => l.notes && l.notes.trim().length > 0);
  console.log(`Found ${activeLeads.length} lead(s) with existing notes to migrate.`);

  let migrated = 0;
  let skipped = 0;

  for (const lead of activeLeads) {
    const existingMatch = await prisma.leadComment.findFirst({
      where: { leadId: lead.id, content: lead.notes! },
    });
    if (existingMatch) { skipped++; continue; }

    let authorId = lead.assignedToId;
    if (!authorId) {
      const fallbackAdmin = await prisma.user.findFirst({
        where: { role: 'ADMIN', ...(lead.organizationId ? { organizationId: lead.organizationId } : {}) },
        select: { id: true },
      });
      authorId = fallbackAdmin?.id ?? null;
    }
    if (!authorId) { console.warn(`  ! Skipping lead ${lead.id} — no assignee or admin found to attribute the note to.`); skipped++; continue; }

    await prisma.leadComment.create({
      data: {
        leadId: lead.id,
        authorId,
        content: lead.notes!,
        createdAt: lead.updatedAt,
        updatedAt: lead.updatedAt,
      },
    });
    migrated++;
  }

  console.log(`Done. Migrated: ${migrated}, skipped (already present or no attributable author): ${skipped}.`);
}

main()
  .catch((e) => { console.error('Migration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
