import { z } from 'zod';
import { validatePasswordStrength } from '../../shared/password.js';

/**
 * Schemas do módulo de autenticação.
 * Mensagens em pt-BR: elas chegam direto na tela do usuário.
 */

const emailSchema = z
  .string({ required_error: 'Informe o e-mail.' })
  .min(3, 'Informe o e-mail.')
  .max(254, 'E-mail muito longo.')
  .trim()
  .toLowerCase()
  .email('E-mail inválido.');

const passwordSchema = z
  .string({ required_error: 'Informe a senha.' })
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128, 'Senha muito longa.')
  .superRefine((value, ctx) => {
    const check = validatePasswordStrength(value);
    if (!check.valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.message });
  });

export const registerSchema = z
  .object({
    name: z
      .string({ required_error: 'Informe seu nome.' })
      .trim()
      .min(2, 'O nome precisa ter pelo menos 2 letras.')
      .max(120, 'Nome muito longo.'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string({ required_error: 'Confirme a senha.' }),
    acceptTerms: z.boolean().optional().default(true),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'Informe a senha.' }).min(1, 'Informe a senha.'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string({ required_error: 'Token ausente.' }).min(10, 'Token inválido.'),
    password: passwordSchema,
    confirmPassword: z.string({ required_error: 'Confirme a senha.' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ required_error: 'Informe a senha atual.' }).min(1),
    newPassword: passwordSchema,
    confirmNewPassword: z.string({ required_error: 'Confirme a nova senha.' }),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmNewPassword'],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'A nova senha deve ser diferente da atual.',
    path: ['newPassword'],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
});
