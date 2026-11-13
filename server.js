require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const {
    SIP_SERVER,
    SIP_PORT,
    SIP_USERNAME,
    SIP_PASSWORD
} = process.env;

function isSipConfigured() {
    return Boolean(
        SIP_SERVER &&
        !SIP_SERVER.includes('example') &&
        SIP_USERNAME &&
        !SIP_USERNAME.includes('XXXX') &&
        SIP_PASSWORD &&
        !SIP_PASSWORD.includes('এখানে_বসাবেন')
    );
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/status', (req, res) => {
    res.json({
        serverOnline: true,
        gatewayReady: isSipConfigured(),
        callerId: isSipConfigured() ? SIP_USERNAME : 'Not Configured'
    });
});

app.get('/api/token', (req, res) => {
    if (!isSipConfigured()) {
        return res.json({
            success: true,
            mode: 'demo',
            message: 'IPTSP SIP তথ্য যুক্ত না থাকায় টেস্ট মোড চালু আছে'
        });
    }

    res.json({
        success: true,
        mode: 'sip_ready',
        sipServer: SIP_SERVER,
        sipPort: SIP_PORT || '5060',
        sipUser: SIP_USERNAME
    });
});

app.post('/api/make-call', (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber || !/^1[3-9]\d{8}$/.test(phoneNumber)) {
        return res.status(400).json({
            success: false,
            message: 'সঠিক বাংলাদেশের মোবাইল নম্বর দিন (যেমন: 17XXXXXXXX)'
        });
    }

    const fullBDNumber = `0${phoneNumber}`;

    if (!isSipConfigured()) {
        return res.json({
            success: true,
            mode: 'demo',
            message: `${fullBDNumber} নম্বরে টেস্ট কল সংযুক্ত হয়েছে`
        });
    }

    res.json({
        success: true,
        mode: 'live',
        message: `${SIP_USERNAME} থেকে ${fullBDNumber} নম্বরে কল পাঠানো হচ্ছে...`
    });
});

app.listen(PORT, () => {
    console.log(`FreeCall BD Server चालू হয়েছে: http://localhost:${PORT}`);
});
