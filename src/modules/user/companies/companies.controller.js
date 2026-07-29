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
import * as companiesService from './companies.service.js';

export const createCompany = asyncHandler(async (req, res) => {
  const company = await companiesService.createCompany(req.userId, req.body);
  sendSuccess(res, { statusCode: 201, data: company });
});

export const getCompanies = asyncHandler(async (req, res) => {
  const companies = await companiesService.listCompanies(req.userId);
  sendSuccess(res, { data: companies });
});

export const getCompany = asyncHandler(async (req, res) => {
  const company = await companiesService.getCompany(req.params.id, req.userId);
  sendSuccess(res, { data: company });
});

export const updateCompany = asyncHandler(async (req, res) => {
  const company = await companiesService.updateCompany(req.params.id, req.userId, req.body);
  sendSuccess(res, { data: company });
});

export const deleteCompany = asyncHandler(async (req, res) => {
  await companiesService.deleteCompany(req.params.id, req.userId);
  sendSuccess(res, { message: 'Company deleted' });
});
