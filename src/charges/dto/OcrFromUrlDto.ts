import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString, IsUrl, IsNotEmpty, IsIn, IsOptional,
    IsNumber, IsBoolean, IsArray, ValidateNested,
    Min, MaxLength, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── OCR endpoints ─────────────────────────────────────────────────────────────

export class OcrFromUrlDto {
    @ApiProperty({
        description: 'URL publique de la facture (image ou PDF)',
        example: 'https://example.com/invoice.pdf',
    })
    @IsUrl()
    @IsNotEmpty()
    imageUrl: string;
}

export class OcrFromBase64Dto {
    @ApiProperty({
        description: 'Contenu du fichier encodé en base64',
        example: 'JVBERi0xLjQK...',
    })
    @IsString()
    @IsNotEmpty()
    base64: string;

    @ApiProperty({
        description: 'Type MIME du fichier',
        enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
        example: 'image/png',
    })
    @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
    mimeType: string;
}

// ── Ligne de facturation ──────────────────────────────────────────────────────

export class ChargeItemDto {
    @ApiProperty({
        description: 'Désignation de la ligne (produit ou service)',
        example: 'SOURIS RAMITECH USB TB220',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    label: string;

    @ApiProperty({
        description: 'Montant TTC de la ligne',
        example: 8.0,
    })
    @IsNumber()
    @Min(0)
    total: number;
}

// ── Créer / Mettre à jour une charge ─────────────────────────────────────────

const CHARGE_TYPES = [
    'rent', 'salary', 'utilities', 'equipment',
    'marketing', 'tax', 'insurance', 'accounting', 'fuel', 'other',
] as const;

const CURRENCIES = ['TND', 'EUR', 'USD', 'other'] as const;

export class CreateChargeDto {
    @ApiProperty({
        description: 'Description / nom du fournisseur',
        example: 'Facture E-INFO N°68',
        maxLength: 200,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    description: string;

    @ApiProperty({
        description: 'Montant TTC total (Net à payer)',
        example: 279.0,
        minimum: 0,
    })
    @IsNumber()
    @Min(0)
    amount: number;

    @ApiPropertyOptional({
        description: 'Montant HT total',
        example: 273.682,
        minimum: 0,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    amountHT?: number;

    @ApiPropertyOptional({
        description: 'Taux TVA (%)',
        example: 7,
        minimum: 0,
        maximum: 100,
        default: 0,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    tva?: number;

    @ApiProperty({
        description: 'Date de la facture (YYYY-MM-DD)',
        example: '2024-03-16',
    })
    @IsString()
    @IsNotEmpty()
    date: string;

    @ApiPropertyOptional({
        description: 'Type de charge',
        enum: CHARGE_TYPES,
        default: 'other',
    })
    @IsOptional()
    @IsIn(CHARGE_TYPES)
    type?: string;

    @ApiPropertyOptional({
        description: 'Numéro de facture ou référence',
        example: '68',
    })
    @IsOptional()
    @IsString()
    source?: string;

    @ApiPropertyOptional({
        description: 'URL ou base64 de la facture',
        example: 'https://example.com/facture.png',
    })
    @IsOptional()
    @IsString()
    imageUrl?: string;

    @ApiPropertyOptional({
        description: 'Notes libres',
        example: 'Achat matériel informatique',
    })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional({
        description: 'Devise',
        enum: CURRENCIES,
        default: 'TND',
    })
    @IsOptional()
    @IsIn(CURRENCIES)
    currency?: string;

    @ApiPropertyOptional({
        description: 'Est un devis (true) ou une facture (false)',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    isDevis?: boolean;

    @ApiPropertyOptional({
        description: 'Lignes de facturation (issues de l\'OCR ou saisies manuellement)',
        type: [ChargeItemDto],
        example: [
            { label: 'SOURIS RAMITECH USB TB220', total: 8.0 },
            { label: 'SOURIS SANS FILS W55 NOIR', total: 15.0 },
        ],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChargeItemDto)
    items?: ChargeItemDto[];
}