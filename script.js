const phoneInput = document.getElementById('phoneNumber');
const backspaceBtn = document.getElementById('backspaceBtn');
const keys = document.querySelectorAll('.key');
const callBtn = document.getElementById('callBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callStatus = document.getElementById('callStatus');
const callTimer = document.getElementById('callTimer');
const balanceDisplay = document.getElementById('freeMinutesText');
const networkStatusText = document.getElementById('networkStatusText');

let timerInterval = null;
let ringTimeout = null;
let secondsElapsed = 0;
let remainingFreeSeconds = 300;
let isCallActive = false;

let twilioDevice = null;
let activeLiveCall = null;
let gatewayMode = 'demo';

// সময়কে 00:00 ফরম্যাটে রূপান্তর
function formatTime(totalSeconds) {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
}

// নম্বর পরিষ্কার করা (01 দিয়ে শুরু ১১ ডিজিট পর্যন্ত রাখবে)
function normalizeNumber(rawValue) {
    let cleaned = rawValue.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('880')) {
        cleaned = '0' + cleaned.substring(3);
    }
    return cleaned.slice(0, 11);
}

// সার্ভারের অবস্থা যাচাই করা
async function initVoiceSystem() {
    try {
        const res = await fetch('/api/token');
        const data = await res.json();

        if (data.mode === 'sip_ready' || data.mode === 'live') {
            gatewayMode = 'live';
            networkStatusText.textContent = 'লাইভ গেটওয়ে প্রস্তুত';
        } else {
            gatewayMode = 'demo';
            networkStatusText.textContent = 'সার্ভার অনলাইন (টেস্ট)';
        }
    } catch (err) {
        networkStatusText.textContent = 'সার্ভার অফলাইন';
    }
}
initVoiceSystem();

// ডায়ালপ্যাড বাটন ক্লিক (এখন শুরুর 0-ও টাইপ হবে)
keys.forEach(key => {
    key.addEventListener('click', () => {
        if (isCallActive) return;
        const num = key.getAttribute('data-num');
        if (num === '*' || num === '#') return;
        phoneInput.value = normalizeNumber(phoneInput.value + num);
    });
});

// কীবোর্ড টাইপ বা পেস্ট
phoneInput.addEventListener('input', () => {
    phoneInput.value = normalizeNumber(phoneInput.value);
});

// Enter চাপলে কল শুরু
phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isCallActive) {
        callBtn.click();
    }
});

// ব্যাকস্পেস বাটন
backspaceBtn.addEventListener('click', () => {
    if (isCallActive) return;
    phoneInput.value = phoneInput.value.slice(0, -1);
});

// বাংলাদেশের বৈধ ১১ ডিজিট মোবাইল নম্বর যাচাই (013 - 019)
function isValidBDNumber(num) {
    return /^01[3-9]\d{8}$/.test(num);
}

// কল টাইমার শুরু করা
function startCallTimer() {
    callTimer.classList.remove('hidden');
    secondsElapsed = 0;
    callTimer.textContent = '00:00';

    timerInterval = setInterval(() => {
        secondsElapsed++;
        remainingFreeSeconds--;

        callTimer.textContent = formatTime(secondsElapsed);
        balanceDisplay.textContent = formatTime(Math.max(0, remainingFreeSeconds));

        if (remainingFreeSeconds <= 0) {
            stopCall('ফ্রি মিনিট শেষ হওয়ায় কল কেটে গেছে');
        }
    }, 1000);
}

// কল শেষ করার ফাংশন
function stopCall(reasonText) {
    if (activeLiveCall) {
        activeLiveCall.disconnect();
        activeLiveCall = null;
    }
    clearTimeout(ringTimeout);
    clearInterval(timerInterval);
    isCallActive = false;

    callStatus.textContent = reasonText;
    callStatus.className = 'call-status';
    callTimer.classList.add('hidden');

    endCallBtn.classList.add('hidden');
    callBtn.classList.remove('hidden');
    phoneInput.disabled = false;
    backspaceBtn.disabled = false;

    setTimeout(() => {
        if (!isCallActive) {
            callStatus.textContent = 'কল করার জন্য প্রস্তুত';
        }
    }, 3000);
}

// কল শুরু করার বাটন
callBtn.addEventListener('click', async () => {
    const number = normalizeNumber(phoneInput.value);
    phoneInput.value = number;

    if (remainingFreeSeconds <= 0) {
        callStatus.textContent = 'ফ্রি মিনিট শেষ! নতুন ব্যালেন্স যোগ করুন';
        callStatus.className = 'call-status error';
        return;
    }

    if (!isValidBDNumber(number)) {
        callStatus.textContent = 'সঠিক ১১ ডিজিটের নম্বর দিন (যেমন: 017XXXXXXXX)';
        callStatus.className = 'call-status error';
        return;
    }

    isCallActive = true;
    callBtn.classList.add('hidden');
    endCallBtn.classList.remove('hidden');
    phoneInput.disabled = true;
    backspaceBtn.disabled = true;

    const fullBDNumber = `+88${number}`;
    const tenDigitForServer = number.substring(1); // সার্ভারের জন্য 1XXXXXXXXX

    callStatus.textContent = `${fullBDNumber} নম্বরে সংযোগ পাঠানো হচ্ছে...`;
    callStatus.className = 'call-status calling';

    try {
        const response = await fetch('/api/make-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: tenDigitForServer })
        });

        const result = await response.json();

        if (!result.success) {
            stopCall(result.message || 'কল করা সম্ভব হয়নি');
            return;
        }

        callStatus.textContent = `${fullBDNumber} নম্বরে রিং হচ্ছে...`;

        ringTimeout = setTimeout(() => {
            callStatus.textContent = result.mode === 'live'
                ? 'আসল কল সংযুক্ত! এখন কথা বলুন'
                : 'সার্ভার টেস্ট কল সংযুক্ত (গেটওয়ে কী যুক্ত করলে ফোনে রিং হবে)';
            callStatus.className = 'call-status connected';
            startCallTimer();
        }, 2500);

    } catch (error) {
        stopCall('সার্ভার বন্ধ আছে! টার্মিনালে node server.js চালু করুন');
    }
});

// কল কাটার বাটন
endCallBtn.addEventListener('click', () => {
    stopCall('কল শেষ হয়েছে');
});
