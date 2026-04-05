const { query } = require('../models/db');
const { requiredString, validateEnum } = require('../middleware/validate');

const STATUS_VALUES = ['pending', 'confirmed', 'done'];

async function createBooking(req, res) {
  try {
    const { kit_id, name, phone, address } = req.body || {};

    if (!requiredString(name) || !requiredString(phone) || !requiredString(address) || !Number.isInteger(Number(kit_id))) {
      return res.status(400).json({
        success: false,
        error: 'kit_id, name, phone, and address are required.'
      });
    }

    const result = await query(
      `
      INSERT INTO bookings (user_id, kit_id, name, phone, address, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *;
      `,
      [req.user.id, Number(kit_id), name.trim(), phone.trim(), address.trim()]
    );

    return res.status(201).json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('[POST /bookings] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create booking.' });
  }
}

async function listMyBookings(req, res) {
  try {
    const result = await query('SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC;', [req.user.id]);
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

    const result = await query('UPDATE bookings SET status = $2 WHERE id = $1 RETURNING *;', [id, status]);
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
