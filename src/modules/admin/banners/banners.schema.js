import Joi from 'joi';

export const createBannerSchema = Joi.object({
  title: Joi.string().min(1).max(150).required(),
  imageUrl: Joi.string().uri().required(),
  linkUrl: Joi.string().uri().allow(null, ''),
  isActive: Joi.boolean().default(true),
  startDate: Joi.date().iso().allow(null),
  endDate: Joi.date().iso().allow(null).min(Joi.ref('startDate')),
});

export const updateBannerSchema = Joi.object({
  title: Joi.string().min(1).max(150),
  imageUrl: Joi.string().uri(),
  linkUrl: Joi.string().uri().allow(null, ''),
  isActive: Joi.boolean(),
  startDate: Joi.date().iso().allow(null),
  endDate: Joi.date().iso().allow(null),
}).min(1);
