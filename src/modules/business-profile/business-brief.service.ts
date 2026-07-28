import { Injectable, Logger } from '@nestjs/common';
import { ModelRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';

@Injectable()
export class BusinessBriefService {
  private readonly logger = new Logger(BusinessBriefService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
  ) {}

  formatBriefForPrompt(
    brief: string | null | undefined,
    profile?: {
      id?: string;
      businessName?: string | null;
    },
  ): string {
    const name = profile?.businessName?.trim() || 'this business';
    const trimmed = (brief || '').trim();
    const scope = `SCOPE: This brief is ONLY for "${name}"${
      profile?.id ? ` (profile ${profile.id})` : ''
    }. Ignore any other businesses.`;

    if (!trimmed) {
      return `${scope}\n(No shared brief yet — learn durable facts about THIS business only.)`;
    }
    return `${scope}\n${trimmed}`;
  }

  /**
   * Fire-and-forget safe: merges durable facts from recent chat into THIS profile brief only.
   * Does not charge user credits. Failures are logged only.
   */
  async refreshFromConversation(params: {
    userId: string;
    profileId: string;
    sectionKey: string;
    sectionName: string;
    existingBrief: string | null | undefined;
    profile: {
      businessName: string | null;
      industry: string | null;
      currentPhase: string;
      country: string | null;
    };
    messages: { role: string; content: string }[];
  }): Promise<void> {
    try {
      // Always re-load THIS profile from DB (never trust stale/cross-profile data)
      const profileRow = await this.prisma.businessProfile.findFirst({
        where: { id: params.profileId, userId: params.userId },
      });
      if (!profileRow) {
        this.logger.warn(
          `Brief refresh skipped — profile ${params.profileId} not found for user ${params.userId}`,
        );
        return;
      }

      const siblingProfiles = await this.prisma.businessProfile.findMany({
        where: {
          userId: params.userId,
          id: { not: params.profileId },
        },
        select: { id: true, businessName: true },
      });
      const otherBusinessNames = siblingProfiles
        .map((p) => p.businessName?.trim())
        .filter((n): n is string => !!n);

      const recent = params.messages
        .slice(-8)
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`.slice(0, 1500))
        .join('\n\n')
        .slice(0, 10000);

      if (!recent.trim()) return;

      const thisName = profileRow.businessName?.trim() || 'Unnamed business';
      const existingBrief = (profileRow.businessBrief || params.existingBrief || '').trim();

      const prompt = `You maintain a SHARED BUSINESS BRIEF for ONE PioneerX business profile only.

THIS PROFILE (the only business you may write about):
- Profile ID: ${profileRow.id}
- Business Name: ${thisName}
- Industry: ${profileRow.industry || 'N/A'}
- Phase: ${profileRow.currentPhase}
- Country: ${profileRow.country || 'N/A'}

OTHER businesses owned by the same user (DO NOT include these):
${
  otherBusinessNames.length
    ? otherBusinessNames.map((n) => `- ${n}`).join('\n')
    : '- (none)'
}

Existing brief for THIS profile only:
${existingBrief || '(empty)'}

Latest conversation was in section "${params.sectionName}" (${params.sectionKey}) for THIS profile:
${recent}

Update the brief with durable business facts ONLY about "${thisName}" / profile ${profileRow.id}.
Allowed topics: product/offer, audience, problem, positioning, stage, key decisions, constraints, open questions.

HARD RULES:
- Write facts for THIS profile only. Never merge in other businesses.
- If the chat mentions another business (${otherBusinessNames.join(', ') || 'other ventures'}), ignore those mentions for the brief.
- If the existing brief contains other businesses, REMOVE them and keep only "${thisName}".
- MERGE only with prior facts that clearly belong to THIS business.
- Do NOT copy full chat transcripts.
- Do NOT invent facts.
- Keep it concise (max ~250 words).
- Ignore jokes, coding help, off-topic chatter.

Return ONLY JSON:
{
  "brief": "markdown or plain text brief for THIS business only",
  "changed": true
}
If nothing meaningful to add, return { "brief": "<cleaned brief for THIS business only>", "changed": false }.`;

      const response = await this.aiProvider.callModel(ModelRole.FREE_TIER_MODEL, prompt);
      const json = response.json as { brief?: string; changed?: boolean };
      const nextBrief = (json.brief || '').trim();
      if (!nextBrief) return;

      await this.prisma.businessProfile.update({
        where: { id: profileRow.id },
        data: {
          businessBrief: nextBrief.slice(0, 8000),
          briefUpdatedAt: new Date(),
          briefUpdatedFrom: params.sectionKey,
        },
      });

      this.logger.log(
        `Business brief updated for profile ${profileRow.id} ("${thisName}") from ${params.sectionKey}`,
      );
    } catch (err) {
      this.logger.error(
        `Business brief refresh failed for profile ${params.profileId}: ${(err as Error).message}`,
      );
    }
  }
}
