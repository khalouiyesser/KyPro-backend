import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==================== AUTH ====================
export class LoginDto {
  @ApiProperty({ example: 'admin@company.com', description: "Email de l'utilisateur" })
  email: string;

  @ApiProperty({ example: 'Password123!', description: 'Mot de passe' })
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'Password123!', description: 'Mot de passe actuel' })
  currentPassword: string;

  @ApiProperty({ example: 'NewPassword456!', description: 'Nouveau mot de passe' })
  newPassword: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: "Email de l'utilisateur" })
  email: string;

  @ApiProperty({ description: 'Token de réinitialisation reçu par email' })
  token: string;

  @ApiProperty({ example: 'NewPassword456!', description: 'Nouveau mot de passe' })
  newPassword: string;
}

// ==================== CLIENTS ====================
export class CreateClientDto {
  @ApiProperty({ example: 'Entreprise ABC', description: "Nom de l'entreprise" })
  name: string;

  @ApiPropertyOptional({ example: 'contact@abc.com' })
  email?: string;

  @ApiPropertyOptional({ example: '+216 12345678' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Rue de la Paix 123' })
  address?: string;

  @ApiPropertyOptional({ example: 'Tunis' })
  city?: string;

  @ApiPropertyOptional({ example: '1000' })
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Tunisie' })
  country?: string;

  @ApiPropertyOptional({ example: '123456789' })
  taxNumber?: string;

  @ApiPropertyOptional({ example: 'Client régulier' })
  notes?: string;

  @ApiPropertyOptional({ default: true })
  isActive?: boolean;
}

// ==================== PRODUCTS ====================
export class CreateProductDto {
  @ApiProperty({ example: 'Produit XYZ' })
  name: string;

  @ApiPropertyOptional({ example: 'Description détaillée' })
  description?: string;

  @ApiProperty({ example: 100 })
  unitPrice: number;

  @ApiPropertyOptional({ example: 'SKU123' })
  sku?: string;

  @ApiPropertyOptional({ example: 'kg' })
  unit?: string;

  @ApiPropertyOptional({ example: 50 })
  initialQuantity?: number;

  @ApiPropertyOptional({ example: 'Catégorie produits' })
  category?: string;

  @ApiPropertyOptional({ default: true })
  isActive?: boolean;
}

// ==================== ITEMS ====================

export class VenteItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  productId: string;

  @ApiProperty({ example: 5 })
  quantity: number;

  @ApiPropertyOptional({ example: 95 })
  unitPrice?: number;

  @ApiPropertyOptional({ example: 'Nota bene' })
  notes?: string;
}

export class PurchaseItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  productId: string;

  @ApiProperty({ example: 10 })
  quantity: number;

  @ApiPropertyOptional({ example: 80 })
  unitPrice?: number;
}

export class QuoteItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439012' })
  productId: string;

  @ApiProperty({ example: 5 })
  quantity: number;

  @ApiPropertyOptional({ example: 95 })
  unitPrice?: number;
}

// ==================== VENTES ====================

export class CreateVenteDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  clientId: string;

  @ApiProperty({ type: [VenteItemDto] })
  items: VenteItemDto[];

  @ApiPropertyOptional({ example: 'Manuelle' })
  type?: string;

  @ApiPropertyOptional({ example: 'Nota de commande' })
  notes?: string;

  @ApiPropertyOptional({ example: '2025-12-31' })
  dueDate?: string;
}

// ==================== PURCHASES ====================

export class CreatePurchaseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  supplierId: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  items: PurchaseItemDto[];

  @ApiPropertyOptional({ example: 'Achat standard' })
  type?: string;

  @ApiPropertyOptional({ example: 'Livraison rapide requise' })
  notes?: string;
}

// ==================== QUOTES ====================

export class CreateQuoteDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  clientId: string;

  @ApiProperty({ type: [QuoteItemDto] })
  items: QuoteItemDto[];

  @ApiPropertyOptional({ example: '2025-12-31' })
  validUntil?: string;

  @ApiPropertyOptional({ example: 'Devis valide 30 jours' })
  notes?: string;
}

// ==================== RESPONSES ====================

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Opération réussie' })
  message: string;

  @ApiPropertyOptional()
  data?: any;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: "Une erreur s'est produite" })
  message: string;

  @ApiPropertyOptional({ example: 'BAD_REQUEST' })
  error?: string;
}

export class PaginatedResponseDto {
  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ type: 'array' })
  data: any[];
}