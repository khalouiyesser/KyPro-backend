import {
    IsEmail, IsNotEmpty, IsOptional, IsString,
    IsBoolean, IsEnum, IsNumber, IsDateString,
    ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminDto {
    @ApiProperty() @IsNotEmpty() @IsString() name: string;
    @ApiProperty() @IsEmail() email: string;
    @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class CompanyDto {
    @ApiProperty() @IsNotEmpty() @IsString() name: string;
    @ApiProperty() @IsNotEmpty() @IsString() formeJuridique: string;
    @ApiProperty() @IsNotEmpty() @IsEmail() email: string;
    @ApiProperty() @IsNotEmpty() @IsString() phone: string;
    @ApiProperty() @IsNotEmpty() @IsString() gouvernorat: string;
    @ApiProperty() @IsNotEmpty() @IsString() fiscalRegime: string;
    @ApiProperty() @IsNotEmpty() @IsString() activityType: string;

    @ApiPropertyOptional() @IsOptional() @IsString() matriculeFiscal?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() rne?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() fax?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() codePostal?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
    @ApiPropertyOptional() @IsOptional() @IsBoolean() assujettTVA?: boolean;
    @ApiPropertyOptional() @IsOptional() @IsString() categorieEntreprise?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() primaryColor?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
    @ApiPropertyOptional({ enum: ['trial','starter','professional','enterprise'] })
    @IsOptional() @IsEnum(['trial','starter','professional','enterprise']) plan?: string;
    @ApiPropertyOptional({ enum: ['active','trial','suspended','expired','cancelled'] })
    @IsOptional() @IsEnum(['active','trial','suspended','expired','cancelled']) subscriptionStatus?: string;
    @ApiPropertyOptional() @IsOptional() @IsDateString() subscriptionStartAt?: string;
    @ApiPropertyOptional() @IsOptional() @IsDateString() subscriptionExpiresAt?: string;
    @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) amountPaid?: number;
    @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) ocrLimitPerMonth?: number;
    @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateCompanyWithAdminDto {
    @ApiProperty({ type: CompanyDto })
    @ValidateNested() @Type(() => CompanyDto)
    company: CompanyDto;

    @ApiProperty({ type: AdminDto })
    @ValidateNested() @Type(() => AdminDto)
    admin: AdminDto;
}