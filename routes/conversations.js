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
        res.json(doc);
    } catch (err) {
        console.error('[conversations]', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
