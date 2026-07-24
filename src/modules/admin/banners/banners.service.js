import * as bannersModel from './banners.model.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export const createBanner = (payload) => bannersModel.insertBanner(payload);

export const listBanners = () => bannersModel.findAllBanners();

export const listActiveBanners = () => bannersModel.findActiveBanners();

export const getBanner = async (id) => {
  const banner = await bannersModel.findBannerById(id);
  if (!banner) throw new ApiError(404, 'Banner not found');
  return banner;
};

export const updateBanner = async (id, payload) => {
  await getBanner(id);
  return bannersModel.updateBannerById(id, payload);
};

export const removeBanner = async (id) => {
  const deleted = await bannersModel.deleteBannerById(id);
  if (!deleted) throw new ApiError(404, 'Banner not found');
};
