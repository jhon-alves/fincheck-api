import { z } from 'zod';

export const signinSchema = z.object({
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(8, 'A senha precisa ter no mínimo 8 caracteres'),
});

export const signupSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  email: z.email('Informe um e-mail válido'),
  password: z.string().min(8, 'A senha precisa ter no mínimo 8 caracteres'),
});

export type SigninBody = z.infer<typeof signinSchema>;
export type SignupBody = z.infer<typeof signupSchema>;
