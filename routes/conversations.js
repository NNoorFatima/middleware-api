const express   = require('express');
const router    = express.Router();
const connectDb = require('../db');

// GET /conversations/:customerID/:sellerID
// customerID and sellerID are stored as plain strings in the chatbot's conversations collection.
router.get('/:customerID/:sellerID', async (req, res) => {
    try {
        const db  = await connectDb();
        const doc = await db.collection('conversations').findOne({
            customerID: req.params.customerID,
            sellerID:   req.params.sellerID,
            status:     'active',
        });
        if (!doc) return res.json(null);

        // Check last 5 messages for a "pay" option (case-insensitive)
        const messages  = Array.isArray(doc.messages) ? doc.messages : [];
        const last5     = messages.slice(-5);
        const hasPayment = last5.some(msg =>
            Array.isArray(msg.options) &&
            msg.options.some(opt => opt.toLowerCase().includes('pay'))
        );

        res.json({ ...doc, has_payment: hasPayment });
    } catch (err) {
        console.error('[conversations]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
