import {ApiProperty} from "@nestjs/swagger";
import {IsDateString, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString} from "class-validator";





export class CreatePaymentVenteDto {
    @ApiProperty({ description: 'Montant du paiement' })
    @IsNumber()
    @IsNotEmpty()
    amount: number;

    @ApiProperty({ description: 'Date du paiement', required: false })
    @IsDateString()
    @IsOptional()
    date?: Date;

    @ApiProperty({ description: 'Remarques ou notes', required: false })
    @IsString()
    @IsOptional()
    note?: string;

    @ApiProperty({ description: 'ID du fournisseur' })
    @IsMongoId()
    @IsNotEmpty()
    clientId: string;

    @ApiProperty({ description: 'ID de l’utilisateur qui enregistre le paiement' })
    @IsMongoId()
    @IsNotEmpty()
    userId: string;


    @ApiProperty({ description: 'ID de la vente qui enregistre le paiement' })
    @IsMongoId()
    @IsOptional()
    saleId: string;


}
