import { ApiProperty } from '@nestjs/swagger';
import {
    IsString, IsUrl, IsNotEmpty, IsIn, IsOptional,
    IsNumber, IsBoolean, IsArray, ValidateNested, Min, MaxLength,
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
        example: 'application/pdf',
    })
    @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
    mimeType: string;
}

// ── Charge DTOs ───────────────────────────────────────────────────────────────

export class ChargeItemDto {
    @ApiProperty({ description: 'Désignation de la ligne', example: 'Souris USB' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    label: string;

    @ApiProperty({ description: 'Montant TTC de la ligne', example: 15.0 })
    @IsNumber()
    @Min(0)
    total: number;
}

export class CreateChargeDto {
    @ApiProperty({ example: 'Facture E-INFO N°68' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    description: string;

    @ApiProperty({ example: 279.0 })
    @IsNumber()
    @Min(0)
    amount: number;

    @ApiProperty({ required: false, example: 273.682 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    amountHT?: number;

    @ApiProperty({ required: false, example: 7 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    tva?: number;

    @ApiProperty({ example: '2024-03-16' })
    @IsString()
    @IsNotEmpty()
    date: string;

    @ApiProperty({
        required: false,
        enum: ['rent','salary','utilities','equipment','marketing',
            'tax','insurance','accounting','fuel','other'],
        default: 'other',
    })
    @IsOptional()
    @IsIn(['rent','salary','utilities','equipment','marketing',
        'tax','insurance','accounting','fuel','other'])
    type?: string;

    @ApiProperty({ required: false, example: '68' })
    @IsOptional()
    @IsString()
    source?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    imageUrl?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiProperty({ required: false, enum: ['TND','EUR','USD','other'], default: 'TND' })
    @IsOptional()
    @IsIn(['TND','EUR','USD','other'])
    currency?: string;

    @ApiProperty({ required: false, default: false })
    @IsOptional()
    @IsBoolean()
    isDevis?: boolean;

    @ApiProperty({ required: false, type: [ChargeItemDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChargeItemDto)
    items?: ChargeItemDto[];
}