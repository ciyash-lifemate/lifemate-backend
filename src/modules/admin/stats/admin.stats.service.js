import { countTable } from '../../user/user-auth/user.auth.service.js';

const TABLES = ['users', 'reminders', 'notes'];

export const getStats = async () => {
  const entries = await Promise.all(TABLES.map(async (table) => [table, await countTable(table)]));
  return Object.fromEntries(entries);
};
