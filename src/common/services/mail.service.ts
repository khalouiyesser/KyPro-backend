import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.transporter = nodemailer.createTransport({
      host:   'smtp.gmail.com',
      port:   587,
      secure: false,
      auth: {
        user: this.configService.get('MAIL_USER'),
        pass: this.configService.get('MAIL_PASS'),
      },
    });

    // try {
    //   await this.transporter.verify();
    //   this.logger.log(`📧 Gmail SMTP prêt — ${this.configService.get('MAIL_USER')}`);
    // } catch (err) {
    //   this.logger.error(`❌ Gmail SMTP échoué: ${err.message}`);
    // }
  }

  async sendWelcomeEmail(to: string, name: string, tempPassword: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from:    this.configService.get('MAIL_FROM'),
        to,
        subject: 'Bienvenue sur votre ERP',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
            <h2 style="color:#2563eb">Bienvenue, ${name} !</h2>
            <p>Votre compte a été créé avec succès.</p>
            <table style="width:100%;background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0">
              <tr><td style="color:#6b7280">Email</td><td><strong>${to}</strong></td></tr>
              <tr><td style="color:#6b7280">Mot de passe temporaire</td><td><code style="background:#e5e7eb;padding:2px 6px;border-radius:4px">${tempPassword}</code></td></tr>
            </table>
            <p style="color:#ef4444">⚠️ Changez votre mot de passe dès votre première connexion.</p>
          </div>
        `,
      });
      this.logger.log(`✅ Email envoyé à ${to}`);
    } catch (err) {
      this.logger.warn(`Email non envoyé à ${to}: ${err.message}`);
    }
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from:    this.configService.get('MAIL_FROM'),
        to,
        subject: 'Réinitialisation de mot de passe',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
            <h2 style="color:#2563eb">Bonjour ${name}</h2>
            <p>Votre code de réinitialisation :</p>
            <div style="font-size:24px;font-weight:bold;text-align:center;padding:16px;background:#f9fafb;border-radius:8px;letter-spacing:4px">${token}</div>
            <p style="color:#6b7280;font-size:13px">Valable 1 heure.</p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.warn(`Email reset non envoyé: ${err.message}`);
    }
  }

  async sendSubscriptionAlert(to: string, companyName: string, message: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from:    this.configService.get('MAIL_FROM'),
        to,
        subject: `[ERP] Alerte abonnement — ${companyName}`,
        html:    `<h3>${companyName}</h3><p>${message}</p>`,
      });
    } catch (err) {
      this.logger.warn(`Email abonnement non envoyé: ${err.message}`);
    }
  }
}

