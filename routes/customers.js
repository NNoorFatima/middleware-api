const express = require('express');
const router = express.Router();
const connectDb = require('../db');

// GET all customers
router.get('/', async (req, res) => {
    try {
        const db = await connectDb();
        const customers = await db.collection('customers').find({}).toArray();
        res.json(customers.map(c => ({ ...c, _id: c._id.toString() })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET customer by ID
router.get('/:id', async (req, res) => {
    try {
        const db = await connectDb();
        const customer = await db.collection('customers').findOne({ customerID: req.params.id });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST new customer (optional)
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const result = await db.collection('customers').insertOne(req.body);
        res.json({ success: true, insertedId: result.insertedId.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;