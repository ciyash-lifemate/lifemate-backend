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
import * as groupsService from './reminder-groups.service.js';

export const createGroup = asyncHandler(async (req, res) => {
  const group = await groupsService.createGroup(req.userId, req.body);
  sendSuccess(res, { statusCode: 201, data: group });
});

export const getGroups = asyncHandler(async (req, res) => {
  const groups = await groupsService.listGroups(req.userId, req.query.projectId);
  sendSuccess(res, { data: groups });
});

export const getGroup = asyncHandler(async (req, res) => {
  const group = await groupsService.getGroup(req.params.id, req.userId);
  sendSuccess(res, { data: group });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const group = await groupsService.updateGroup(req.params.id, req.userId, req.body);
  sendSuccess(res, { data: group });
});

export const deleteGroup = asyncHandler(async (req, res) => {
  await groupsService.deleteGroup(req.params.id, req.userId);
  sendSuccess(res, { message: 'Group deleted' });
});

export const setSelfReminder = asyncHandler(async (req, res) => {
  const group = await groupsService.toggleSelfReminder(req.params.id, req.userId, req.body.enabled);
  sendSuccess(res, { data: group });
});

export const addMembers = asyncHandler(async (req, res) => {
  const group = await groupsService.addMembers(req.params.id, req.userId, req.body.userIds);
  sendSuccess(res, { statusCode: 201, data: group });
});

export const removeMember = asyncHandler(async (req, res) => {
  const group = await groupsService.removeMember(req.params.id, req.userId, req.params.userId);
  sendSuccess(res, { data: group });
});

export const setMemberAccess = asyncHandler(async (req, res) => {
  const group = await groupsService.setMemberAccess(req.params.id, req.userId, req.params.userId, req.body.enabled);
  sendSuccess(res, { data: group });
});
