const express = require('express');
const router  = express.Router();

// GET /agora-token?channel=aiva-XXX&uid=0&role=publisher|audience
// Requires AGORA_APP_ID and AGORA_APP_CERTIFICATE env vars.
// Install dependency: npm install agora-token
router.get('/', (req, res) => {
    const { channel, uid = '0', role = 'audience' } = req.query;

    if (!channel) {
        return res.status(400).json({ success: false, error: 'channel is required' });
    }

    const APP_ID      = process.env.AGORA_APP_ID;
    const CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

    if (!APP_ID || !CERTIFICATE) {
        return res.status(500).json({ success: false, error: 'Agora credentials not configured in environment' });
    }

    try {
        const { RtcTokenBuilder, RtcRole } = require('agora-token');

        const rtcRole   = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
        const expireTs  = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        const token = RtcTokenBuilder.buildTokenWithUid(
            APP_ID,
            CERTIFICATE,
            channel,
            parseInt(uid, 10),
            rtcRole,
            expireTs,
            expireTs
        );

        res.json({ success: true, token, channel });
    } catch (err) {
        console.error('[Agora Token]', err.message);
        res.status(500).json({ success: false, error: 'Token generation failed: ' + err.message });
    }
});

module.exports = router;
