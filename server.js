require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname)));

const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    TWILIO_TWIML_APP_SID,
    TWILIO_CALLER_ID
} = process.env;

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const VoiceResponse = twilio.twiml.VoiceResponse;

// গেটওয়ে কনফিগার করা আছে কি না তা যাচাই
function isGatewayConfigured() {
    return (
        TWILIO_ACCOUNT_SID &&
        TWILIO_ACCOUNT_SID.startsWith('AC') &&
        !TWILIO_ACCOUNT_SID.includes('xxxx') &&
        TWILIO_AUTH_TOKEN &&
        !TWILIO_AUTH_TOKEN.includes('xxxx') &&
        TWILIO_CALLER_ID &&
        !TWILIO_CALLER_ID.includes('XXXX')
    );
}

// অ্যাপের মূল ইন্টারফেস লোড করা
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সার্ভার ও গেটওয়ের বর্তমান অবস্থা জানানো
app.get('/api/status', (req, res) => {
    res.json({
        serverOnline: true,
        gatewayReady: isGatewayConfigured()
    });
});

// ব্রাউজার থেকে সরাসরি কথা বলার জন্য WebRTC ভয়েস টোকেন তৈরি
app.get('/api/token', (req, res) => {
    if (!isGatewayConfigured() || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET) {
        return res.json({
            success: true,
            mode: 'demo',
            message: 'গেটওয়ে কী যুক্ত না থাকায় টেস্ট মোড চালু আছে'
        });
    }

    const identity = 'freecall_bd_laptop_user';
    const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: TWILIO_TWIML_APP_SID,
        incomingAllow: false
    });

    const token = new AccessToken(
        TWILIO_ACCOUNT_SID,
        TWILIO_API_KEY_SID,
        TWILIO_API_KEY_SECRET,
        { identity }
    );
    token.addGrant(voiceGrant);

    res.json({
        success: true,
        mode: 'live',
        token: token.toJwt()
    });
});

// বাংলাদেশের মোবাইল নম্বরে কল সংযুক্ত করার TwiML ওয়েবহুক (দুই-পক্ষের অডিও)
app.post('/api/voice', (req, res) => {
    const twiml = new VoiceResponse();
    const rawNumber = (req.body.To || '').replace(/[^0-9]/g, '');
    const bdLocal = rawNumber.startsWith('880') ? rawNumber.slice(3) : rawNumber.replace(/^0/, '');

    // শুধুমাত্র বাংলাদেশের বৈধ মোবাইল নম্বরে কল অনুমোদিত
    if (/^1[3-9]\d{8}$/.test(bdLocal)) {
        const dial = twiml.dial({
            callerId: TWILIO_CALLER_ID,
            answerOnBridge: true
        });
        dial.number(`+880${bdLocal}`);
    } else {
        twiml.say({ language: 'en-US' }, 'Invalid Bangladesh mobile number.');
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// সরাসরি সার্ভার থেকে কল করার বিকল্প API
app.post('/api/make-call', async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber || !/^1[3-9]\d{8}$/.test(phoneNumber)) {
        return res.status(400).json({
            success: false,
            message: 'সঠিক বাংলাদেশের মোবাইল নম্বর দিন (যেমন: 17XXXXXXXX)'
        });
    }

    const fullBDNumber = `+880${phoneNumber}`;

    if (!isGatewayConfigured()) {
        return res.json({
            success: true,
            mode: 'demo',
            message: `${fullBDNumber} নম্বরে টেস্ট কল সংযুক্ত হয়েছে`
        });
    }

    try {
        const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const call = await client.calls.create({
            url: `${req.protocol}://${req.get('host')}/api/voice`,
            to: fullBDNumber,
            from: TWILIO_CALLER_ID
        });

        res.json({
            success: true,
            mode: 'live',
            callSid: call.sid,
            message: `${fullBDNumber} নম্বরে কল পাঠানো হয়েছে!`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `কল ব্যর্থ হয়েছে: ${error.message}`
        });
    }
});

app.listen(PORT, () => {
    console.log(`FreeCall BD Server চালু হয়েছে: http://localhost:${PORT}`);
});
