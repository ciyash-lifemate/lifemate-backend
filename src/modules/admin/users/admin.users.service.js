class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}
import {
  findAllUsersPaged,
  findUserById,
  setUserActive,
  deleteUserById,
} from '../../user/user-auth/user.auth.service.js';

export const listUsers = (query) => findAllUsersPaged(query);

export const getUser = async (id) => {
  const user = await findUserById(id);
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

export const setActive = async (id, isActive) => {
  await getUser(id);
  return setUserActive(id, isActive);
};

export const removeUser = async (id) => {
  const deleted = await deleteUserById(id);
  if (!deleted) throw new ApiError(404, 'User not found');
};
