import { IsString, IsNumber, IsOptional, IsBoolean, IsDateString, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CODES_VALIDES = ['HON', 'LOY', 'MAR', 'IMP', 'IMP2', 'REV', 'SRV', 'INT', 'ASS', 'VAC', 'JET', 'LOF', 'PVT', 'TVA', 'AGR'];

/* ── DTO Création RAS Débiteur ───────────────────────────────────── */
export class CreateRasDebiteurDto {
    @ApiPropertyOptional() @IsOptional() @IsString() achatId?:       string;
    @ApiPropertyOptional() @IsOptional() @IsString() fournisseurId?: string;

    @ApiProperty() @IsString()                fournisseurName:      string;
    @ApiProperty() @IsString()                matriculeFournisseur: string;

    @ApiProperty({ enum: CODES_VALIDES })
    @IsString()
    @IsIn(CODES_VALIDES)
    codeOperation: string;

    @ApiProperty() @IsNumber() @Min(0.001) montantBrut: number;
    @ApiProperty() @IsNumber() @Min(0)    tauxRAS:     number;
    @ApiProperty() @IsNumber() @Min(0)    montantRAS:  number;
    @ApiProperty() @IsNumber() @Min(0)    netPaye:     number;

    @ApiProperty() @IsDateString() datePaiement: string;
    @ApiProperty() @IsNumber()     exercice:     number;
    @ApiProperty() @IsNumber()     mois:         number;

    @ApiPropertyOptional() @IsOptional() @IsString() certificatTEJNumero?: string;
}

/* ── DTO Update RAS Débiteur ─────────────────────────────────────── */
export class UpdateRasDebiteurDto {
    @ApiPropertyOptional() @IsOptional() @IsBoolean() reversee?:             boolean;
    @ApiPropertyOptional() @IsOptional() @IsString()  certificatTEJNumero?:  string;
    @ApiPropertyOptional() @IsOptional() @IsNumber()  montantBrut?:          number;
    @ApiPropertyOptional() @IsOptional() @IsNumber()  tauxRAS?:              number;
    @ApiPropertyOptional() @IsOptional() @IsNumber()  montantRAS?:           number;
    @ApiPropertyOptional() @IsOptional() @IsNumber()  netPaye?:              number;
}

/* ── DTO Export XML TEJ ──────────────────────────────────────────── */
export class ExportXmlDto {
    @ApiProperty() @IsNumber() exercice:  number;
    @ApiProperty() @IsNumber() mois:      number;
    @ApiPropertyOptional({ enum: [0, 1], default: 0 })
    @IsOptional() @IsNumber() @IsIn([0, 1])
    codeActe?: 0 | 1;
}

/* ── DTO Création RAS Bénéficiaire ───────────────────────────────── */
export class CreateRasBeneficiaireDto {
    @ApiPropertyOptional() @IsOptional() @IsString() venteId?:  string;
    @ApiPropertyOptional() @IsOptional() @IsString() clientId?: string;

    @ApiProperty() @IsString() clientName:          string;
    @ApiProperty() @IsString() matriculeClient:     string;
    @ApiProperty() @IsString() numeroCertificatTEJ: string;

    @ApiProperty({ enum: CODES_VALIDES })
    @IsString()
    @IsIn(CODES_VALIDES)
    codeOperation: string;

    @ApiProperty() @IsNumber() @Min(0.001) montantBrut: number;
    @ApiProperty() @IsNumber() @Min(0)    tauxRAS:     number;
    @ApiProperty() @IsNumber() @Min(0)    montantRAS:  number;

    @ApiProperty() @IsDateString() dateEncaissement: string;
    @ApiProperty() @IsNumber()     exercice:         number;
    @ApiProperty() @IsNumber()     mois:             number;
}

/* ── DTO Update RAS Bénéficiaire ─────────────────────────────────── */
export class UpdateRasBeneficiaireDto {
    @ApiPropertyOptional() @IsOptional() @IsBoolean() utilise?:             boolean;
    @ApiPropertyOptional() @IsOptional() @IsString()  numeroCertificatTEJ?: string;
    @ApiPropertyOptional() @IsOptional() @IsNumber()  montantBrut?:         number;
    @ApiPropertyOptional() @IsOptional() @IsNumber()  tauxRAS?:             number;
    @ApiPropertyOptional() @IsOptional() @IsNumber()  montantRAS?:          number;
}