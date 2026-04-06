const express    = require('express');
const router     = express.Router();
const connectDb  = require('../db');
const { ObjectId } = require('mongodb');

// Helper: resolve users._id string → seller document
async function findSellerByUserId(db, userMongoId) {
    let seller = null;
    try { seller = await db.collection('sellers').findOne({ sellerID: new ObjectId(userMongoId) }); } catch (e) {}
    if (!seller) seller = await db.collection('sellers').findOne({ sellerID: userMongoId });
    return seller;
}

// Helper: resolve users._id string → customer document
async function findCustomerByUserId(db, userMongoId) {
    let customer = null;
    try { customer = await db.collection('customers').findOne({ customerID: new ObjectId(userMongoId) }); } catch (e) {}
    if (!customer) customer = await db.collection('customers').findOne({ customerID: userMongoId });
    return customer;
}

const serialize = (p) => ({
    ...p,
    _id:        p._id.toString(),
    sellerID:   p.sellerID?.toString()   ?? '',
    customerID: p.customerID?.toString() ?? '',
});

// GET /payments/seller/:userMongoId — all payments for a seller
router.get('/seller/:userMongoId', async (req, res) => {
    try {
        const db     = await connectDb();
        const seller = await findSellerByUserId(db, req.params.userMongoId);
        if (!seller) return res.json([]);

        const payments = await db.collection('payments')
            .find({ sellerID: seller._id })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(payments.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /payments/customer/:userMongoId — all payments for a customer
router.get('/customer/:userMongoId', async (req, res) => {
    try {
        const db       = await connectDb();
        const customer = await findCustomerByUserId(db, req.params.userMongoId);
        if (!customer) return res.json([]);

        const payments = await db.collection('payments')
            .find({ customerID: customer._id })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(payments.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /payments — create a payment record
// body: { orderID, sellerUserMongoId, customerUserMongoId, amount, transactionRef, paymentStatus }
// paymentStatus values: 'Pending' | 'Completed' | 'Failed'
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { orderID, sellerUserMongoId, customerUserMongoId, amount, transactionRef, paymentStatus } = req.body;

        const allowed = ['Pending', 'Completed', 'Failed'];
        if (!allowed.includes(paymentStatus)) {
            return res.status(400).json({ success: false, error: 'paymentStatus must be Pending, Completed, or Failed' });
        }

        const seller   = await findSellerByUserId(db, sellerUserMongoId);
        const customer = await findCustomerByUserId(db, customerUserMongoId);

        const result = await db.collection('payments').insertOne({
            orderID:        orderID || '',
            sellerID:       seller   ? seller._id   : null,
            customerID:     customer ? customer._id : null,
            amount:         parseFloat(amount) || 0,
            transactionRef: transactionRef || '',
            paymentStatus,
            createdAt: new Date(),
        });

        res.json({ success: true, _id: result.insertedId.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /payments/:id/status — update payment status
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
