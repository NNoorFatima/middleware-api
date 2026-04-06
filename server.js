const express = require('express');
const cors = require('cors');
require('dotenv').config();

const usersRouter = require('./routes/users');
const sellersRouter = require('./routes/sellers');
const customersRouter = require('./routes/customers');
const inventoriesRouter = require('./routes/inventory');
const ordersRouter       = require('./routes/orders');
const liveRouter         = require('./routes/live');
const liveCommentsRouter = require('./routes/live-comments');
const agoraTokenRouter   = require('./routes/agora-token');
const paymentsRouter     = require('./routes/payments');

const app = express();
app.use(cors());
app.use(express.json());

// Health check — must be before API key middleware so Render can reach it
app.get('/', (req, res) => res.send('Middleware API running'));

// API key check
app.use((req, res, next) => {
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// Routes
app.use('/users', usersRouter);
app.use('/sellers', sellersRouter);
app.use('/customers', customersRouter);
app.use('/inventory', inventoriesRouter);
app.use('/orders', ordersRouter);
app.use('/live', liveRouter);
app.use('/live-comments', liveCommentsRouter);
app.use('/agora-token', agoraTokenRouter);
app.use('/payments',   paymentsRouter);

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server running on port ${port}`));