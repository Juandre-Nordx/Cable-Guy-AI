const { query } = require('../models/db');
const { requiredString, validateEnum } = require('../middleware/validate');

const STATUS_VALUES = ['pending', 'in_progress', 'completed'];

async function createBooking(req, res) {
  try {
    const { kit_id, name, phone, address, problem_description } = req.body || {};
    const parsedKitId = Number(kit_id);
    const hasKitId = Number.isInteger(parsedKitId) && parsedKitId > 0;

    if (!requiredString(name) || !requiredString(phone) || !requiredString(address) || !requiredString(problem_description)) {
      return res.status(400).json({
        success: false,
        error: 'name, phone, address, and problem_description are required.'
      });
    }

    const result = await query(
      `
      INSERT INTO tech_bookings (user_id, kit_id, client_name, contact, address, problem_description, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *;
      `,
      [req.user.id, hasKitId ? parsedKitId : null, name.trim(), phone.trim(), address.trim(), problem_description.trim()]
    );

    return res.status(201).json({ success: true, booking: result.rows[0] });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ success: false, error: 'Selected kit does not exist.' });
    }
    console.error('[POST /bookings] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create booking.' });
  }
}

async function listMyBookings(req, res) {
  try {
    const result = await query('SELECT * FROM tech_bookings WHERE user_id = $1 ORDER BY created_at DESC;', [req.user.id]);
    return res.json({ success: true, bookings: result.rows });
  } catch (error) {
    console.error('[GET /bookings] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load bookings.' });
  }
}

async function updateBookingStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!Number.isInteger(id) || !validateEnum(status, STATUS_VALUES)) {
      return res.status(400).json({ success: false, error: 'Valid booking id and status are required.' });
    }

    const result = await query('UPDATE tech_bookings SET status = $2 WHERE id = $1 RETURNING *;', [id, status]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    return res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('[PUT /admin/booking/:id/status] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update booking status.' });
  }
}

module.exports = {
  createBooking,
  listMyBookings,
  updateBookingStatus
};
