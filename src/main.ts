import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {urlencoded} from "express";
import {json} from "node:stream/consumers";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const express = require('express');

  app.use(express.json({ limit: '10mb' }));                // ← syntaxe corrigée
  app.use(urlencoded({ limit: '10mb', extended: true })); // ← AJOUTER

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('ERP API — Système Multi-Company')
    .setDescription('Backend ERP complet avec OCR, rôles, abonnements et exports PDF/Excel')
    .setVersion('2.0')
    .setContact('Support', 'https://erp.example.com', 'support@erp.example.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addServer(`http://localhost:${process.env.PORT || 3000}`, 'Développement')
    .addServer('https://api.erp.example.com', 'Production')
    .addTag('Auth', 'Authentification et gestion des sessions')
    .addTag('System Admin', 'Administration système')
    .addTag('Company', 'Gestion des entreprises')
    .addTag('Users', 'Gestion des utilisateurs')
    .addTag('Clients', 'Gestion des clients')
    .addTag('Fournisseurs', 'Gestion des fournisseurs')
    .addTag('Products', 'Gestion des produits')
    .addTag('Ventes', 'Gestion des ventes')
    .addTag('Purchases', 'Gestion des achats')
    .addTag('Quotes', 'Gestion des devis')
    .addTag('Charges', 'Gestion des charges')
    .addTag('Employees', 'Gestion des employés')
    .addTag('Stock', 'Gestion du stock')
    .addTag('Accounting', 'Comptabilité')
    .addTag('Dashboard', 'Tableaux de bord')
    .addTag('Reports', 'Rapports et exports')
    .addTag('OCR', 'Reconnaissance optique de caractères')
    .addTag('Notifications', 'Notifications')
    .addTag('Deliveries', 'Livraisons')
    .addTag('Returns', 'Retours')
    .addTag('Payments Vente', 'Paiements des ventes')
    .addTag('Payments Achat', 'Paiements des achats')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showRequestHeaders: true,
    },
    customCss: `.topbar { display: none } .swagger-ui .info .title { color: #1890ff; font-size: 28px; } .swagger-ui .scheme-container { background: #f5f5f5; }`,
  });

  const port = process.env.PORT || 3001;

  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Serveur: http://localhost:${port}`);
  logger.log(`🌐 IP réseau: http://192.168.1.176:${port}`);
  logger.log(`📚 Swagger: http://localhost:${port}/api`);
}
bootstrap();
