const express = require('express');
const router = express.Router();
const connectDb = require('../db');
const { ObjectId } = require('mongodb');

// GET /orders/seller/:sellerID — all orders for a seller, customer name populated
router.get('/seller/:sellerID', async (req, res) => {
    try {
        const db = await connectDb();
        const filter = { sellerID: req.params.sellerID };
        if (req.query.status) filter.status = req.query.status;

        const orders = await db.collection('orders')
            .find(filter)
            .sort({ createdAt: -1 })
            .toArray();

        // Populate customer name via users collection
        const populated = await Promise.all(orders.map(async (order) => {
            let customerName = 'Unknown';
            try {
                if (order.customerID) {
                    const user = await db.collection('users').findOne({
                        _id: new ObjectId(order.customerID)
                    });
                    if (user) customerName = user.name;
                }
            } catch (e) { /* invalid ObjectId — leave as Unknown */ }

            return { ...order, _id: order._id.toString(), customerName };
        }));

        res.json(populated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /orders/:orderID/status — update status
router.put('/:orderID/status', async (req, res) => {
    try {
        const db = await connectDb();
        const { status } = req.body;
        const allowed = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

        if (!allowed.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const result = await db.collection('orders').updateOne(
            { orderID: req.params.orderID },
            { $set: { status } }
        );

        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
