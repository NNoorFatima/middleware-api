const express = require('express');
const router = express.Router();
const connectDb = require('../db');

// GET all sellers
router.get('/', async (req, res) => {
    try {
        const db = await connectDb();
        const sellers = await db.collection('sellers').find({}).toArray();
        res.json(sellers.map(s => ({
            ...s,
            _id:      s._id.toString(),
            sellerID: s.sellerID ? s.sellerID.toString() : '',
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET seller by ID
router.get('/:id', async (req, res) => {
    try {
        const db = await connectDb();
        const seller = await db.collection('sellers').findOne({ sellerID: req.params.id });
        if (!seller) return res.status(404).json({ error: 'Seller not found' });
        res.json(seller);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST new seller (optional, mostly used internally from users.js)
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const result = await db.collection('sellers').insertOne(req.body);
        res.json({ success: true, insertedId: result.insertedId.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;