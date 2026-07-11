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
import { TokenDashboardQueryDto } from './dto/token-dashboard-query.dto';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
