// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
const fs = require('fs');

// --------------------------------------------------------------------------
// Optional service imports (your project used this)
const { listenForInventoryChanges } = require(path.join(__dirname, 'services', 'inventoryAlerts.js'));

// --------------------------------------------------------------------------
// Setup
// --------------------------------------------------------------------------
const app = express();
const port = process.env.PORT || 4000;
const uri = process.env.MONGO_URI;

// make sure uploads folder exists at backend/uploads and backend/uploads/reports
const uploadsRoot = path.join(__dirname, 'uploads');
const reportsDir = path.join(uploadsRoot, 'reports');
try {
    fs.mkdirSync(reportsDir, { recursive: true });
    console.log('[server] ensured uploads dirs:', uploadsRoot, reportsDir);
} catch (err) {
    console.error('[server] could not create uploads dirs', err && err.stack ? err.stack : err);
}

// --------------------------------------------------------------------------
// Global error handlers (helps catch silent crashes during development)
// --------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

// --------------------------------------------------------------------------
// CORS + preflight handling (kept your allowed origins and final elevated position)
// --------------------------------------------------------------------------
app.use((req, res, next) => {
    const allowedLocalOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5001',
        'http://127.0.0.1:5001',
        // add other local dev hosts you use
    ];
    const origin = req.headers.origin;
    if (origin && allowedLocalOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // dev fallback — adjust to your frontend origin if necessary
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5001');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// JSON bodies
app.use(express.json());

// serve uploads so frontend can access stored files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Optional: small request logger for debugging (only reports /api/reports requests)
app.use((req, res, next) => {
    if (req.path && req.path.startsWith('/api/reports')) {
        console.log(`[req] ${req.method} ${req.originalUrl} headers:`, {
            origin: req.headers.origin,
            authorization: req.headers.authorization ? 'present' : 'missing',
            'content-type': req.headers['content-type']
        });
    }
    next();
});

// --------------------------------------------------------------------------
// Import & mount routes
// --------------------------------------------------------------------------
const userRoutes = require('./routes/userRoutes.js');
const authRoutes = require('./routes/authRoutes.js');
const patientRoutes = require('./routes/patientRoutes.js');
const doctorRoutes = require('./routes/doctorRoutes.js');
const appointmentRoutes = require('./routes/appointmentRoutes.js');
const medicineRoutes = require('./routes/medicineRoutes.js');
const inventoryRoutes = require('./routes/inventoryRoutes.js');
const bedRoutes = require('./routes/bedRoutes.js');
const billingRoutes = require('./routes/billingRoutes.js');
const analyticsRoutes = require('./routes/analyticsRoutes.js');
const supplierRoutes = require('./routes/supplierRoutes.js');
const donorRoutes = require('./routes/donorRoutes.js');
const admissionRoutes = require('./routes/admissionRoutes.js');
const invoiceRoutes = require('./routes/invoiceRoutes.js');
const reportRoutes = require('./routes/reportRoutes.js');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/beds', bedRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/reports', reportRoutes);

// --------------------------------------------------------------------------
// MongoDB connect + change streams
// --------------------------------------------------------------------------
if (!uri) {
    console.error("FATAL ERROR: MONGO_URI is undefined. Check backend/.env");
    process.exit(1);
}

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('MongoDB connected successfully!');
        try {
            // optional service
            if (typeof listenForInventoryChanges === 'function') {
                listenForInventoryChanges();
            }
        } catch (e) {
            console.warn('listenForInventoryChanges error', e && e.stack ? e.stack : e);
        }

        app.listen(port, () => {
            console.log(`Server is running on port: ${port}`);
        });

        // existing analytics change-stream logic (kept intact)
        const ANALYTICS_UPDATE_URL = process.env.ANALYTICS_UPDATE_URL || 'http://127.0.0.1:5001/api/analytics/update';
        const watchOptions = { fullDocument: 'updateLookup' };

        async function sendAnalyticsUpdate(payload) {
            try {
                await axios.post(ANALYTICS_UPDATE_URL, payload, { timeout: 10000 });
                console.log('[analytics] Sent update:', payload.type || 'unknown');
            } catch (err) {
                console.warn('[analytics] Failed to send update:', (err && err.message) || err);
            }
        }

        // Billing change stream
        try {
            const billingColl = mongoose.connection.collection('billings');
            const billingChangeStream = billingColl.watch([], watchOptions);
            billingChangeStream.on('change', async (change) => {
                try {
                    if (change.operationType === 'insert' && change.fullDocument) {
                        const bill = change.fullDocument;
                        const events = (bill.items || []).map(it => ({
                            type: 'demand',
                            month: (new Date(bill.createdAt || Date.now())).toISOString().slice(0, 7),
                            medicine: (it.name || it.medName || it.description || '').trim(),
                            quantity: Number(it.quantity || it.qty || 0),
                            invoiceId: String(bill._id)
                        })).filter(e => e.medicine && e.quantity > 0);

                        if (events.length) {
                            await sendAnalyticsUpdate({ type: 'demand_batch', events });
                        }
                    }
                } catch (e) {
                    console.warn('[analytics] billing change handler error:', e?.message || e);
                }
            });
            console.log('[analytics] Billing change stream started.');
        } catch (e) {
            console.warn('[analytics] Could not open billing change stream:', e?.message || e);
        }

        // Admissions change stream
        try {
            const admissionsColl = mongoose.connection.collection('admissions');
            const admissionsChangeStream = admissionsColl.watch([], watchOptions);
            admissionsChangeStream.on('change', async (change) => {
                try {
                    if (change.operationType === 'insert' && change.fullDocument) {
                        const adm = change.fullDocument;
                        const payload = {
                            type: 'admission',
                            admittedAt: adm.admittedAt || adm.createdAt || new Date(),
                            patientName: adm.patientName || adm.name || '',
                            age: adm.age || null,
                            gender: adm.gender || null,
                            roomType: adm.roomType || null,
                            doctor: adm.doctor || null,
                            admissionId: String(adm._id)
                        };
                        await sendAnalyticsUpdate(payload);
                    }
                } catch (e) {
                    console.warn('[analytics] admission change handler error:', e?.message || e);
                }
            });
            console.log('[analytics] Admissions change stream started.');
        } catch (e) {
            console.warn('[analytics] Could not open admissions change stream:', e?.message || e);
        }

    }).catch(err => {
        console.error('FATAL MongoDB connection error:', err && err.stack ? err.stack : err);
        process.exit(1);
    });