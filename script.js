const phoneInput = document.getElementById('phoneNumber');
const backspaceBtn = document.getElementById('backspaceBtn');
const keys = document.querySelectorAll('.key');
const callBtn = document.getElementById('callBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callStatus = document.getElementById('callStatus');
const balanceDisplay = document.getElementById('freeMinutesText');
const networkStatusText = document.getElementById('networkStatusText');

// ইনকামিং কল ওভারলে এলিমেন্ট
const simIncomingBtn = document.getElementById('simIncomingBtn');
const incomingCallOverlay = document.getElementById('incomingCallOverlay');
const incomingNameDisplay = document.getElementById('incomingNameDisplay');
const incomingNumberDisplay = document.getElementById('incomingNumberDisplay');
const acceptIncomingBtn = document.getElementById('acceptIncomingBtn');
const rejectIncomingBtn = document.getElementById('rejectIncomingBtn');

// চলমান কল ওভারলে এলিমেন্ট
const activeCallOverlay = document.getElementById('activeCallOverlay');
const callingNameDisplay = document.getElementById('callingNameDisplay');
const callingNumberDisplay = document.getElementById('callingNumberDisplay');
const overlayCallStatus = document.getElementById('overlayCallStatus');
const callTimer = document.getElementById('callTimer');
const muteBtn = document.getElementById('muteBtn');
const speakerBtn = document.getElementById('speakerBtn');

// ট্যাব ও লিস্ট
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');
const historyList = document.getElementById('historyList');
const contactList = document.getElementById('contactList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// বিজ্ঞাপন ও কন্টাক্ট মোডাল
const watchAdBtn = document.getElementById('watchAdBtn');
const adModal = document.getElementById('adModal');
const adCountdown = document.getElementById('adCountdown');
const claimRewardBtn = document.getElementById('claimRewardBtn');

const saveQuickContactBtn = document.getElementById('saveQuickContactBtn');
const openAddContactBtn = document.getElementById('openAddContactBtn');
const contactModal = document.getElementById('contactModal');
const contactNameInput = document.getElementById('contactNameInput');
const contactNumberInput = document.getElementById('contactNumberInput');
const cancelContactBtn = document.getElementById('cancelContactBtn');
const saveContactConfirmBtn = document.getElementById('saveContactConfirmBtn');

let timerInterval = null;
let ringTimeout = null;
let ringtoneInterval = null;
let adTimerInterval = null;
let secondsElapsed = 0;
let remainingFreeSeconds = parseInt(localStorage.getItem('freecall_balance') || '300', 10);

let isCallActive = false;
let isCallConnected = false;
let currentCallType = 'outgoing';
let currentActiveNumber = '';

let savedContacts = JSON.parse(localStorage.getItem('freecall_contacts') || '[]');
let callHistory = JSON.parse(localStorage.getItem('freecall_history') || '[]');

function formatTime(totalSeconds) {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
}

function updateBalanceUI() {
    balanceDisplay.textContent = formatTime(Math.max(0, remainingFreeSeconds));
    localStorage.setItem('freecall_balance', remainingFreeSeconds);
}
updateBalanceUI();

function playBeep(freq = 650, duration = 70) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        setTimeout(() => {
            osc.stop();
            ctx.close();
        }, duration);
    } catch (e) {}
}

function startRingtone() {
    stopRingtone();
    playBeep(880, 220);
    ringtoneInterval = setInterval(() => {
        playBeep(880, 220);
        setTimeout(() => playBeep(1046, 220), 260);
    }, 1400);
}

function stopRingtone() {
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
    }
}

function normalizeNumber(rawValue) {
    let cleaned = String(rawValue).replace(/[^0-9]/g, '');
    if (cleaned.startsWith('880')) {
        cleaned = '0' + cleaned.substring(3);
    }
    return cleaned.slice(0, 11);
}

async function initVoiceSystem() {
    try {
        const res = await fetch('/api/token');
        const data = await res.json();
        networkStatusText.textContent = data.mode === 'live' ? 'লাইভ নেটওয়ার্ক' : 'অনলাইন প্রস্তুত';
    } catch (err) {
        networkStatusText.textContent = 'অফলাইন মোড';
    }
}
initVoiceSystem();

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        item.classList.add('active');
        const targetEl = document.getElementById(item.getAttribute('data-target'));
        if (targetEl) targetEl.classList.add('active');
    });
});

