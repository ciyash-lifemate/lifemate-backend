import Joi from 'joi';
import { env } from '../../../config/env.js';

export const sendOtpSchema = Joi.object({
  mobile: Joi.string()
    .pattern(/^\+?[1-9]\d{7,14}$/)
    .required()
    .messages({ 'string.pattern.base': 'mobile must be a valid number with country code' }),
});

export const verifyOtpSchema = Joi.object({
  mobile: Joi.string()
    .pattern(/^\+?[1-9]\d{7,14}$/)
    .required(),
  otp: Joi.string()
    .length(env.otp.length)
    .pattern(/^\d+$/)
    .required(),
});

export const googleLoginSchema = Joi.object({
  idToken: Joi.string().required(),
});

export const updateProfileSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  email: Joi.string().email(),
  dateOfBirth: Joi.date().iso(),
  language: Joi.string().max(30),
  avatarUrl: Joi.string().uri(),
}).min(1);

export const searchUsersSchema = Joi.object({
  q: Joi.string().min(2).max(100).required(),
});
