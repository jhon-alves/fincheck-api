import { IsNotEmpty, IsString, IsNumber, IsEnum, IsUUID, IsPositive, IsDateString } from 'class-validator';
import { TransactionType } from '../entities/Transaction';

export class CreateTransactionDto {
  @IsString({ message: 'bankAccountId precisa ser uma string!' })
  @IsNotEmpty({ message: 'bankAccountId precisa ser enviado!' })
  @IsUUID()
  bankAccountId: string;

  @IsString({ message: 'categoryId precisa ser uma string!' })
  @IsNotEmpty({ message: 'categoryId precisa ser enviado!' })
  @IsUUID()
  categoryId?: string;

  @IsString({ message: 'name precisa ser uma string!' })
  @IsNotEmpty({ message: 'name precisa ser preenchido!' })
  name: string;

  @IsNumber({}, { message: 'value precisa ser uma string!' })
  @IsNotEmpty({ message: 'value precisa ser preenchido!' })
  @IsPositive()
  value: number;

  @IsDateString()
  @IsNotEmpty({ message: 'date precisa ser preenchido!' })
  date: string;

  @IsNotEmpty({ message: 'type precisa ser preenchido!' })
  @IsEnum(TransactionType)
  type: TransactionType
}
