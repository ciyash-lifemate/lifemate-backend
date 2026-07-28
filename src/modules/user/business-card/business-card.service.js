import { pool } from '../../../config/db.js';

const CARD_FIELDS =
  'card_name, card_designation, card_company, card_phone, card_email, card_website, card_address, card_template';

export const getBusinessCard = async (userId) => {
  const [rows] = await pool.query(`SELECT ${CARD_FIELDS} FROM users WHERE id = ?`, [userId]);
  return rows[0] || {};
};

// A full-form save (the edit screen always submits the whole card), so this
// sets every field directly rather than COALESCE-ing - clearing a field to
// blank has to actually clear it.
export const updateBusinessCard = async (
  userId,
  { cardName, cardDesignation, cardCompany, cardPhone, cardEmail, cardWebsite, cardAddress, cardTemplate }
) => {
  await pool.query(
    `UPDATE users SET
      card_name = ?,
      card_designation = ?,
      card_company = ?,
      card_phone = ?,
      card_email = ?,
      card_website = ?,
      card_address = ?,
      card_template = ?
     WHERE id = ?`,
    [
      cardName || null,
      cardDesignation || null,
      cardCompany || null,
      cardPhone || null,
      cardEmail || null,
      cardWebsite || null,
      cardAddress || null,
      cardTemplate || null,
      userId,
    ]
  );
  return getBusinessCard(userId);
};
