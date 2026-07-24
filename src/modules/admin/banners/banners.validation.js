import { validate } from '../../../middlewares/validate.middleware.js';
import { createBannerSchema, updateBannerSchema } from './banners.schema.js';

export const validateCreateBanner = validate(createBannerSchema);
export const validateUpdateBanner = validate(updateBannerSchema);
