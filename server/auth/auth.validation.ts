import { z } from 'zod';

export const RegisterRequestSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Please provide a valid email address')
    .max(255, 'Email cannot exceed 255 characters')
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const LoginRequestSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Please provide a valid email address')
    .max(255, 'Email cannot exceed 255 characters')
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export type RegisterRequestDto = z.infer<typeof RegisterRequestSchema>;
export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;
