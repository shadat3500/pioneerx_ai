import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SitePageService } from './site-page.service';

@ApiTags('Site Pages')
@Controller('site-pages')
export class SitePageController {
  constructor(private readonly sitePageService: SitePageService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List CMS pages (about, terms, privacy, contact)' })
  list() {
    return this.sitePageService.list();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get one CMS page by slug' })
  getOne(@Param('slug') slug: string) {
    return this.sitePageService.getBySlug(slug);
  }
}
