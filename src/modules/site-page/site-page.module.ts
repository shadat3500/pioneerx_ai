import { Module, OnModuleInit } from '@nestjs/common';
import { SitePageController } from './site-page.controller';
import { SitePageService } from './site-page.service';

@Module({
  controllers: [SitePageController],
  providers: [SitePageService],
  exports: [SitePageService],
})
export class SitePageModule implements OnModuleInit {
  constructor(private readonly sitePageService: SitePageService) {}

  async onModuleInit() {
    try {
      await this.sitePageService.ensureDefaults();
    } catch {
      // DB may be down at boot — seed/migrate later
    }
  }
}
