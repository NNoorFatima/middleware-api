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

        // Trigger VisPay when the chatbot marked the conversation as payment_confirmed,
        // OR when any of the last 5 messages mention "payment" / "pay".
        const messages = Array.isArray(doc.messages) ? doc.messages : [];
        const last5    = messages.slice(-5);
        const mentionsPayment = last5.some(msg => {
            const content = typeof msg.content === 'string' ? msg.content : '';
            const options = Array.isArray(msg.options) ? msg.options.join(' ') : '';
            return /\bpay(ment)?\b/i.test(content + ' ' + options);
        });

        const hasPayment = doc.last_action === 'payment_confirmed' || mentionsPayment;

        res.json({ ...doc, has_payment: hasPayment });
    } catch (err) {
        console.error('[conversations]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
