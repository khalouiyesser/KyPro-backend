import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'yesser.khaloui@esprit.tn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456789' })
  @IsNotEmpty()
  @IsString()
  password: string;
}
