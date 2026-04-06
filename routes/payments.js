const express    = require('express');
const router     = express.Router();
const connectDb  = require('../db');
const { ObjectId } = require('mongodb');

const serialize = (p) => ({
    ...p,
    _id: p._id.toString(),
});

// Find order _ids for a given field (sellerID or customerID) — tries ObjectId then string
async function findOrderIds(db, field, id) {
    let orders = [];
    try {
        orders = await db.collection('orders')
            .find({ [field]: new ObjectId(id) }, { projection: { _id: 1 } })
            .toArray();
    } catch (e) {}
    if (!orders.length) {
        orders = await db.collection('orders')
            .find({ [field]: id }, { projection: { _id: 1 } })
            .toArray();
    }
    return orders.map(o => o._id.toString());
}

// GET /payments/seller/:sellersId
// sellersId = sellers._id (MongoDB _id of the seller document)
router.get('/seller/:sellersId', async (req, res) => {
    try {
        const db       = await connectDb();
        const orderIds = await findOrderIds(db, 'sellerID', req.params.sellersId);
        if (!orderIds.length) return res.json([]);

        const payments = await db.collection('payments')
            .find({ orderID: { $in: orderIds } })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(payments.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /payments/customer/:customersId
// customersId = customers._id (MongoDB _id of the customer document)
router.get('/customer/:customersId', async (req, res) => {
    try {
        const db       = await connectDb();
        const orderIds = await findOrderIds(db, 'customerID', req.params.customersId);
        if (!orderIds.length) return res.json([]);

        const payments = await db.collection('payments')
            .find({ orderID: { $in: orderIds } })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(payments.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /payments
// body: { orderID, amount, transactionRef, paymentStatus }
// paymentStatus: 'Pending' | 'Completed' | 'Failed'
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

// PUT /payments/:id/status
router.put('/:id/status', async (req, res) => {
    try {
        const db = await connectDb();
        const { paymentStatus } = req.body;
        const allowed = ['Pending', 'Completed', 'Failed'];
        if (!allowed.includes(paymentStatus)) {
            return res.status(400).json({ success: false, error: 'paymentStatus must be Pending, Completed, or Failed' });
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
