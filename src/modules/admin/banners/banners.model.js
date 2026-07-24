import { pool } from '../../../config/db.js';

export const insertBanner = async ({ title, imageUrl, linkUrl, isActive, startDate, endDate }) => {
  const [result] = await pool.query(
    `INSERT INTO banners (title, image_url, link_url, is_active, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, imageUrl, linkUrl || null, isActive, startDate || null, endDate || null]
  );
  return findBannerById(result.insertId);
};

export const findBannerById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM banners WHERE id = ?', [id]);
  return rows[0];
};

export const findAllBanners = async () => {
  const [rows] = await pool.query('SELECT * FROM banners ORDER BY created_at DESC');
  return rows;
};

export const findActiveBanners = async () => {
  const [rows] = await pool.query(
    `SELECT id, title, image_url, link_url FROM banners
     WHERE is_active = TRUE
       AND (start_date IS NULL OR start_date <= CURDATE())
       AND (end_date IS NULL OR end_date >= CURDATE())
     ORDER BY created_at DESC`
  );
  return rows;
};

export const updateBannerById = async (id, { title, imageUrl, linkUrl, isActive, startDate, endDate }) => {
  await pool.query(
    `UPDATE banners SET
      title = COALESCE(?, title),
      image_url = COALESCE(?, image_url),
      link_url = COALESCE(?, link_url),
      is_active = COALESCE(?, is_active),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date)
     WHERE id = ?`,
    [title, imageUrl, linkUrl, isActive, startDate, endDate, id]
  );
  return findBannerById(id);
};

export const deleteBannerById = async (id) => {
  const [result] = await pool.query('DELETE FROM banners WHERE id = ?', [id]);
  return result.affectedRows > 0;
};
