import { Controller, Post, Body, UseGuards, Request, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Connexion (email + mot de passe)' })
  @ApiBody({ schema: { properties: { email: { type: 'string', example: 'admin@company.com' }, password: { type: 'string', example: 'Password123!' } } } })
  login(@Request() req) { return this.authService.login(req.user); }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Mon profil JWT décodé' })
  getProfile(@Request() req) { return req.user; }



  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Changer mon mot de passe' })
  changePassword(@Request() req, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Demander la réinitialisation du mot de passe' })
  forgotPassword(@Body() body: { email: string }) { return this.authService.requestPasswordReset(body.email); }

  @Post('reset-password')
  @ApiOperation({ summary: 'Réinitialiser avec le code reçu par email' })
  resetPassword(@Body() body: { email: string; token: string; newPassword: string }) {
    return this.authService.resetPassword(body.email, body.token, body.newPassword);
  }
}
