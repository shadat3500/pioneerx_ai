import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSitePageDto } from './dto/update-site-page.dto';

export const SITE_PAGE_SLUGS = [
  'about-us',
  'contact-us',
  'privacy-policy',
  'terms-condition',
] as const;

export type SitePageSlug = (typeof SITE_PAGE_SLUGS)[number];

@Injectable()
export class SitePageService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.sitePage.findMany({
      orderBy: { slug: 'asc' },
    });
  }

  async getBySlug(slug: string) {
    const page = await this.prisma.sitePage.findUnique({ where: { slug } });
    if (!page) {
      throw new NotFoundException(`Site page "${slug}" not found`);
    }
    return page;
  }

  async update(slug: string, dto: UpdateSitePageDto) {
    const existing = await this.prisma.sitePage.findUnique({ where: { slug } });
    if (!existing) {
      throw new NotFoundException(`Site page "${slug}" not found`);
    }
    return this.prisma.sitePage.update({
      where: { slug },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        body: dto.body,
      },
    });
  }

  /** Idempotent defaults for seed / first boot */
  async ensureDefaults() {
    const defaults: { slug: SitePageSlug; title: string; body: string }[] = [
      {
        slug: 'about-us',
        title: 'About Us',
        body: `PioneerX is an AI-powered business growth platform for founders.

We help you move from idea to brand, marketing, sales, and scale — with section-based advisory chat, credits, and tools tailored to your stage.

Edit this page anytime from the Admin Panel → Site pages.`,
      },
      {
        slug: 'contact-us',
        title: 'Contact Us',
        body: `We'd love to hear from you.

Email: support@pioneerx.ai
Business hours: Mon–Fri, 9:00–18:00 (your local timezone)

For billing or account help, include the email on your PioneerX account.

Edit this page anytime from the Admin Panel → Site pages.`,
      },
      {
        slug: 'privacy-policy',
        title: 'Privacy Policy',
        body: `Last updated: ${new Date().toISOString().slice(0, 10)}

1. Information we collect
We collect account information (such as email and name), usage data needed to run the product, and content you submit in chat/tools.

2. How we use information
We use data to provide and improve PioneerX, personalize advice for your active business profile, process credits/subscriptions, and keep the platform secure.

3. Sharing
We do not sell personal data. We may use infrastructure and AI providers under contract to operate features you request.

4. Your choices
You may request account deletion or data access by contacting support.

5. Contact
privacy@pioneerx.ai

Replace this draft with your legal counsel's final policy via Admin Panel.`,
      },
      {
        slug: 'terms-condition',
        title: 'Terms & Conditions',
        body: `Last updated: ${new Date().toISOString().slice(0, 10)}

1. Acceptance
By using PioneerX you agree to these Terms.

2. The service
PioneerX provides AI-assisted business guidance. Outputs are informational and not a substitute for professional legal, tax, or financial advice.

3. Accounts
You are responsible for keeping login credentials secure and for activity under your account.

4. Credits & subscriptions
Paid features and credit allowances follow your plan. Unused credits may reset per plan rules.

5. Acceptable use
Do not misuse the service, attempt to break security, or use outputs for unlawful purposes.

6. Contact
legal@pioneerx.ai

Replace this draft with your counsel's final terms via Admin Panel.`,
      },
    ];

    for (const row of defaults) {
      await this.prisma.sitePage.upsert({
        where: { slug: row.slug },
        create: row,
        update: {},
      });
    }
  }
}