keys.forEach(key => {
    key.addEventListener('click', () => {
        if (isCallActive) return;
        playBeep();
        const num = key.getAttribute('data-num');
        if (num === '*' || num === '#') return;
        phoneInput.value = normalizeNumber(phoneInput.value + num);
    });
});

phoneInput.addEventListener('input', () => {
    phoneInput.value = normalizeNumber(phoneInput.value);
});

backspaceBtn.addEventListener('click', () => {
    if (isCallActive) return;
    phoneInput.value = phoneInput.value.slice(0, -1);
});

function isValidBDNumber(num) {
    return /^01[3-9]\d{8}$/.test(num);
}

function getContactName(num) {
    const found = savedContacts.find(c => c.number === num);
    return found ? found.name : 'অজানা নম্বর';
}

function renderContacts() {
    if (savedContacts.length === 0) {
        contactList.innerHTML = '<p class="empty-msg">কোনো কন্টাক্ট সেভ করা নেই</p>';
        return;
    }
    contactList.innerHTML = savedContacts.map((c, idx) => `
        <div class="list-item">
            <div class="item-left">
                <div class="call-type-badge badge-incoming">👤</div>
                <div class="item-info">
                    <h4>${c.name}</h4>
                    <p>+88${c.number}</p>
                </div>
            </div>
            <div>
                <button type="button" class="mini-call-btn" onclick="quickDial('${c.number}')" title="কল করুন">📞</button>
                <button type="button" class="text-danger-btn" onclick="deleteContact(${idx})" title="মুছুন">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderHistory() {
    if (callHistory.length === 0) {
        historyList.innerHTML = '<p class="empty-msg">এখনো কোনো কল রেকর্ড নেই</p>';
        return;
    }
    historyList.innerHTML = callHistory.map(h => {
        let icon = '↗️';
        let badgeClass = 'badge-outgoing';
        let label = 'আউটগোয়িং কল';

        if (h.type === 'incoming') {
            icon = '↙️';
            badgeClass = 'badge-incoming';
            label = 'ইনকামিং রিসিভড';
        } else if (h.type === 'missed') {
            icon = '❌';
            badgeClass = 'badge-missed';
            label = 'মিসড কল';
        }

        return `
            <div class="list-item">
                <div class="item-left">
                    <div class="call-type-badge ${badgeClass}">${icon}</div>
                    <div class="item-info">
                        <h4>${getContactName(h.number)}</h4>
                        <p>+88${h.number} • ${label} (${h.duration})</p>
                        <p>${h.time}</p>
                    </div>
                </div>
                <button type="button" class="mini-call-btn" onclick="quickDial('${h.number}')" title="কলব্যাক করুন">📞</button>
            </div>
        `;
    }).join('');
}

function addCallRecord(number, type, durationSec) {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    callHistory.unshift({
        number: number,
        type: type,
        time: now,
        duration: formatTime(durationSec)
    });
    localStorage.setItem('freecall_history', JSON.stringify(callHistory));
    renderHistory();
}

window.quickDial = function(num) {
    if (isCallActive) return;
    phoneInput.value = num;
    const keypadTab = document.querySelector('[data-target="tab-keypad"]');
    if (keypadTab) keypadTab.click();
    callBtn.click();
};

window.deleteContact = function(idx) {
    savedContacts.splice(idx, 1);
    localStorage.setItem('freecall_contacts', JSON.stringify(savedContacts));
    renderContacts();
    renderHistory();
};

renderContacts();
renderHistory();

function openContactModal(prefillNumber = '') {
    contactNameInput.value = '';
    contactNumberInput.value = prefillNumber;
    contactModal.classList.remove('hidden');
}

saveQuickContactBtn.addEventListener('click', () => openContactModal(phoneInput.value));
openAddContactBtn.addEventListener('click', () => openContactModal(''));
cancelContactBtn.addEventListener('click', () => contactModal.classList.add('hidden'));

saveContactConfirmBtn.addEventListener('click', () => {
    const name = contactNameInput.value.trim();
    const num = normalizeNumber(contactNumberInput.value);
    if (!name || !isValidBDNumber(num)) {
        alert('সঠিক নাম এবং ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)');
        return;
    }
    const existingIndex = savedContacts.findIndex(c => c.number === num);
    if (existingIndex !== -1) {
        savedContacts[existingIndex].name = name;
    } else {
        savedContacts.unshift({ name, number: num });
    }
