import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

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
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('Auth').addTag('System Admin').addTag('Company').addTag('Users')
    .addTag('Clients').addTag('Fournisseurs').addTag('Products')
    .addTag('Ventes').addTag('Purchases').addTag('Quotes')
    .addTag('Charges').addTag('Employees').addTag('Stock')
    .addTag('Accounting').addTag('Dashboard').addTag('Reports')
    .addTag('OCR').addTag('Notifications')
    .addTag('Deliveries').addTag('Returns')
    .addTag('Payments Vente').addTag('Payments Achat')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // logger.log(`🚀 Serveur: http://localhost:${port}`);
  // logger.log(`📚 Swagger: http://localhost:${port}/api`);
}
bootstrap();
