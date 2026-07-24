import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { pool } from '../src/config/db.js';
import { createAdmin, findAdminByEmail } from '../src/modules/admin/admin-auth/admin.auth.model.js';

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
  console.error('Usage: npm run admin:create -- "<name>" <email> <password>');
  process.exit(1);
}

const run = async () => {
  const existing = await findAdminByEmail(email);
  if (existing) {
    console.error(`An admin with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const admin = await createAdmin({ name, email, passwordHash });
  console.log('Admin created:', { id: admin.id, name: admin.name, email: admin.email });
  await pool.end();
};

run().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
