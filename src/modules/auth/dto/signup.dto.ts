import { IsNotEmpty, IsString, IsEmail, MinLength } from 'class-validator';

export class SignupDto {
  @IsString({ message: 'O nome precisa ser uma string!' })
  @IsNotEmpty({ message: 'O nome precisa ser preenchido!' })
  name: string;

  @IsString({ message: 'O e-mail precisa ser uma string!' })
  @IsNotEmpty({ message: 'O e-mail precisa ser preenchido!' })
  @IsEmail()
  email: string;

  @IsString({ message: 'A senha precisa ser uma string!' })
  @IsNotEmpty({ message: 'A senha precisa ser preenchida!' })
  @MinLength(8, { message: 'A senha precisa ter no mínimo 8 caracteres!' })
  password: string;
}
