const express      = require('express');
const router       = express.Router();
const connectDb    = require('../db');
const { ObjectId } = require('mongodb');

const serialize = (p) => ({
    ...p,
    _id:       p._id.toString(),
    sellerID:  p.sellerID?.toString()  ?? '',
    customerID:p.customerID?.toString() ?? '',
});

// GET /payments/seller/:sellersId
// sellersId = sellers._id — direct match against payments.sellerID
router.get('/seller/:sellersId', async (req, res) => {
    try {
        const db  = await connectDb();
        const sid = req.params.sellersId;

        let payments = [];
        try {
            payments = await db.collection('payments')
                .find({ sellerID: new ObjectId(sid) })
                .sort({ createdAt: -1 })
                .toArray();
        } catch (e) {}

        // String fallback
        if (!payments.length) {
            payments = await db.collection('payments')
                .find({ sellerID: sid })
                .sort({ createdAt: -1 })
                .toArray();
        }

        res.json(payments.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /payments/customer/:customersId
// customersId = customers._id — direct match against payments.customerID
router.get('/customer/:customersId', async (req, res) => {
    try {
        const db  = await connectDb();
        const cid = req.params.customersId;

        let payments = [];
        try {
            payments = await db.collection('payments')
                .find({ customerID: new ObjectId(cid) })
                .sort({ createdAt: -1 })
                .toArray();
        } catch (e) {}

        if (!payments.length) {
            payments = await db.collection('payments')
                .find({ customerID: cid })
                .sort({ createdAt: -1 })
                .toArray();
        }

        res.json(payments.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /payments
// body: { orderID, sellerID, customerID, amount, transactionRef, paymentStatus }
// paymentStatus: 'Pending' | 'Completed' | 'Failed'
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { orderID, sellerID, customerID, amount, transactionRef, paymentStatus } = req.body;

        const allowed = ['Pending', 'Completed', 'Failed'];
        if (!allowed.includes(paymentStatus)) {
            return res.status(400).json({ success: false, error: 'paymentStatus must be Pending, Completed, or Failed' });
        }

        let sellerOid   = null;
        let customerOid = null;
        try { sellerOid   = new ObjectId(sellerID);   } catch (e) {}
        try { customerOid = new ObjectId(customerID); } catch (e) {}

        const result = await db.collection('payments').insertOne({
            orderID:        orderID || '',
            sellerID:       sellerOid   || sellerID   || null,
            customerID:     customerOid || customerID || null,
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
