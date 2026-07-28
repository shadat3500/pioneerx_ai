import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateModelPricingDto, UpdateModelPricingDto } from './dto/model-pricing.dto';
import { UpdateQuotaConfigDto } from './dto/quota-config.dto';
import { UpdateCreditConfigDto } from './dto/credit-config.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { TokenDashboardQueryDto } from './dto/token-dashboard-query.dto';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PromoService } from '../promo/promo.service';
import { CreatePromoCodeDto, UpdatePromoCodeDto } from '../promo/dto/promo.dto';
import { ReviewService } from '../review/review.service';
import { AdminCreateReviewDto } from '../review/dto/submit-review.dto';
import { UpdateSitePageDto } from '../site-page/dto/update-site-page.dto';
import {
  CreateStripePriceDto,
  UpdateStripePriceDto,
} from './dto/stripe-price.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly promoService: PromoService,
    private readonly reviewService: ReviewService,
  ) {}

  @Public()
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login and retrieve access token' })
  login(@Body() dto: AdminLoginDto) {
    return this.adminService.login(dto);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public() // Bypasses the default global AtGuard so AdminAuthGuard is evaluated instead
  @Get('sections')
  @ApiOperation({ summary: 'Get all sections' })
  getSections() {
    return this.adminService.getSections();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('sections/:id')
  @ApiOperation({ summary: 'Update a section configuration' })
  updateSection(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateSection(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('ai-configs')
  @ApiOperation({ summary: 'Get all AI model configurations' })
  getAiModelConfigs() {
    return this.adminService.getAiModelConfigs();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('ai-configs/:id')
  @ApiOperation({ summary: 'Update an AI model role mapping' })
  updateAiModelConfig(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateAiModelConfig(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('prompt-templates')
  @ApiOperation({ summary: 'Get all prompt templates' })
  getPromptTemplates() {
    return this.adminService.getPromptTemplates();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Post('prompt-templates')
  @ApiOperation({ summary: 'Create a new prompt template' })
  createPromptTemplate(@Body() body: any) {
    return this.adminService.createPromptTemplate(body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('prompt-templates/:id')
  @ApiOperation({ summary: 'Update a prompt template' })
  updatePromptTemplate(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updatePromptTemplate(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('quota-configs')
  @ApiOperation({ summary: 'Get all quota configs' })
  getQuotaConfigs() {
    return this.adminService.getQuotaConfigs();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('quota-configs/:id')
  @ApiOperation({ summary: 'Update a quota config (dailyTokenLimit, dailyRegenerateLimit)' })
  updateQuotaConfig(@Param('id') id: string, @Body() body: UpdateQuotaConfigDto) {
    return this.adminService.updateQuotaConfig(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('model-pricings')
  @ApiOperation({ summary: 'Get all model pricing rows' })
  getModelPricings() {
    return this.adminService.getModelPricings();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Post('model-pricings')
  @ApiOperation({ summary: 'Create a model pricing row' })
  createModelPricing(@Body() body: CreateModelPricingDto) {
    return this.adminService.createModelPricing(body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('model-pricings/:id')
  @ApiOperation({ summary: 'Update a model pricing row' })
  updateModelPricing(@Param('id') id: string, @Body() body: UpdateModelPricingDto) {
    return this.adminService.updateModelPricing(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Delete('model-pricings/:id')
  @ApiOperation({ summary: 'Delete a model pricing row' })
  deleteModelPricing(@Param('id') id: string) {
    return this.adminService.deleteModelPricing(id);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('token-dashboard')
  @ApiOperation({ summary: 'Aggregated token usage and cost report' })
  getTokenDashboard(@Query() query: TokenDashboardQueryDto) {
    return this.adminService.getTokenDashboard(query);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('users')
  @ApiOperation({ summary: 'List users with subscription tier and trial status' })
  getUsers(@Query() pagination: PaginationDto) {
    return this.adminService.getUsers(pagination);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Aggregated dashboard stats (users, growth, AI cost)' })
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  // ─────────────────────────────────────────────
  // v1.5 §10a — Credit Config Manager
  // ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('credit-configs')
  @ApiOperation({ summary: 'Get all credit configs per tier' })
  getCreditConfigs() {
    return this.adminService.getCreditConfigs();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('credit-configs/:id')
  @ApiOperation({ summary: 'Update a credit config (monthlyCredits, dailyCredits, trialCredits)' })
  updateCreditConfig(@Param('id') id: string, @Body() body: UpdateCreditConfigDto) {
    return this.adminService.updateCreditConfig(id, body);
  }

  // ─────────────────────────────────────────────
  // v1.5 §10b — Broadcast Notification
  // ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Post('notifications/broadcast')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Broadcast a notification to all users' })
  broadcastNotification(@Body() body: BroadcastNotificationDto) {
    return this.adminService.broadcastNotification(body);
  }

  // ─────────────────────────────────────────────
  // v1.5 §12d — Promo Code Manager
  // ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('promo-codes')
  @ApiOperation({ summary: 'List all promo codes' })
  getPromoCodes() {
    return this.promoService.listPromoCodes();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Post('promo-codes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new promo code' })
  createPromoCode(@Body() body: CreatePromoCodeDto) {
    return this.promoService.createPromoCode(body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('promo-codes/:id')
  @ApiOperation({ summary: 'Update a promo code (toggle active, limits, expiry)' })
  updatePromoCode(@Param('id') id: string, @Body() body: UpdatePromoCodeDto) {
    return this.promoService.updatePromoCode(id, body);
  }

  // ─────────────────────────────────────────────
  // v1.5 §14d — Review Manager
  // ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('reviews/pending')
  @ApiOperation({ summary: 'List pending (unapproved) reviews' })
  getPendingReviews() {
    return this.reviewService.findPending();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('reviews')
  @ApiOperation({ summary: 'List all reviews' })
  getReviews() {
    return this.reviewService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Post('reviews')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin creates an already-approved review' })
  createReview(@Body() body: AdminCreateReviewDto) {
    return this.reviewService.createAsAdmin(body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('reviews/:id/approve')
  @ApiOperation({ summary: 'Approve a pending review' })
  approveReview(@Param('id') id: string) {
    return this.reviewService.approve(id);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('reviews/:id/reject')
  @ApiOperation({ summary: 'Reject and delete a pending review' })
  rejectReview(@Param('id') id: string) {
    return this.reviewService.reject(id);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Delete('reviews/:id')
  @ApiOperation({ summary: 'Hard delete a review' })
  deleteReview(@Param('id') id: string) {
    return this.reviewService.remove(id);
  }

  // ─────────────────────────────────────────────
  // Site CMS — About / Terms / Privacy / Contact
  // ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('site-pages')
  @ApiOperation({ summary: 'List editable site pages' })
  listSitePages() {
    return this.adminService.listSitePages();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('site-pages/:slug')
  @ApiOperation({ summary: 'Update a site page by slug' })
  updateSitePage(@Param('slug') slug: string, @Body() body: UpdateSitePageDto) {
    return this.adminService.updateSitePage(slug, body);
  }

  // ─────────────────────────────────────────────
  // Stripe billing — price → tier map & payments
  // ─────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('stripe-prices')
  @ApiOperation({ summary: 'List Stripe price → tier mappings' })
  listStripePrices() {
    return this.adminService.listStripePrices();
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Post('stripe-prices')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Map a Stripe price id to a subscription tier' })
  createStripePrice(@Body() body: CreateStripePriceDto) {
    return this.adminService.createStripePrice(body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Patch('stripe-prices/:id')
  @ApiOperation({ summary: 'Update a Stripe price mapping' })
  updateStripePrice(
    @Param('id') id: string,
    @Body() body: UpdateStripePriceDto,
  ) {
    return this.adminService.updateStripePrice(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Delete('stripe-prices/:id')
  @ApiOperation({ summary: 'Remove a Stripe price mapping' })
  deleteStripePrice(@Param('id') id: string) {
    return this.adminService.deleteStripePrice(id);
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Public()
  @Get('payments')
  @ApiOperation({ summary: 'Paginated payment history across providers' })
  listPayments(@Query() query: PaginationDto) {
    return this.adminService.listPayments(query);
  }
}
