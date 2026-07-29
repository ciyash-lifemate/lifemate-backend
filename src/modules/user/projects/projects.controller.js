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
import * as projectsService from './projects.service.js';

export const createProject = asyncHandler(async (req, res) => {
  const project = await projectsService.createProject(req.userId, req.body);
  sendSuccess(res, { statusCode: 201, data: project });
});

export const getProjects = asyncHandler(async (req, res) => {
  const projects = await projectsService.listProjects(req.userId, req.query.companyId);
  sendSuccess(res, { data: projects });
});

export const getProject = asyncHandler(async (req, res) => {
  const project = await projectsService.getProject(req.params.id, req.userId);
  sendSuccess(res, { data: project });
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await projectsService.updateProject(req.params.id, req.userId, req.body);
  sendSuccess(res, { data: project });
});

export const deleteProject = asyncHandler(async (req, res) => {
  await projectsService.deleteProject(req.params.id, req.userId);
  sendSuccess(res, { message: 'Project deleted' });
});
