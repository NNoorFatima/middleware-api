// routes/profile-requests.js
const express   = require('express');
const router    = express.Router();
const connectDb = require('../db');
const bcrypt    = require('bcryptjs');
const { ObjectId } = require('mongodb');

// helper — coerce to ObjectId or null
const toOid = id => { try { return new ObjectId(id); } catch { return null; } };

// POST /profile-requests — seller submits a request.
// Body: { userID, name?, shopName?, newPasswordPlain? }
// Replaces any existing pending request from the same user (one in-flight at a time).
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { userID, name, shopName, newPasswordPlain } = req.body || {};
        const userOid = toOid(userID);
        if (!userOid) return res.status(400).json({ success: false, message: 'Invalid userID' });

        // At least one field must be present
        const hasName = typeof name     === 'string' && name.trim() !== '';
        const hasShop = typeof shopName === 'string' && shopName.trim() !== '';
        const hasPass = typeof newPasswordPlain === 'string' && newPasswordPlain.length >= 8;
        if (!hasName && !hasShop && !hasPass) {
            return res.status(400).json({ success: false, message: 'No changes submitted' });
        }

        const changes = {
            name:            hasName ? name.trim()     : null,
            shopName:        hasShop ? shopName.trim() : null,
            newPasswordHash: hasPass ? await bcrypt.hash(newPasswordPlain, 10) : null,
        };

        // Drop any prior pending request from this user (only one in flight)
        await db.collection('profileRequests').deleteMany({ userID: userOid, status: 'pending' });

        const result = await db.collection('profileRequests').insertOne({
            userID:        userOid,
            changes,
            status:        'pending',
            rejectionNote: null,
            createdAt:     new Date(),
            reviewedAt:    null,
            reviewedBy:    null,
        });

        res.json({ success: true, _id: result.insertedId.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /profile-requests/by-user/:userId — seller fetches their own latest request (any status)
router.get('/by-user/:userId', async (req, res) => {
    try {
        const db = await connectDb();
        const userOid = toOid(req.params.userId);
        if (!userOid) return res.status(400).json({ error: 'Invalid userId' });

        const request = await db.collection('profileRequests')
            .find({ userID: userOid })
            .sort({ createdAt: -1 })
            .limit(1)
            .next();

        if (!request) return res.json(null);

        // Strip the password hash before sending to client; expose a flag instead
        const safe = {
            _id:           request._id.toString(),
            userID:        request.userID.toString(),
            changes: {
                name:            request.changes?.name ?? null,
                shopName:        request.changes?.shopName ?? null,
                passwordChange: !!request.changes?.newPasswordHash,
            },
            status:        request.status,
            rejectionNote: request.rejectionNote,
            createdAt:     request.createdAt,
            reviewedAt:    request.reviewedAt,
        };
        res.json(safe);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /profile-requests/pending — admin: list all pending, joined with user + seller info for display
router.get('/pending', async (req, res) => {
    try {
        const db = await connectDb();
        const pending = await db.collection('profileRequests')
            .find({ status: 'pending' })
            .sort({ createdAt: 1 })
            .toArray();

        // Resolve current user + seller info for diff display
        const userIds = pending.map(p => p.userID);
        const users   = userIds.length
            ? await db.collection('users').find({ _id: { $in: userIds } }).toArray()
            : [];
        const sellers = userIds.length
            ? await db.collection('sellers').find({ sellerID: { $in: userIds } }).toArray()
            : [];

        const usersById   = Object.fromEntries(users.map(u   => [u._id.toString(), u]));
        const sellersById = Object.fromEntries(sellers.map(s => [s.sellerID.toString(), s]));

        const rows = pending.map(p => {
            const uid = p.userID.toString();
            const u   = usersById[uid];
            const s   = sellersById[uid];
            return {
                _id:        p._id.toString(),
                userID:     uid,
                requester: {
                    name:     u?.name  ?? '(unknown)',
                    email:    u?.email ?? '',
                    shopName: s?.shopName ?? '',
                },
                changes: {
                    name:           p.changes?.name ?? null,
                    shopName:       p.changes?.shopName ?? null,
                    passwordChange: !!p.changes?.newPasswordHash,
                },
                createdAt:  p.createdAt,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /profile-requests/:id/approve — admin approves; apply changes atomically.
// Body: { reviewerId? }
router.put('/:id/approve', async (req, res) => {
    try {
        const db = await connectDb();
        const reqOid = toOid(req.params.id);
        if (!reqOid) return res.status(400).json({ success: false, message: 'Invalid request id' });

        const request = await db.collection('profileRequests').findOne({ _id: reqOid });
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        if (request.status !== 'pending') {
            return res.status(409).json({ success: false, message: `Already ${request.status}` });
        }

        const userOid = request.userID;
        const changes = request.changes || {};

        // Apply to users (name, password) and sellers (shopName)
        const userSet   = {};
        if (changes.name)            userSet.name     = changes.name;
        if (changes.newPasswordHash) userSet.password = changes.newPasswordHash;
        if (Object.keys(userSet).length) {
            await db.collection('users').updateOne({ _id: userOid }, { $set: userSet });
        }
        if (changes.shopName) {
            await db.collection('sellers').updateOne(
                { sellerID: userOid },
                { $set: { shopName: changes.shopName } }
            );
        }

        // Mark approved
        const reviewerOid = toOid(req.body?.reviewerId);
        await db.collection('profileRequests').updateOne(
            { _id: reqOid },
            { $set: {
                status:     'approved',
                reviewedAt: new Date(),
                reviewedBy: reviewerOid,
            }}
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /profile-requests/:id/reject — admin rejects with optional note
// Body: { reviewerId?, note? }
router.put('/:id/reject', async (req, res) => {
    try {
        const db = await connectDb();
        const reqOid = toOid(req.params.id);
        if (!reqOid) return res.status(400).json({ success: false, message: 'Invalid request id' });

        const request = await db.collection('profileRequests').findOne({ _id: reqOid });
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
        if (request.status !== 'pending') {
            return res.status(409).json({ success: false, message: `Already ${request.status}` });
        }

        const reviewerOid = toOid(req.body?.reviewerId);
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : null;

        await db.collection('profileRequests').updateOne(
            { _id: reqOid },
            { $set: {
                status:        'rejected',
                rejectionNote: note,
                reviewedAt:    new Date(),
                reviewedBy:    reviewerOid,
            }}
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /profile-requests/:id — seller cancels their own pending request.
// (Authorization is enforced on the WP side via aiva_mongo_id.)
router.delete('/:id', async (req, res) => {
    try {
        const db = await connectDb();
        const reqOid = toOid(req.params.id);
        if (!reqOid) return res.status(400).json({ success: false, message: 'Invalid request id' });

        const result = await db.collection('profileRequests').deleteOne({ _id: reqOid, status: 'pending' });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
