// Local Storage Key
const STORAGE_KEY = 'voice_tracker_logs';

// DOM Elements
const totalAmountEl = document.getElementById('total-amount');
const currentMonthEl = document.getElementById('current-month');
const logsListEl = document.getElementById('logs-list');
const pttBtn = document.getElementById('ptt-btn');
const statusText = document.getElementById('status-text');
const waveformContainer = document.getElementById('waveform-container');
const transcriptPreview = document.getElementById('transcript-preview');
const toast = document.getElementById('toast');

// State
let isRecording = false;
let logs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let recognition = null;
let finalTranscript = '';

// Setup Speech Recognition (Web Speech API as Native STT fallback for web)
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isRecording = true;
        updateUIState('RECORDING');
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        transcriptPreview.textContent = finalTranscript + interimTranscript;
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        showToast('Microphone error: ' + event.error, true);
        stopRecording();
    };

    recognition.onend = () => {
        if (isRecording) {
            // Unexpected end, restart or handle
        } else if (finalTranscript.trim().length > 0 || transcriptPreview.textContent.trim().length > 0) {
            processTranscript(finalTranscript.trim() || transcriptPreview.textContent.trim());
        } else {
            updateUIState('IDLE');
        }
    };
} else {
    showToast('Speech Recognition not supported in this browser.', true);
}

// Format currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
};

// Initialize App
const init = () => {
    const date = new Date();
    currentMonthEl.textContent = date.toLocaleString('default', { month: 'long' }).toUpperCase();
    renderLogs();
    
    // Bind PTT events
    // For mobile (touch) and desktop (mouse)
    pttBtn.addEventListener('mousedown', startRecording);
    pttBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); }, { passive: false });
    
    window.addEventListener('mouseup', stopRecording);
    window.addEventListener('touchend', stopRecording);
};

// Update UI State
const updateUIState = (state) => {
    switch (state) {
        case 'IDLE':
            pttBtn.classList.remove('recording');
            waveformContainer.classList.remove('active');
            statusText.textContent = 'Hold to Speak';
            statusText.style.color = 'var(--text-muted)';
            break;
        case 'RECORDING':
            pttBtn.classList.add('recording');
            waveformContainer.classList.add('active');
            statusText.textContent = 'Listening...';
            statusText.style.color = 'var(--danger-color)';
            break;
        case 'PROCESSING':
            pttBtn.classList.remove('recording');
            waveformContainer.classList.add('active'); // keep wave for processing
            statusText.textContent = 'Analyzing...';
            statusText.style.color = 'var(--primary-color)';
            break;
    }
};

// Start Recording
const startRecording = () => {
    if (!recognition || isRecording) return;
    
    // Haptic feedback if supported
    if (navigator.vibrate) navigator.vibrate(50);
    
    finalTranscript = '';
    transcriptPreview.textContent = '';
    
    try {
        recognition.start();
    } catch (e) {
        console.error(e);
    }
};

// Stop Recording
const stopRecording = () => {
    if (!isRecording) return;
    isRecording = false;
    
    if (recognition) {
        recognition.stop();
    }
    
    // Fallback if final hasn't fired but interim has
    let currentText = finalTranscript || transcriptPreview.textContent;
    if (currentText && currentText.trim().length > 0) {
        updateUIState('PROCESSING');
        // Let the onend handler pick it up, or if recognition was already stopped, we process it here.
        // Process is called in onend, to prevent duplicate calls, we rely on onend. 
        // But occasionally onend takes time, so we show 'PROCESSING' UI immediately.
    } else {
        updateUIState('IDLE');
    }
};

// Mock Gemini AI Processing
const processTranscript = async (text) => {
    updateUIState('PROCESSING');
    
    try {
        // Simulate network delay and AI processing (target < 2 seconds latency)
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        // Simple NLP mock for demo purposes since we don't have a real API key provided
        // In reality, this would be a fetch to Gemini API
        const parsedData = mockGeminiExtract(text);
        
        if (parsedData) {
            saveLog(parsedData);
            showToast('Expense logged successfully!');
            
            // Success haptic
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        } else {
            showToast('Could not understand expense. Please try again.', true);
        }
    } catch (error) {
        showToast('Processing failed.', true);
    } finally {
        transcriptPreview.textContent = '';
        finalTranscript = '';
        updateUIState('IDLE');
    }
};

// A very basic regex-based parser to simulate the AI for the demo
const mockGeminiExtract = (text) => {
    const lowerText = text.toLowerCase();
    
    // Extract amount (number)
    const amountMatch = lowerText.match(/\$?(\d+(\.\d{1,2})?)/);
    if (!amountMatch) return null; // Clarification Required edge case
    
    const amount = parseFloat(amountMatch[1]);
    
    // Guess category based on keywords
    let category = 'Miscellaneous';
    if (lowerText.match(/pizza|coffee|lunch|dinner|food|burger|starbucks|mcdonalds|restaurant|grocery|groceries/)) category = 'Food';
    else if (lowerText.match(/gas|uber|lyft|taxi|train|transit|flight|ticket/)) category = 'Transport';
    else if (lowerText.match(/netflix|spotify|hulu|subscription|gym|prime/)) category = 'Subs';
    else if (lowerText.match(/movie|game|theater|concert/)) category = 'Entertainment';
    else if (lowerText.match(/shirt|shoes|mall|clothes|jacket|jeans|pants/)) category = 'Shopping';
    else if (lowerText.match(/medicine|doctor|pharmacy|hospital/)) category = 'Health';
    
    // Guess item
    // Remove common stop words and the amount to get a gist of the item
    let item = text.replace(amountMatch[0], '')
                  .replace(/i spent|spent|paid|bought|on|for|dollars|bucks|cost|was/gi, '')
                  .trim();
                  
    if (!item) item = category; // fallback
    
    // Capitalize first letter
    item = item.charAt(0).toUpperCase() + item.slice(1);
    
    return {
        id: Date.now().toString(),
        amount: amount,
        item: item.length > 20 ? item.substring(0, 20) + '...' : item, // truncate
        category: category,
        timestamp: new Date().toISOString(),
        raw_transcript: text
    };
};

// Save Log to Storage
const saveLog = (data) => {
    logs.unshift(data); // Add to beginning
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    renderLogs();
};

// Render Logs List
const renderLogs = () => {
    logsListEl.innerHTML = '';
    
    let total = 0;
    
    if (logs.length === 0) {
        logsListEl.innerHTML = '<div class="empty-state">No expenses yet. Hold the button to add one!</div>';
    } else {
        logs.forEach(log => {
            total += log.amount;
            
            const li = document.createElement('li');
            li.className = 'log-item';
            li.innerHTML = `
                <div class="log-details">
                    <span class="log-title">${log.item}</span>
                    <span class="log-category">${log.category}</span>
                </div>
                <div class="log-amount">${formatCurrency(log.amount)}</div>
            `;
            logsListEl.appendChild(li);
        });
    }
    
    // Animate total amount if it changes
    const formattedTotal = formatCurrency(total);
    if (totalAmountEl.textContent !== formattedTotal) {
        totalAmountEl.textContent = formattedTotal;
        totalAmountEl.style.transform = 'scale(1.1)';
        setTimeout(() => totalAmountEl.style.transform = 'scale(1)', 200);
    }
};

// Show Toast
const showToast = (message, isError = false) => {
    toast.textContent = message;
    if (isError) toast.classList.add('error');
    else toast.classList.remove('error');
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
};

// Boot
document.addEventListener('DOMContentLoaded', init);
