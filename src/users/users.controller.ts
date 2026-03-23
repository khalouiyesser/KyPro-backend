import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Request, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse,
  ApiParam, ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// ── DTO inline pour les routes simples ───────────────────────────────────────
class UpdateMeDto {
  name?: string;
  phone?: string;
  theme?: string;
  position?: string;
  avatarUrl?: string;
}

class ChangePasswordDto {
  newPassword: string;
}


// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Users')
// @ApiBearerAuth('JWT')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Seed : créer un admin système (temporaire, sans guard) ────────────────
  @Post('seed-admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un administrateur système (seed)',
    description: 'Route temporaire pour initialiser le premier compte system_admin. À supprimer en production.',
  })
  @ApiBody({ type: CreateAdminDto })
  @ApiResponse({ status: 201, description: 'Admin créé avec succès.' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé.' })
  createAdmin(@Body() body: CreateAdminDto) {
    return this.usersService.createAdmin(body.email, body.password);
  }


  @Get('yesser')
  async getAdmins() {
    return "yesser";
  }

  // ── Créer un utilisateur (admin uniquement) ───────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un utilisateur',
    description: 'Crée un compte utilisateur et envoie un email avec le mot de passe temporaire.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'Utilisateur créé.' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé.' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // ── Lister tous les utilisateurs ─────────────────────────────────────────
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lister tous les utilisateurs' })
  @ApiResponse({ status: 200, description: 'Liste des utilisateurs (sans mot de passe).' })
  findAll() {
    return this.usersService.findAll();
  }

  // ── Mon profil ────────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer mon profil' })
  @ApiResponse({ status: 200, description: 'Profil de l\'utilisateur connecté.' })
  @ApiResponse({ status: 401, description: 'Non authentifié.' })
  getMe(@Request() req) {
    return this.usersService.findOne(req.user.userId);
  }

  // ── Modifier mon profil ───────────────────────────────────────────────────
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Modifier mon profil' })
  @ApiBody({ type: UpdateMeDto })
  @ApiResponse({ status: 200, description: 'Profil mis à jour.' })
  updateMe(@Request() req, @Body() dto: UpdateMeDto) {
    const allowed: (keyof UpdateMeDto)[] = ['name', 'phone', 'theme', 'position', 'avatarUrl'];
    const update: Partial<UpdateMeDto> = {};
    allowed.forEach(k => { if (dto[k] !== undefined) update[k] = dto[k]; });
    return this.usersService.update(req.user.userId, update as UpdateUserDto);
  }

  // ── Changer mon mot de passe ──────────────────────────────────────────────
  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Changer mon mot de passe' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 204, description: 'Mot de passe changé.' })
  changeMyPassword(@Request() req, @Body() body: ChangePasswordDto) {
    return this.usersService.changePassword(req.user.userId, body.newPassword);
  }

  // ── Récupérer un utilisateur par ID ──────────────────────────────────────
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Récupérer un utilisateur par ID' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Utilisateur trouvé.' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // ── Modifier un utilisateur ───────────────────────────────────────────────
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Modifier un utilisateur' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId de l\'utilisateur' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'Utilisateur mis à jour.' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  // ── Supprimer un utilisateur ──────────────────────────────────────────────
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un utilisateur' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId de l\'utilisateur' })
  @ApiResponse({ status: 204, description: 'Utilisateur supprimé.' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  // ── Décrémenter les tentatives OCR ───────────────────────────────────────
  @Patch(':id/ocr-decrement')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Décrémenter les tentatives OCR',
    description: 'Réduit de 1 le compteur OCR mensuel de l\'utilisateur. Retourne le nombre restant.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Tentatives OCR restantes.' })
  @ApiResponse({ status: 404, description: 'Utilisateur introuvable.' })
  decrementOcr(@Param('id') id: string) {
    return this.usersService.decrementOcrAttempts(id);
  }
}