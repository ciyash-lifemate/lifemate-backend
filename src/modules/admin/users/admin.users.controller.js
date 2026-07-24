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
import * as adminUsersService from './admin.users.service.js';

export const getUsers = asyncHandler(async (req, res) => {
  const result = await adminUsersService.listUsers(req.query);
  sendSuccess(res, { data: result });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await adminUsersService.getUser(req.params.id);
  sendSuccess(res, { data: user });
});

export const setUserActive = asyncHandler(async (req, res) => {
  const user = await adminUsersService.setActive(req.params.id, req.body.isActive);
  sendSuccess(res, { data: user });
});

export const deleteUser = asyncHandler(async (req, res) => {
  await adminUsersService.removeUser(req.params.id);
  sendSuccess(res, { message: 'User deleted' });
});
