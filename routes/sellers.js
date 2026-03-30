const express = require('express');
const router = express.Router();
const connectDb = require('../db');
const { ObjectId } = require('mongodb');

// GET all sellers
router.get('/', async (req, res) => {
    try {
        const db = await connectDb();
        const sellers = await db.collection('sellers').find({}).toArray();
        res.json(sellers.map(s => ({
            ...s,
            _id:      s._id.toString(),
            sellerID: s.sellerID ? s.sellerID.toString() : '',  // ObjectId → string for frontend
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET seller by ID (req.params.id = users._id string)
router.get('/:id', async (req, res) => {
    try {
        const db = await connectDb();
        // sellerID stored as ObjectId — convert param string to ObjectId
        let seller = null;
        try {
            seller = await db.collection('sellers').findOne({ sellerID: new ObjectId(req.params.id) });
        } catch (e) {}
        // Fallback: string match for legacy docs
        if (!seller) seller = await db.collection('sellers').findOne({ sellerID: req.params.id });
        if (!seller) return res.status(404).json({ error: 'Seller not found' });
        res.json({ ...seller, _id: seller._id.toString(), sellerID: seller.sellerID?.toString() ?? '' });
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