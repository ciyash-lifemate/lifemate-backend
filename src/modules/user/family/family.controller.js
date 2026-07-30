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

import * as familyService from './family.service.js';

export const getMyGroup = asyncHandler(async (req, res) => {
  const group = await familyService.getMyGroup(req.userId);
  sendSuccess(res, { data: group });
});

export const createGroup = asyncHandler(async (req, res) => {
  const group = await familyService.createGroup(req.userId, req.body);
  sendSuccess(res, { statusCode: 201, message: 'Family group created', data: group });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const group = await familyService.updateGroup(req.userId, req.body);
  sendSuccess(res, { message: 'Group updated', data: group });
});

export const leaveGroup = asyncHandler(async (req, res) => {
  await familyService.leaveGroup(req.userId);
  sendSuccess(res, { message: 'Left family group' });
});

export const inviteMember = asyncHandler(async (req, res) => {
  const group = await familyService.inviteMember(req.userId, req.body);
  sendSuccess(res, { message: 'Member added', data: group });
});

export const updateMember = asyncHandler(async (req, res) => {
  const group = await familyService.updateMemberPermission(req.userId, req.params.id, req.body);
  sendSuccess(res, { message: 'Permission updated', data: group });
});

export const removeMember = asyncHandler(async (req, res) => {
  const group = await familyService.removeMember(req.userId, req.params.id);
  sendSuccess(res, { message: 'Member removed', data: group });
});

export const listSharedReminders = asyncHandler(async (req, res) => {
  const reminders = await familyService.listSharedReminders(req.userId, req.query);
  sendSuccess(res, { data: reminders });
});
