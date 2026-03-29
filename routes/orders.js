const express = require('express');
const router = express.Router();
const connectDb = require('../db');
const { ObjectId } = require('mongodb');

// GET /orders/seller/:userMongoId — all orders for a seller
// :userMongoId is the user's _id (stored as aiva_mongo_id in WordPress)
router.get('/seller/:userMongoId', async (req, res) => {
    try {
        const db = await connectDb();

        // Step 1: find the seller doc whose sellerID = the user's _id
        // sellerID in sellers collection may be stored as ObjectId or string — try both
        let seller = null;
        try {
            seller = await db.collection('sellers').findOne({
                sellerID: new ObjectId(req.params.userMongoId)
            });
        } catch(e) {}

        if (!seller) {
            seller = await db.collection('sellers').findOne({
                sellerID: req.params.userMongoId
            });
        }

        if (!seller) return res.json([]);

        // Step 2: fetch orders where sellerID = seller._id (ObjectId)
        const filter = { sellerID: seller._id };
        if (req.query.status) filter.status = req.query.status;

        const orders = await db.collection('orders')
            .find(filter)
            .sort({ createdAt: -1 })
            .toArray();

        // Step 3: populate customerName
        // orders.customerID → customers._id → customers.customerID → users._id → users.name
        const populated = await Promise.all(orders.map(async (order) => {
            let customerName = 'Unknown';
            try {
                if (order.customerID) {
                    const customer = await db.collection('customers').findOne({
                        _id: order.customerID  // already an ObjectId ref
                    });
                    if (customer && customer.customerID) {
                        let user = null;
                        try {
                            user = await db.collection('users').findOne({
                                _id: new ObjectId(customer.customerID)
                            });
                        } catch(e) {}
                        if (!user) {
                            user = await db.collection('users').findOne({
                                _id: customer.customerID
                            });
                        }
                        if (user) customerName = user.name;
                    }
                }
            } catch (e) { /* leave as Unknown */ }

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

        let result;
        try {
            result = await db.collection('orders').updateOne(
                { _id: new ObjectId(req.params.orderID) },
                { $set: { status } }
            );
        } catch(e) {
            result = await db.collection('orders').updateOne(
                { orderID: req.params.orderID },
                { $set: { status } }
            );
        }

        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
