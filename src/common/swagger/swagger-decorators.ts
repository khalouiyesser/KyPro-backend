import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

/**
 * Décorateurs composés Swagger réutilisables
 */

export function ApiGetAll(description = 'Récupérer la liste des ressources') {
  return applyDecorators(
    ApiOperation({ summary: description }),
    ApiOkResponse({
      description: 'Liste récupérée avec succès',
      schema: {
        properties: {
          data: { type: 'array' },
          total: { type: 'number' },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Non authentifié' }),
    ApiInternalServerErrorResponse({ description: 'Erreur serveur' }),
  );
}

export function ApiGetOne(description = 'Récupérer une ressource par ID') {
  return applyDecorators(
    ApiOperation({ summary: description }),
    ApiOkResponse({ description: 'Ressource récupérée avec succès' }),
    ApiNotFoundResponse({ description: 'Ressource non trouvée' }),
    ApiUnauthorizedResponse({ description: 'Non authentifié' }),
    ApiInternalServerErrorResponse({ description: 'Erreur serveur' }),
  );
}

export function ApiCreate(description = 'Créer une ressource', statusCode = HttpStatus.CREATED) {
  return applyDecorators(
    ApiOperation({ summary: description }),
    ApiCreatedResponse({ description: 'Ressource créée avec succès' }),
    ApiBadRequestResponse({ description: 'Données invalides' }),
    ApiConflictResponse({ description: 'Ressource déjà existante' }),
    ApiUnauthorizedResponse({ description: 'Non authentifié' }),
    ApiInternalServerErrorResponse({ description: 'Erreur serveur' }),
    HttpCode(statusCode),
  );
}

export function ApiUpdate(description = 'Mettre à jour une ressource') {
  return applyDecorators(
    ApiOperation({ summary: description }),
    ApiOkResponse({ description: 'Ressource mise à jour avec succès' }),
    ApiBadRequestResponse({ description: 'Données invalides' }),
    ApiNotFoundResponse({ description: 'Ressource non trouvée' }),
    ApiUnauthorizedResponse({ description: 'Non authentifié' }),
    ApiInternalServerErrorResponse({ description: 'Erreur serveur' }),
  );
}

export function ApiDelete(description = 'Supprimer une ressource') {
  return applyDecorators(
    ApiOperation({ summary: description }),
    ApiOkResponse({ description: 'Ressource supprimée avec succès' }),
    ApiNotFoundResponse({ description: 'Ressource non trouvée' }),
    ApiUnauthorizedResponse({ description: 'Non authentifié' }),
    ApiInternalServerErrorResponse({ description: 'Erreur serveur' }),
  );
}

export function ApiExport(description = 'Exporter les données') {
  return applyDecorators(
    ApiOperation({ summary: description }),
    ApiOkResponse({
      description: 'Données exportées avec succès',
      schema: {
        type: 'file',
        format: 'binary',
      },
    }),
    ApiBadRequestResponse({ description: 'Paramètres invalides' }),
    ApiUnauthorizedResponse({ description: 'Non authentifié' }),
    ApiInternalServerErrorResponse({ description: 'Erreur serveur' }),
  );
}

export function ApiStats(description = 'Récupérer les statistiques') {
  return applyDecorators(
    ApiOperation({ summary: description }),
    ApiOkResponse({
      description: 'Statistiques récupérées avec succès',
      schema: {
        properties: {
          total: { type: 'number' },
          active: { type: 'number' },
          inactive: { type: 'number' },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Non authentifié' }),
    ApiInternalServerErrorResponse({ description: 'Erreur serveur' }),
  );
}

export function ApiAction(description: string, summary?: string) {
  return applyDecorators(
    ApiOperation({ summary: summary || description }),
    ApiOkResponse({ description: 'Action exécutée avec succès' }),
    ApiBadRequestResponse({ description: 'Données invalides' }),
    ApiNotFoundResponse({ description: 'Ressource non trouvée' }),
    ApiUnauthorizedResponse({ description: 'Non authentifié' }),
    ApiInternalServerErrorResponse({ description: 'Erreur serveur' }),
  );
}

