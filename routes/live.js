const express    = require('express');
const router     = express.Router();
const connectDb  = require('../db');
const { ObjectId } = require('mongodb');

// POST /live — create a live session
// body: { hostID: "users._id string", title: "..." }
// Returns { success, _id } — MongoDB _id IS the stream identifier
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { hostID, title } = req.body;

        if (!hostID) {
            return res.status(400).json({ success: false, error: 'hostID required' });
        }

        const result = await db.collection('live').insertOne({
            hostID,                   // users._id of the seller (string)
            title: title || 'Live Session',
            status: 'LiveNow',
            liveComments: [],         // array of liveComment _id strings
            createdAt: new Date(),
        });

        res.json({ success: true, _id: result.insertedId.toString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /live/active-all — all currently live sessions (for channels page badges)
// Must be before /:id routes to avoid param capture
router.get('/active-all', async (req, res) => {
    try {
        const db    = await connectDb();
        const lives = await db.collection('live')
            .find({ status: 'LiveNow' })
            .project({ hostID: 1, title: 1 })
            .toArray();
        res.json(lives.map(l => ({ _id: l._id.toString(), hostID: l.hostID, title: l.title })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /live/active/:hostID — active live for a specific seller (by users._id)
router.get('/active/:hostID', async (req, res) => {
    try {
        const db   = await connectDb();
        const live = await db.collection('live').findOne(
            { hostID: req.params.hostID, status: 'LiveNow' },
            { sort: { createdAt: -1 } }
        );

        if (!live) return res.json({ active: false });

        res.json({
            active: true,
            _id:    live._id.toString(),
            title:  live.title,
            hostID: live.hostID,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /live/count/:hostID — total live sessions hosted by a seller
router.get('/count/:hostID', async (req, res) => {
    try {
        const db    = await connectDb();
        const count = await db.collection('live').countDocuments({ hostID: req.params.hostID });
        res.json({ count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /live/:id/end — end a live session (matches by MongoDB _id)
router.put('/:id/end', async (req, res) => {
    try {
        const db     = await connectDb();
        const result = await db.collection('live').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status: 'Ended', endedAt: new Date() } }
        );
        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
