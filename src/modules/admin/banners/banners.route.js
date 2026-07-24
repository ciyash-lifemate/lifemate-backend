import { Router } from 'express';
import { validateCreateBanner, validateUpdateBanner } from './banners.validation.js';
import {
  createBanner,
  getBanners,
  getActiveBanners,
  getBanner,
  updateBanner,
  deleteBanner,
} from './banners.controller.js';

// Admin CRUD - mounted under /api/v1/admin/banners (authenticateAdmin is
// applied by routes/admin.routes.js, same as every other admin sub-router)
const adminRouter = Router();
adminRouter.get('/', getBanners);
adminRouter.post('/', validateCreateBanner, createBanner);
adminRouter.get('/:id', getBanner);
adminRouter.put('/:id', validateUpdateBanner, updateBanner);
adminRouter.delete('/:id', deleteBanner);
export const bannerAdminRoutes = adminRouter;

// Public read-only feed for the mobile app - mounted under /api/v1/banners
const publicRouter = Router();
publicRouter.get('/', getActiveBanners);
export const bannerPublicRoutes = publicRouter;
