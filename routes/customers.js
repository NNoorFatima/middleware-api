const express = require('express');
const router = express.Router();
const connectDb = require('../db');
const { ObjectId } = require('mongodb');

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

// GET customer by ID (req.params.id = users._id string)
router.get('/:id', async (req, res) => {
    try {
        const db = await connectDb();
        // customerID stored as ObjectId — convert param string to ObjectId
        let customer = null;
        try {
            customer = await db.collection('customers').findOne({ customerID: new ObjectId(req.params.id) });
        } catch (e) {}
        // Fallback: string match for legacy docs
        if (!customer) customer = await db.collection('customers').findOne({ customerID: req.params.id });
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json({ ...customer, _id: customer._id.toString(), customerID: customer.customerID?.toString() ?? '' });
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