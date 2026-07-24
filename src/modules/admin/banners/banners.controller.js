const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const sendSuccess = (res, { statusCode = 200, message, data } = {}) => {
  res.status(statusCode).json({
    success: true,
    ...(message !== undefined && { message }),
    ...(data !== undefined && { data }),
  });
};
import * as bannersService from './banners.service.js';

export const createBanner = asyncHandler(async (req, res) => {
  const banner = await bannersService.createBanner(req.body);
  sendSuccess(res, { statusCode: 201, data: banner });
});

export const getBanners = asyncHandler(async (req, res) => {
  const banners = await bannersService.listBanners();
  sendSuccess(res, { data: banners });
});

export const getActiveBanners = asyncHandler(async (req, res) => {
  const banners = await bannersService.listActiveBanners();
  sendSuccess(res, { data: banners });
});

export const getBanner = asyncHandler(async (req, res) => {
  const banner = await bannersService.getBanner(req.params.id);
  sendSuccess(res, { data: banner });
});

export const updateBanner = asyncHandler(async (req, res) => {
  const banner = await bannersService.updateBanner(req.params.id, req.body);
  sendSuccess(res, { data: banner });
});

export const deleteBanner = asyncHandler(async (req, res) => {
  await bannersService.removeBanner(req.params.id);
  sendSuccess(res, { message: 'Banner deleted' });
});
