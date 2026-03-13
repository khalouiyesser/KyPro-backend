import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiOkResponse, ApiUnauthorizedResponse, ApiInternalServerErrorResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto, ChangePasswordDto, ResetPasswordDto } from '../common/swagger/swagger-schemas';
import { ApiAction } from '../common/swagger/swagger-decorators';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Connexion utilisateur (email + mot de passe)', description: 'Authentifier un utilisateur et récupérer un token JWT' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Connexion réussie, token JWT fourni' })
  @ApiUnauthorizedResponse({ description: 'Email ou mot de passe incorrect' })
  @ApiInternalServerErrorResponse({ description: 'Erreur serveur' })
  login(@Request() req) {
    return this.authService.login(req.user); }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Récupérer le profil de l\'utilisateur connecté', description: 'Retourne les informations de l\'utilisateur connecté extraites du token JWT' })
  @ApiOkResponse({ description: 'Profil récupéré avec succès' })
  @ApiUnauthorizedResponse({ description: 'Token JWT invalide ou expiré' })
  getProfile(@Request() req) { return req.user; }


  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Changer le mot de passe utilisateur', description: 'Change le mot de passe de l\'utilisateur actuellement connecté' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ description: 'Mot de passe changé avec succès' })
  @ApiUnauthorizedResponse({ description: 'Mot de passe actuel incorrect' })
  changePassword(@Request() req, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Demander la réinitialisation du mot de passe', description: 'Envoie un email avec un lien de réinitialisation du mot de passe' })
  @ApiBody({ schema: { properties: { email: { type: 'string', example: 'user@example.com' } } } })
  @ApiOkResponse({ description: 'Email de réinitialisation envoyé' })
  forgotPassword(@Body() body: { email: string }) { return this.authService.requestPasswordReset(body.email); }

  @Post('reset-password')
  @ApiOperation({ summary: 'Réinitialiser le mot de passe avec token', description: 'Réinitialise le mot de passe en utilisant le token reçu par email' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ description: 'Mot de passe réinitialisé avec succès' })
  resetPassword(@Body() body: { email: string; token: string; newPassword: string }) {
    return this.authService.resetPassword(body.email, body.token, body.newPassword);
  }
}
