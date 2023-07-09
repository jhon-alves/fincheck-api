import { 
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsHexColor
} from 'class-validator';
import { BankAccountType } from '../entities/BankAccount';


export class CreateBankAccountDto {
  @IsString({ message: 'O nome precisa ser uma string!' })
  @IsNotEmpty({ message: 'O nome precisa ser preenchido!' })
  name: string;

  @IsNumber({}, { message: 'InitialBalance precisa ser uma string!' })
  @IsNotEmpty({ message: 'InitialBalance precisa ser preenchido!' })
  initialBalance: number;
  
  @IsNotEmpty({ message: 'type precisa ser preenchido!' })
  @IsEnum(BankAccountType)
  type: BankAccountType;

  @IsHexColor()
  @IsString({ message: 'A cor precisa ser uma string!' })
  @IsNotEmpty({ message: 'A cor precisa ser preenchida!' })
  color: string;
}
