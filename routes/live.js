const express = require('express');
const router  = express.Router();
const connectDb = require('../db');

// POST /live — create a live session
// body: { hostID: "users._id string", title: "..." }
router.post('/', async (req, res) => {
    try {
        const db = await connectDb();
        const { hostID, title } = req.body;

        if (!hostID) {
            return res.status(400).json({ success: false, error: 'hostID required' });
        }

        // Sequential streamID
        const count  = await db.collection('live').countDocuments();
        const streamID = 'LV' + String(count + 1).padStart(3, '0');

        const result = await db.collection('live').insertOne({
            streamID,
            hostID,           // users._id of the seller (string)
            title: title || 'Live Session',
            status: 'LiveNow',
            liveComments: [], // array of liveComment _id strings (pushed on each comment)
            createdAt: new Date(),
        });

        res.json({ success: true, streamID, _id: result.insertedId.toString() });
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
            active:   true,
            streamID: live.streamID,
            _id:      live._id.toString(),
            title:    live.title,
            hostID:   live.hostID,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /live/:streamID/end — end a live session
router.put('/:streamID/end', async (req, res) => {
    try {
        const db     = await connectDb();
        const result = await db.collection('live').updateOne(
            { streamID: req.params.streamID },
            { $set: { status: 'Ended', endedAt: new Date() } }
        );
        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /live/active-all — all currently live sessions (for channels page badges)
router.get('/active-all', async (req, res) => {
    try {
        const db   = await connectDb();
        const lives = await db.collection('live')
            .find({ status: 'LiveNow' })
            .project({ hostID: 1, streamID: 1, title: 1, _id: 0 })
            .toArray();
        res.json(lives);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
