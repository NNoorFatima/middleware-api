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

        // Step 2: find all orders for this seller using seller.sellerID (= users._id, not seller._id)
        let orders = await db.collection('orders')
            .find({ sellerID: seller.sellerID }, { projection: { _id: 1 } })
            .toArray();
        if (!orders.length) {
            orders = await db.collection('orders')
                .find({ sellerID: seller.sellerID.toString() }, { projection: { _id: 1 } })
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
// Chain: customers.orderHistory → payments.orderID → orders.sellerID → sellers.shopName
router.get('/customer/:userMongoId', async (req, res) => {
    try {
        const db  = await connectDb();
        const uid = req.params.userMongoId;

        // Find customer via customerID field (= users._id)
        let customer = null;
        try { customer = await db.collection('customers').findOne({ customerID: new ObjectId(uid) }); } catch (e) {}
        if (!customer) customer = await db.collection('customers').findOne({ customerID: uid });
        if (!customer) return res.json([]);

        const orderHistory = customer.orderHistory || [];
        if (!orderHistory.length) return res.json([]);

        const results = [];
        for (const orderIdRaw of orderHistory) {
            const orderIdStr = orderIdRaw.toString();

            // Find all payments for this order (multiple may exist)
            let paymentQuery = { orderID: orderIdStr };
            try { paymentQuery = { $or: [{ orderID: orderIdStr }, { orderID: new ObjectId(orderIdStr) }] }; } catch(e) {}
            const orderPayments = await db.collection('payments').find(paymentQuery).toArray();
            if (!orderPayments.length) continue;

            // Find order to resolve seller → shopName
            let shopName = 'Unknown';
            try {
                const order = await db.collection('orders').findOne({ _id: new ObjectId(orderIdStr) });
                if (order && order.sellerID) {
                    let seller = await db.collection('sellers').findOne({ sellerID: order.sellerID });
                    if (!seller) seller = await db.collection('sellers').findOne({ sellerID: order.sellerID.toString() });
                    if (seller) shopName = seller.shopName || 'Unknown';
                }
            } catch(e) {}

            for (const p of orderPayments) {
                results.push({ ...serialize(p), shopName });
            }
        }

        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(results);
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
// PUT /payments/verify-and-update
// Path: customer.orderHistory → orders._id → payments.orderID → match amount → update status
router.put('/verify-and-update', async (req, res) => {
    try {
        const db = await connectDb();
        const { customerUserMongoId, sellerUserMongoId, chatAmount, visPayStatus } = req.body;

        if (!customerUserMongoId || !sellerUserMongoId || chatAmount == null || !visPayStatus) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Step 1: find customer via customerID field (= users._id)
        let customer = null;
        try { customer = await db.collection('customers').findOne({ customerID: new ObjectId(customerUserMongoId) }); } catch (e) {}
        if (!customer) customer = await db.collection('customers').findOne({ customerID: customerUserMongoId });
        if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });

        // Step 2: find seller via sellerID field (= users._id)
        let seller = null;
        try { seller = await db.collection('sellers').findOne({ sellerID: new ObjectId(sellerUserMongoId) }); } catch (e) {}
        if (!seller) seller = await db.collection('sellers').findOne({ sellerID: sellerUserMongoId });
        if (!seller) return res.status(404).json({ success: false, error: 'Seller not found' });

        const orderHistory = customer.orderHistory || [];
        if (!orderHistory.length) {
            return res.status(404).json({ success: false, error: 'Step 3 failed: customer orderHistory is empty' });
        }

        const statusMap     = { 'APPROVED': 'Completed', 'REJECTED': 'Failed', 'MANUAL REVIEW': 'Pending' };
        const newStatus     = statusMap[visPayStatus] || 'Pending';
        const expectedFloor = Math.floor(parseFloat(chatAmount));
        const sellerIdStr   = seller.sellerID.toString();
        const trace         = [];

        for (const orderIdRaw of [...orderHistory].reverse()) {
            const orderIdStr = orderIdRaw.toString();
            const entry = { orderID: orderIdStr };

            let order = null;
            try { order = await db.collection('orders').findOne({ _id: new ObjectId(orderIdStr) }); } catch (e) {
                entry.step = 'order lookup threw: ' + e.message; trace.push(entry); continue;
            }
            if (!order) { entry.step = 'order not found'; trace.push(entry); continue; }

            entry.orderSellerID = order.sellerID.toString();
            entry.expectedSellerID = sellerIdStr;
            if (order.sellerID.toString() !== sellerIdStr) { entry.step = 'sellerID mismatch'; trace.push(entry); continue; }

            const payments = await db.collection('payments').find({
                $or: [{ orderID: orderIdStr }, { orderID: new ObjectId(orderIdStr) }]
            }).toArray();
            if (!payments.length) { entry.step = 'payment not found'; trace.push(entry); continue; }

            entry.paymentsFound = payments.map(p => ({ id: p._id.toString(), amount: p.amount }));
            entry.expectedFloor = expectedFloor;

            const matched = payments.find(p => Math.floor(parseFloat(p.amount)) === expectedFloor);
            if (matched) {
                await db.collection('payments').updateOne(
                    { _id: matched._id },
                    { $set: { paymentStatus: newStatus } }
                );
                return res.json({
                    success:       true,
                    paymentId:     matched._id.toString(),
                    newStatus,
                    matchedAmount: matched.amount,
                });
            }
            entry.step = 'amount mismatch in all payments'; trace.push(entry);
        }

        return res.status(404).json({
            success: false,
            error:   `No match found. Debug trace: ${JSON.stringify(trace)}`,
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
