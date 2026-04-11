const express      = require('express');
const router       = express.Router();
const connectDb    = require('../db');
const { ObjectId } = require('mongodb');

const serialize = (p) => ({
    ...p,
    _id: p._id.toString(),
});

// GET /payments/seller/:userMongoId
// userMongoId = users._id (aiva_mongo_id from WordPress)
// Chain: users._id → sellers.sellerID → sellers._id → orders.sellerID → orderIDs → payments.orderID
router.get('/seller/:userMongoId', async (req, res) => {
    try {
        const db  = await connectDb();
        const uid = req.params.userMongoId;

        // Step 1: find seller whose sellerID = users._id
        let seller = null;
        try { seller = await db.collection('sellers').findOne({ sellerID: new ObjectId(uid) }); } catch (e) {}
        if (!seller) seller = await db.collection('sellers').findOne({ sellerID: uid });
        if (!seller) return res.json([]);

        // Step 2: find all orders for this seller (try ObjectId then string for sellerID)
        let orders = await db.collection('orders')
            .find({ sellerID: seller._id }, { projection: { _id: 1 } })
            .toArray();
        if (!orders.length) {
            orders = await db.collection('orders')
                .find({ sellerID: seller._id.toString() }, { projection: { _id: 1 } })
                .toArray();
        }
        if (!orders.length) return res.json([]);

        // Step 3: find payments whose orderID matches (try both string and ObjectId)
        const orderIdStrings = orders.map(o => o._id.toString());
        let orderIdObjects = [];
        try { orderIdObjects = orders.map(o => new ObjectId(o._id)); } catch (e) {}

        const payments = await db.collection('payments')
            .find({ orderID: { $in: [...orderIdStrings, ...orderIdObjects] } })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(payments.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /payments/customer/:userMongoId
// userMongoId = users._id (aiva_mongo_id from WordPress)
// Chain: users._id → customers.customerID → customers._id → orders.customerID → orderIDs → payments.orderID
router.get('/customer/:userMongoId', async (req, res) => {
    try {
        const db  = await connectDb();
        const uid = req.params.userMongoId;

        // Step 1: find customer whose customerID = users._id
        let customer = null;
        try { customer = await db.collection('customers').findOne({ customerID: new ObjectId(uid) }); } catch (e) {}
        if (!customer) customer = await db.collection('customers').findOne({ customerID: uid });
        if (!customer) return res.json([]);

        // Step 2: find all orders for this customer
        let orders = await db.collection('orders')
            .find({ customerID: customer._id }, { projection: { _id: 1 } })
            .toArray();
        if (!orders.length) {
            orders = await db.collection('orders')
                .find({ customerID: customer._id.toString() }, { projection: { _id: 1 } })
                .toArray();
        }
        if (!orders.length) return res.json([]);

        // Step 3: find payments whose orderID matches
        const orderIdStrings = orders.map(o => o._id.toString());
        let orderIdObjects = [];
        try { orderIdObjects = orders.map(o => new ObjectId(o._id)); } catch (e) {}

        const payments = await db.collection('payments')
            .find({ orderID: { $in: [...orderIdStrings, ...orderIdObjects] } })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(payments.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /payments
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { orderID, amount, transactionRef, paymentStatus } = req.body;

        const allowed = ['Pending', 'Completed', 'Failed'];
        if (!allowed.includes(paymentStatus)) {
            return res.status(400).json({ success: false, error: 'paymentStatus must be Pending, Completed, or Failed' });
        }

        const result = await db.collection('payments').insertOne({
            orderID:        orderID || '',
            amount:         parseFloat(amount) || 0,
            transactionRef: transactionRef || '',
            paymentStatus,
            createdAt:      new Date(),
        });

        res.json({ success: true, _id: result.insertedId.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /payments/verify-and-update
// Resolves customer+seller → orders → payments, matches chatAmount (floor),
// updates paymentStatus based on VisPay result (APPROVED→Completed, REJECTED→Failed, MANUAL REVIEW→Pending).
router.put('/verify-and-update', async (req, res) => {
    try {
        const db = await connectDb();
        const { customerUserMongoId, sellerUserMongoId, chatAmount, visPayStatus } = req.body;

        if (!customerUserMongoId || !sellerUserMongoId || chatAmount == null || !visPayStatus) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Resolve customer
        let customer = null;
        try { customer = await db.collection('customers').findOne({ customerID: new ObjectId(customerUserMongoId) }); } catch (e) {}
        if (!customer) customer = await db.collection('customers').findOne({ customerID: customerUserMongoId });
        if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

        // Resolve seller
        let seller = null;
        try { seller = await db.collection('sellers').findOne({ sellerID: new ObjectId(sellerUserMongoId) }); } catch (e) {}
        if (!seller) seller = await db.collection('sellers').findOne({ sellerID: sellerUserMongoId });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller not found' });

        // Orders for this customer + seller, most recent first
        const orders = await db.collection('orders')
            .find({ customerID: customer._id, sellerID: seller._id })
            .sort({ createdAt: -1 })
            .toArray();

        if (!orders.length) {
            return res.status(404).json({ success: false, error: 'No orders found for this customer and seller' });
        }

        const statusMap = { 'APPROVED': 'Completed', 'REJECTED': 'Failed', 'MANUAL REVIEW': 'Pending' };
        const newStatus  = statusMap[visPayStatus] || 'Pending';
        const expectedFloor = Math.floor(parseFloat(chatAmount));

        for (const order of orders) {
            const orderIdStr = order._id.toString();
            const payment = await db.collection('payments').findOne({
                $or: [{ orderID: orderIdStr }, { orderID: order._id }]
            });
            if (!payment) continue;

            if (Math.floor(parseFloat(payment.amount)) === expectedFloor) {
                await db.collection('payments').updateOne(
                    { _id: payment._id },
                    { $set: { paymentStatus: newStatus } }
                );
                return res.json({
                    success: true,
                    paymentId: payment._id.toString(),
                    newStatus,
                    matchedAmount: payment.amount,
                });
            }
        }

        return res.status(404).json({
            success: false,
            error: `No payment found matching amount Rs.${chatAmount} for this customer and seller`,
        });
    } catch (err) {
        console.error('[verify-and-update]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /payments/:id/status
router.put('/:id/status', async (req, res) => {
    try {
        const db = await connectDb();
        const { paymentStatus } = req.body;
        const allowed = ['Pending', 'Completed', 'Failed'];
        if (!allowed.includes(paymentStatus)) {
            return res.status(400).json({ success: false, error: 'Invalid paymentStatus' });
        }
        const result = await db.collection('payments').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { paymentStatus } }
        );
        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
