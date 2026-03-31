import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import {ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SubscriptionPlan, SubscriptionStatus } from '../company/company.schema';
import {CreateCompanyWithAdminDto} from "./dto/create-company-with-admin.dto";

@ApiTags('System Admin')
// @ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('system_admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard global: companies, users, revenue' })
  getDashboard() { return this.adminService.getSystemDashboard(); }

  @Post('setup')
  @ApiOperation({ summary: 'Créer le premier admin système (bootstrap)' })
  createSystemAdmin(@Body() body: { email: string; name: string; password: string }) {
    return this.adminService.createSystemAdmin(body.email, body.name, body.password);
  }

  @Get('test-email')
  @ApiOperation({ summary: 'Envoyer un email de test' })
  async sendTestEmailY() {
    return await this.adminService.testEmail();
  }

  // ── Companies ─────────────────────────────────────────────────────────────
  // @Post('companies')
  // @ApiOperation({ summary: 'Créer une company + son admin_company (envoi email)' })
  // createCompany(@Body() dto: any) { return this.adminService.createCompany(dto); }


  @Get('companies')
  @ApiOperation({ summary: 'Lister toutes les companies avec filtres et pagination' })
  @ApiQuery({ name: 'search', required: false }) @ApiQuery({ name: 'status', required: false }) @ApiQuery({ name: 'plan', required: false }) @ApiQuery({ name: 'page', required: false }) @ApiQuery({ name: 'limit', required: false })
  findAllCompanies(@Query('search') search?: string, @Query('status') status?: string, @Query('plan') plan?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.findAllCompanies({ search, status, plan, page, limit });
  }

  @Get('companies/:id')
  @ApiOperation({ summary: 'Détails company + tous ses utilisateurs' })
  findCompany(@Param('id') id: string) { return this.adminService.findCompanyById(id); }

  @Patch('companies/:id')
  @ApiOperation({ summary: 'Modifier une company' })
  updateCompany(@Param('id') id: string, @Body() dto: any) { return this.adminService.updateCompany(id, dto); }

  @Delete('companies/:id')
  @ApiOperation({ summary: 'Supprimer une company (désactive les users)' })
  deleteCompany(@Param('id') id: string) { return this.adminService.deleteCompany(id); }

  // ── Abonnements ───────────────────────────────────────────────────────────
  @Post('companies/:id/subscription')
  @ApiOperation({ summary: 'Mettre à jour abonnement + enregistrer paiement' })
  updateSubscription(@Param('id') id: string, @Body() body: { plan: SubscriptionPlan; status: SubscriptionStatus; expiresAt: string; amountPaid?: number; notes?: string }) {
    return this.adminService.updateSubscription(id, body);
  }

  @Post('companies/:id/suspend')
  @ApiOperation({ summary: 'Suspendre une company (bloque les connexions)' })
  suspend(@Param('id') id: string, @Body() body: { reason: string }) { return this.adminService.suspendCompany(id, body.reason); }

  @Post('companies/:id/reactivate')
  @ApiOperation({ summary: 'Réactiver une company' })
  reactivate(@Param('id') id: string) { return this.adminService.reactivateCompany(id); }

  @Post('subscriptions/check-expired')
  @ApiOperation({ summary: 'Vérifier et expirer automatiquement les abonnements périmés' })
  checkExpired() { return this.adminService.checkExpiredSubscriptions(); }

  // ── OCR ───────────────────────────────────────────────────────────────────
  @Post('companies/:id/ocr/reset')
  @ApiOperation({ summary: 'Réinitialiser le quota OCR mensuel d\'une company' })
  resetOcr(@Param('id') id: string) { return this.adminService.resetOcr(id); }

  @Patch('companies/:id/ocr/limit')
  @ApiOperation({ summary: 'Modifier la limite OCR mensuelle' })
  updateOcrLimit(@Param('id') id: string, @Body() body: { limit: number }) { return this.adminService.updateOcrLimit(id, body.limit); }

  // ── Users ─────────────────────────────────────────────────────────────────
  @Get('users')
  @ApiOperation({ summary: 'Tous les utilisateurs de toutes les companies' })
  getAllUsers(@Query('companyId') companyId?: string, @Query('search') search?: string) { return this.adminService.getAllUsers({ companyId, search }); }

  @Patch('users/:id/toggle')
  @ApiOperation({ summary: 'Activer / Désactiver un utilisateur' })
  toggleUser(@Param('id') id: string) { return this.adminService.toggleUserActive(id); }

  @Post('users/:id/reset-password')
  @ApiOperation({ summary: 'Réinitialiser le mot de passe (email envoyé)' })
  resetPassword(@Param('id') id: string) { return this.adminService.resetUserPassword(id); }


  @Post('companies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('system_admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une entreprise + son admin' })
  @ApiBody({ type: CreateCompanyWithAdminDto })
  createCompany(@Body() dto: CreateCompanyWithAdminDto) {
    return this.adminService.createCompanyWithAdmin(dto);
  }

}
