// routes/users.js
const express = require('express');
const router = express.Router();
const connectDb = require('../db');
const bcrypt = require('bcryptjs'); // for password hashing

// GET all users
router.get('/', async (req, res) => {
    try {
        const db = await connectDb();
        const users = await db.collection('users').find({}).toArray();
        res.json(users.map(u => ({ ...u, _id: u._id.toString() })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET user by email
router.get('/:email', async (req, res) => {
    try {
        const db = await connectDb();
        const email = decodeURIComponent(req.params.email);
        const user = await db.collection('users').findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ ...user, _id: user._id.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// POST new user
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { name, email, password_plain, role, shop_name, address, contact_info } = req.body;

        // Check existing email
        const existing = await db.collection('users').findOne({ email });
        if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });

        // Hash password
        const hashedPassword = await bcrypt.hash(password_plain, 10);
        const now = new Date();

        // Insert into users
        const userResult = await db.collection('users').insertOne({
            name,
            email,
            password: hashedPassword,
            role,
            createdAt: now
        });

        const userId = userResult.insertedId.toString();

        // Role-specific insert
        if (role === 'seller') {
            await db.collection('sellers').insertOne({
                sellerID: userId,
                shopName: shop_name || '',
                inventory: null,
                ordersHandled: []
            });
        } else {
            await db.collection('customers').insertOne({
                customerID: userId,
                address: address || '',
                contactInfo: contact_info || '',
                orderHistory: [],
                wishlist: []
            });
        }

        res.json({ success: true, user_id: userId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /users/:id — update user (you can add fields)
router.put('/:id', async (req, res) => {
    try {
        const db = await connectDb();
        const userId = req.params.id;
        const updateData = req.body;

        const result = await db.collection('users').updateOne(
            { _id: require('mongodb').ObjectId(userId) },
            { $set: updateData }
        );

        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /users/:id
router.delete('/:id', async (req, res) => {
    try {
        const db = await connectDb();
        const userId = req.params.id;

        await db.collection('users').deleteOne({ _id: require('mongodb').ObjectId(userId) });
        // Optional: delete from sellers/customers
        await db.collection('sellers').deleteOne({ sellerID: userId });
        await db.collection('customers').deleteOne({ customerID: userId });

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;