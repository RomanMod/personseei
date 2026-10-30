import './index.css';
import { peopleCatalog } from './src/data/peopleCatalog.js';

// === GLOBAL APPLICATION CONFIGURATION ===
/* global __APP_VERSION__ */
const CURRENT_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.3.7';
const APP_VERSION_FALLBACK = CURRENT_APP_VERSION;
const FALLBACK_PLACEHOLDER_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='500' viewBox='0 0 400 500'%3E%3Crect width='400' height='500' fill='%23131313'/%3E%3Ccircle cx='200' cy='180' r='60' fill='%232C2C2E'/%3E%3Cpath d='M120 340 C120 260 280 260 280 340 Z' fill='%232C2C2E'/%3E%3C/svg%3E";

// Detect app version upgrade: automatically clear stale cache to prevent broken images and photo loops
try {
    const installedVer = safeGetItem('app_installed_version');
    if (installedVer !== CURRENT_APP_VERSION) {
        if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null) {
            window.localStorage.removeItem('wikidataCache');
            window.localStorage.removeItem('appLogs_persistent');
        }
        safeSetItem('app_installed_version', CURRENT_APP_VERSION);
    }
} catch (e) {}

// === LOG CAPTURE & DIAGNOSTICS CODE (MUST BE AT THE VERY TOP) ===
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

window.diagnosticsEnabled = safeGetItem('diagnostics_enabled') === 'true'; // Disabled by default, can be toggled by tapping version badge 10 times
window.appLogs = [];

// Helper for early safe localStorage access before wrapper is defined
function safeGetItem(key) {
    try {
        if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null) {
            return window.localStorage.getItem(key);
        }
    } catch (e) {}
    return null;
}

function safeSetItem(key, value) {
    try {
        if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null) {
            window.localStorage.setItem(key, value);
        }
    } catch (e) {}
}

// === GOOGLE SHEETS WEBHOOK CONFIGURATION (SAFELY INITIALIZED AT TOP) ===
const GOOGLE_SHEETS_SECURITY_TOKEN = "ipersonsee_safe_2026";
const BUILTIN_GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzZwEUME6E0vkbRSSrFlBov2fOE_paLZ57fsczTp9IS58MqmT58YbvXzzBxGn9XEJf5Lw/exec";
const DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SHEETS_WEBHOOK_URL) || BUILTIN_GOOGLE_SHEETS_WEBHOOK_URL;

let googleSheetsWebhookUrl = "";

function getActiveSheetsWebhookUrl() {
    try {
        const stored = safeGetItem('google_sheets_webhook_url');
        if (stored && typeof stored === 'string') {
            const trimmed = stored.trim();
            if (trimmed.startsWith('https://script.google.com/')) {
                return trimmed;
            }
        }
    } catch (e) {}
    if (googleSheetsWebhookUrl && typeof googleSheetsWebhookUrl === 'string' && googleSheetsWebhookUrl.startsWith('https://script.google.com/')) {
        return googleSheetsWebhookUrl.trim();
    }
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SHEETS_WEBHOOK_URL) {
        const envUrl = String(import.meta.env.VITE_SHEETS_WEBHOOK_URL).trim();
        if (envUrl.startsWith('https://script.google.com/')) {
            return envUrl;
        }
    }
    return BUILTIN_GOOGLE_SHEETS_WEBHOOK_URL;
}

googleSheetsWebhookUrl = getActiveSheetsWebhookUrl();

// Sheets Logging Mode (Option 2): 'summary' (1 game = 1 row) vs 'detailed' (all micro events)
let sheetsLoggingMode = safeGetItem('sheets_logging_mode') || 'summary';
let gameSessionStartTime = Date.now();
let sessionGuessedPersons = [];
let sessionFindNewClicks = 0;
let currentSessionLocalStartTime = '';

function formatGuessHistoryString() {
    if (!guessResultsHistory || guessResultsHistory.length === 0) return '';
    return guessResultsHistory.map((res, idx) => {
        const dur = (attemptDurations && attemptDurations[idx] !== undefined) ? attemptDurations[idx] : 0;
        const icon = res === 1 ? '✅' : '❌';
        return `${icon}(${dur}s)`;
    }).join(' ');
}

function formatDurationSeconds(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '0:00';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

try {
    if (window.diagnosticsEnabled) {
        const savedLogsString = safeGetItem('appLogs_persistent');
        if (savedLogsString) {
            window.appLogs = JSON.parse(savedLogsString);
            window.appLogs.push(`[${new Date().toISOString().split('T')[1].slice(0, 11)}] [SYSTEM] --- APPLICATION RESTARTED (PREVIOUS LOGS PRESERVED) ---`);
            if (window.appLogs.length > 250) {
                window.appLogs.shift();
            }
        }
    }
} catch (e) {
    window.appLogs = [];
}

// Throttled storage write helper to avoid lagging the main thread
let saveLogsTimeout = null;
function scheduleSaveLogs() {
    if (saveLogsTimeout) return;
    saveLogsTimeout = setTimeout(() => {
        saveLogsTimeout = null;
        try {
            safeSetItem('appLogs_persistent', JSON.stringify(window.appLogs));
        } catch (e) {}
    }, 3000); // Save at most once every 3 seconds
}

function captureLog(type, args) {
    if (!window.diagnosticsEnabled) {
        return;
    }
    const timeStr = new Date().toISOString().split('T')[1].slice(0, 11);
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try { return JSON.stringify(arg); } catch (e) { return String(arg); }
        }
        return String(arg);
    }).join(' ');
    
    window.appLogs.push(`[${timeStr}] [${type}] ${message}`);
    if (window.appLogs.length > 250) {
        window.appLogs.shift();
    }
    
    scheduleSaveLogs();
    
    // Only update DOM if the diagnostics panel is open/visible to prevent expensive layout/rendering calculations
    const diagPanel = document.getElementById('diagnostics-panel');
    if (diagPanel && diagPanel.style.display !== 'none') {
        const debugPre = document.getElementById('debug-log-output');
        if (debugPre) {
            debugPre.textContent = window.appLogs.join('\n');
            // Auto scroll to bottom
            debugPre.scrollTop = debugPre.scrollHeight;
        }
    }
}

console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    captureLog('LOG', args);
};
console.warn = function(...args) {
    originalConsoleWarn.apply(console, args);
    captureLog('WARN', args);
};
console.error = function(...args) {
    originalConsoleError.apply(console, args);
    captureLog('ERROR', args);
};

window.addEventListener('error', (event) => {
    console.error(`[UNCAUGHT_ERROR] Got uncaught exception in window: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error(`[UNHANDLED_PROMISE] Got unhandled rejection: ${event.reason}`);
});

window.addEventListener('beforeunload', () => {
    if (window.diagnosticsEnabled && window.appLogs && window.appLogs.length > 0) {
        try {
            safeSetItem('appLogs_persistent', JSON.stringify(window.appLogs));
        } catch (e) {}
    }
});

function isCloudStorageSupported() {
    try {
        return Boolean(
            typeof window !== 'undefined' &&
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.CloudStorage &&
            (typeof window.Telegram.WebApp.isVersionAtLeast === 'function' ? window.Telegram.WebApp.isVersionAtLeast('6.9') : false)
        );
    } catch (e) {
        return false;
    }
}

// Safe localStorage wrapper to prevent crashes in sandboxed iframe or Telegram WebView environments
const localStorage = (() => {
    let storage = {};
    let isSupported = false;
    try {
        if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null) {
            window.localStorage.setItem('__test_ls_support', '1');
            window.localStorage.removeItem('__test_ls_support');
            isSupported = true;
        }
    } catch (e) {
        // Native localStorage is blocked or not available
    }

    return {
        getItem(key) {
            if (isSupported) {
                try {
                    return window.localStorage.getItem(key);
                } catch (e) {}
            }
            return storage[key] !== undefined ? storage[key] : null;
        },
        setItem(key, value) {
            if (isSupported) {
                try {
                    window.localStorage.setItem(key, value);
                } catch (e) {}
            }
            storage[key] = String(value);
            
            // Asynchronously sync to Telegram WebApp CloudStorage if available (Bot API 6.9+)
            // CRITICAL: Telegram CloudStorage has a 4096-byte limit per key!
            // NEVER sync giant caches (like wikidataCache, rgbHslCache, logs) to CloudStorage!
            const TG_ALLOWED_CLOUD_KEYS = new Set([
                'theme', 'language', 'mode', 'totalGuesses', 
                'successfulGuesses', 'failedGuesses', 'currentAttempts', 
                'guessResultsHistory', 'attemptDurations', 'currentSessionId', 
                'currentAttemptStartTime', 'top_controls_collapsed', 'diagnostics_enabled'
            ]);

            if (TG_ALLOWED_CLOUD_KEYS.has(key) && isCloudStorageSupported()) {
                const strVal = String(value);
                if (strVal.length <= 2500) {
                    try {
                        window.Telegram.WebApp.CloudStorage.setItem(key, strVal, (err, success) => {
                            if (err) {
                                console.warn(`[TG_CLOUD_STORAGE_WARN] Asynchronous setItem failed for key "${key}":`, err);
                            } else {
                                console.log(`[TG_CLOUD_STORAGE_OK] Asynchronously saved key "${key}" to Telegram cloud storage.`);
                            }
                        });
                    } catch (e) {
                        console.warn(`[TG_CLOUD_STORAGE_ERROR] Exception while calling setItem for key "${key}":`, e);
                    }
                }
            }
        },
        removeItem(key) {
            if (isSupported) {
                try {
                    window.localStorage.removeItem(key);
                } catch (e) {}
            }
            delete storage[key];
            
            // Asynchronously sync removal to Telegram WebApp CloudStorage if available
            const TG_ALLOWED_CLOUD_KEYS = new Set([
                'theme', 'language', 'mode', 'totalGuesses', 
                'successfulGuesses', 'failedGuesses', 'currentAttempts', 
                'guessResultsHistory', 'attemptDurations', 'currentSessionId', 
                'currentAttemptStartTime', 'top_controls_collapsed', 'diagnostics_enabled'
            ]);

            if (TG_ALLOWED_CLOUD_KEYS.has(key) && isCloudStorageSupported()) {
                try {
                    window.Telegram.WebApp.CloudStorage.removeItem(key, (err, success) => {
                        if (err) {
                            console.warn(`[TG_CLOUD_STORAGE_WARN] Asynchronous removeItem failed for key "${key}":`, err);
                        } else {
                            console.log(`[TG_CLOUD_STORAGE_OK] Asynchronously removed key "${key}" from Telegram cloud storage.`);
                        }
                    });
                } catch (e) {
                    console.warn(`[TG_CLOUD_STORAGE_ERROR] Exception while calling removeItem for key "${key}":`, e);
                }
            }
        },
        clear() {
            if (isSupported) {
                try {
                    window.localStorage.clear();
                } catch (e) {}
            }
            storage = {};
        },
        setInMemoryValue(key, value) {
            storage[key] = String(value);
            console.log(`[STORAGE_IN_MEMORY_PREFILL] Key "${key}" prefilled with value:`, value);
        }
    };
})();

function runSystemDiagnostics() {
    console.log('--- RUNNING DIAGNOSTICS ---');
    console.log(`[DIAG] Current Local Time: ${new Date().toString()}`);
    try {
        console.log(`[DIAG] Build App Version: v${APP_VERSION_FALLBACK}`);
        if (typeof __BUILD_TIME__ !== 'undefined') {
            console.log(`[DIAG] Build Completion Time: ${__BUILD_TIME__}`);
        }
    } catch (e) {}
    console.log(`[DIAG] User Agent: ${navigator.userAgent}`);
    console.log(`[DIAG] Platform (Navigator): ${navigator.platform}`);
    
    // Telegram State
    if (window.Telegram) {
        console.log('[DIAG] window.Telegram: Present');
        if (window.Telegram.WebApp) {
            console.log('[DIAG] Telegram.WebApp: Present');
            console.log(`[DIAG] WebApp Platform: ${window.Telegram.WebApp.platform}`);
            console.log(`[DIAG] WebApp Version: ${window.Telegram.WebApp.version}`);
            console.log(`[DIAG] WebApp ColorScheme: ${window.Telegram.WebApp.colorScheme}`);
            console.log(`[DIAG] WebApp IsExpanded: ${window.Telegram.WebApp.isExpanded}`);
            
            const tgUser = window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user;
            if (tgUser) {
                console.log(`[DIAG] WebApp User ID: ${tgUser.id}`);
                console.log(`[DIAG] WebApp Username: ${tgUser.username || "none"}`);
                console.log(`[DIAG] WebApp LangCode: ${tgUser.language_code || "none"}`);
            } else {
                console.log('[DIAG] WebApp User: No data in initDataUnsafe');
            }
        } else {
            console.log('[DIAG] Telegram.WebApp: Undefined');
        }
    } else {
        console.log('[DIAG] window.Telegram: Undefined (not running in Telegram)');
    }
    
    // Privacy and cookies
    try {
        localStorage.setItem('__test_ls', '1');
        localStorage.removeItem('__test_ls');
        console.log('[DIAG] LocalStorage write check: SUCCESS');
    } catch(e) {
        console.error('[DIAG] LocalStorage write check: FAILING', e);
    }
    
    try {
        document.cookie = "ga_test=1; SameSite=Lax";
        const cookiesAllowed = document.cookie.indexOf("ga_test") !== -1;
        console.log(`[DIAG] Cookies write check: ${cookiesAllowed ? 'ALLOWED' : 'BLOCKED/DENIED'}`);
    } catch (e) {
        console.error('[DIAG] Cookies write check: FAILING', e);
    }
    
    // GTM and gtag Status
    const gaScripts = Array.from(document.querySelectorAll('script')).filter(s => s.src && s.src.includes('googletagmanager.com'));
    console.log(`[DIAG] GTM elements found in DOM: ${gaScripts.length}`);
    gaScripts.forEach((s, i) => {
        console.log(`  [GTM-Script #${i}] SRC: ${s.src}, ASYNC: ${s.async}`);
    });
    
    console.log(`[DIAG] typeof gtag: ${typeof gtag}`);
    console.log(`[DIAG] typeof window.gtag: ${typeof window.gtag}`);
    console.log(`[DIAG] window.google_tag_manager present: ${typeof window.google_tag_manager !== 'undefined'}`);
    console.log(`[DIAG] window.dataLayer present: ${typeof window.dataLayer !== 'undefined'}`);
    if (typeof window.dataLayer !== 'undefined') {
        console.log(`[DIAG] window.dataLayer length: ${window.dataLayer.length}`);
        try {
            console.log(`[DIAG] window.dataLayer events list: ${JSON.stringify(window.dataLayer)}`);
        } catch(err) {
            console.log(`[DIAG] window.dataLayer stringify error: ${err.message}`);
        }
    }
    
    // Google Sheets Webhook Diagnostics
    const activeWebhookUrl = typeof getActiveSheetsWebhookUrl === 'function' ? getActiveSheetsWebhookUrl() : (googleSheetsWebhookUrl || DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL);
    console.log(`[DIAG] Google Sheets Webhook Configured: ${Boolean(activeWebhookUrl)}`);
    if (activeWebhookUrl) {
        console.log(`[DIAG] Google Sheets Webhook URL Prefix: ${activeWebhookUrl.substring(0, 48)}...`);
    } else {
        console.log('[DIAG] Google Sheets Webhook URL: NOT CONFIGURED');
    }
    
    console.log('--- END DIAGNOSTICS ---');
}
// ======================================


// Настройки приложения
const settings = {
    superRandomPeople: true,
    dynamicOffset: true,
    maxOffset: 80,
    maxPeople: 25,
    sessionPeople: 10,
    genderRatio: { male: 50, female: 50 },
    statusRatio: { alive: 50, deceased: 50 },
    birthYearFilter: 1940,
    excludeBlackAndWhite: false,
    selectedCountries: ['ua', 'us'],
    countryMap: {
        'ua': 'Q212',
        'us': 'Q30',
        'ru': 'Q159',
        'de': 'Q183',
        'gb': 'Q145'
    },
    strictCountryFilter: false
};

// Helper function for safe localStorage parsing to prevent crashes
function safeParse(key, defaultValue) {
    try {
        const val = localStorage.getItem(key);
        if (val === null || val === undefined) return defaultValue;
        return JSON.parse(val);
    } catch (e) {
        console.error(`[STORAGE_ERROR] Error parsing key "${key}" from localStorage:`, e);
        return defaultValue;
    }
}

// Кэш и состояние
const rgbHslCache = safeParse('rgbHslCache', {});
const wikidataCache = safeParse('wikidataCache', {});
let sessionList = [];
let isStreamingActive = false;
let currentStreamId = 0;
let loadedPhotos = 0;
let currentPerson = null;
let userGenderGuess = null;
let userStatusGuess = null;
let totalGuesses = parseInt(localStorage.getItem('totalGuesses')) || 0;
let successfulGuesses = parseInt(localStorage.getItem('successfulGuesses')) || 0;
let failedGuesses = parseInt(localStorage.getItem('failedGuesses')) || 0;
let hasChecked = false;
let currentAttempts = parseInt(localStorage.getItem('currentAttempts')) || 0;
const maxAttempts = 10;
let guessResultsHistory = safeParse('guessResultsHistory', []); // Stores 1 for success, 0 for fail
let attemptDurations = safeParse('attemptDurations', []);


// Состояние для GA4 события attempt_completed
let currentSessionId = localStorage.getItem('currentSessionId') || null;
let currentAttemptStartTime = localStorage.getItem('currentAttemptStartTime') ? parseInt(localStorage.getItem('currentAttemptStartTime')) : null;
let telegramUserId = null; // Telegram User ID
let telegramUserName = null; // Telegram User Name


// DOM element references for New Game button positioning
let newGameBtn = null;
let initialNewGameContainer = null;
let gameOverNewGameContainer = null;
let newGameButtonTimeoutId = null; // Timeout ID for delayed "New Game" button appearance

// Состояние для предварительной загрузки
let preloadedPersonContainer = null; // { data: { person: personBinding, category: categoryObj }, imageElement: HTMLImageElement, commonsUrl: string, proxyUrl: string }
let isCurrentlyPreloading = false; // Флаг для предотвращения одновременных предварительных загрузок
let buttonVisibilityTimeoutId = null;


const languageLabels = {
    uk: 'Українська',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    zh: '中文',
    it: 'Italiano',
    ru: 'Русский',
    alien: '👽 ☍Ψ☌'
};

// Переводы
const translations = {
    uk: {
        themeNight: '🌙 Ніч',
        themeDay: '☀ День',
        modeOpen: 'Відкритий',
        modeClosed: 'Закритий',
        nextPhoto: 'Знайти нове фото',
        nextPerson: 'Наступне фото',
        unknown: 'Невідомо',
        testPerson: 'Тестовий персонаж',
        statsSuccess: 'Успішні',
        statsFailure: 'Невдалі',
        statsSuccessRate: 'Відсоток успішних',
        checkBtn: 'Перевірити',
        male: 'Чоловік',
        female: 'Жінка',
        alive: 'Живий',
        deceased: 'Померлий',
        birth: 'Народження',
        death: 'Смерть',
        newGame: 'Нова гра',
        attempts: 'Спроби',
        error: 'Помилка',
        guessHistory: 'Історія успіх/час:',
        imageDisplayAlt: 'Зображення людини',
        errorLoadingImage: 'Помилка завантаження зображення',
        playerNameLabel: 'Гравець',
        diagnosticsTitle: '📊 Діагностика & Логи',
        clearLogs: 'Очистити логи',
        runDiagnostics: 'Запустити діагностику',
        copyLogs: 'Копіювати логи',
        appVersion: `Версія v${APP_VERSION_FALLBACK}`,
        correctGuess: 'ВІРНО',
        incorrectGuess: 'НЕВІРНО',
        overlayText: 'Протокол Порожнечі',
        statsTitleHeader: 'Духовна статистика',
        helpBtnText: 'Довідка',
        helpModalTitle: 'Як грати 📖',
        helpGoalTitle: 'Мета гри',
        helpGoalText: 'Вгадати стать людини та стан (живий чи померлий) за наданими фотографіями та підказками.',
        helpModesTitle: 'Режими гри',
        helpModeOpenTitle: '👁️ Відкритий режим',
        helpModeOpenText: 'Фото людини видно одразу. Переглядайте додаткові фото та вивчайте інформацію.',
        helpModeClosedTitle: '🔒 Закритий режим',
        helpModeClosedText: 'Фото приховано за екраном. Спочатку зробіть вибір (Стать і Статус), потім натисніть «Перевірити»!',
        helpButtonsTitle: 'Кнопки та керування',
        helpBtnNextPhotoText: '🔄 <strong>Знайти нове фото</strong> — завантажити інше фото тієї ж людини.',
        helpBtnNextPersonText: '👤 <strong>Наступне фото</strong> — перейти до іншої випадкової людини.',
        helpBtnCheckText: '✅ <strong>Перевірити</strong> — відкрити фото та дізнатися результат (у Закритому режимі).',
        helpBtnGenderStatusText: '🔘 <strong>Чоловік / Жінка / Живий / Померлий</strong> — варіанти відповідей.',
        gotItBtn: 'Зрозуміло!',
        topControlsSettings: 'Налаштування',
        topControlsCollapse: 'Згорнути'
    },
    en: {
        themeNight: '🌙 Night',
        themeDay: '☀ Day',
        modeOpen: 'Open',
        modeClosed: 'Closed',
        nextPhoto: 'Find New Photo',
        nextPerson: 'Next Photo',
        unknown: 'Unknown',
        testPerson: 'Test Person',
        statsSuccess: 'Successful',
        statsFailure: 'Unsuccessful',
        statsSuccessRate: 'Success Rate',
        checkBtn: 'Check',
        male: 'Male',
        female: 'Female',
        alive: 'Alive',
        deceased: 'Deceased',
        birth: 'Birth',
        death: 'Death',
        newGame: 'New Game',
        attempts: 'Attempts',
        error: 'Error',
        guessHistory: 'History success/time:',
        imageDisplayAlt: 'Image of person',
        errorLoadingImage: 'Error loading image',
        playerNameLabel: 'Player',
        diagnosticsTitle: '📊 Diagnostics & Logs',
        clearLogs: 'Clear Logs',
        runDiagnostics: 'Run Diagnostics',
        copyLogs: 'Copy Logs',
        appVersion: `Version v${APP_VERSION_FALLBACK}`,
        correctGuess: 'CORRECT',
        incorrectGuess: 'INCORRECT',
        overlayText: 'Void Protocol',
        statsTitleHeader: 'Spiritual Stats',
        helpBtnText: 'Help',
        helpModalTitle: 'How to Play 📖',
        helpGoalTitle: 'Goal of the Game',
        helpGoalText: 'Guess the person’s gender and status (alive or deceased) using photos and details.',
        helpModesTitle: 'Game Modes',
        helpModeOpenTitle: '👁️ Open Mode',
        helpModeOpenText: 'The photo is visible immediately. Browse photos and view details.',
        helpModeClosedTitle: '🔒 Closed Mode',
        helpModeClosedText: 'Photo is hidden. Select Gender and Status, then tap "Check"!',
        helpButtonsTitle: 'Buttons & Controls',
        helpBtnNextPhotoText: '🔄 <strong>Find New Photo</strong> — load another photo of the same person.',
        helpBtnNextPersonText: '👤 <strong>Next Photo</strong> — move on to a new random person.',
        helpBtnCheckText: '✅ <strong>Check</strong> — reveal the photo and see your result (in Closed Mode).',
        helpBtnGenderStatusText: '🔘 <strong>Male / Female / Alive / Deceased</strong> — select your answers.',
        gotItBtn: 'Got it!',
        topControlsSettings: 'Settings',
        topControlsCollapse: 'Collapse'
    },
    de: {
        themeNight: '🌙 Nacht',
        themeDay: '☀ Tag',
        modeOpen: 'Offen',
        modeClosed: 'Geschlossen',
        nextPhoto: 'Neues Foto suchen',
        nextPerson: 'Nächstes Foto',
        unknown: 'Unbekannt',
        testPerson: 'Testperson',
        statsSuccess: 'Erfolgreich',
        statsFailure: 'Erfolglos',
        statsSuccessRate: 'Erfolgsquote',
        checkBtn: 'Prüfen',
        male: 'Mann',
        female: 'Frau',
        alive: 'Lebendig',
        deceased: 'Verstorben',
        birth: 'Geburt',
        death: 'Tod',
        newGame: 'Neues Spiel',
        attempts: 'Versuche',
        error: 'Fehler',
        guessHistory: 'Verlauf Erfolg/Zeit:',
        imageDisplayAlt: 'Bild einer Person',
        errorLoadingImage: 'Fehler beim Laden des Bildes',
        playerNameLabel: 'Spieler',
        diagnosticsTitle: '📊 Diagnose & Protokolle',
        clearLogs: 'Protokolle löschen',
        runDiagnostics: 'Diagnose ausführen',
        copyLogs: 'Protokolle kopieren',
        appVersion: `Version v${APP_VERSION_FALLBACK}`,
        correctGuess: 'RICHTIG',
        incorrectGuess: 'FALSCH',
        overlayText: 'Leere-Protokoll',
        statsTitleHeader: 'Geistige Statistik',
        helpBtnText: 'Hilfe',
        helpModalTitle: 'Spielanleitung 📖',
        helpGoalTitle: 'Ziel des Spiels',
        helpGoalText: 'Errate Geschlecht und Status (lebend oder verstorben) anhand der Fotos.',
        helpModesTitle: 'Spielmodi',
        helpModeOpenTitle: '👁️ Offener Modus',
        helpModeOpenText: 'Das Foto ist sofort sichtbar. Durchsuche Fotos und Details.',
        helpModeClosedTitle: '🔒 Geschlossener Modus',
        helpModeClosedText: 'Foto ist verdeckt. Wähle Geschlecht & Status, dann klicke auf "Prüfen"!',
        helpButtonsTitle: 'Steuerung & Tasten',
        helpBtnNextPhotoText: '🔄 <strong>Neues Foto suchen</strong> — anderes Foto derselben Person laden.',
        helpBtnNextPersonText: '👤 <strong>Nächstes Foto</strong> — zu einer neuen zufälligen Person wechseln.',
        helpBtnCheckText: '✅ <strong>Prüfen</strong> — Foto aufdecken und Ergebnis sehen.',
        helpBtnGenderStatusText: '🔘 <strong>Mann / Frau / Lebendig / Verstorben</strong> — deine Auswahl.',
        gotItBtn: 'Verstanden!',
        topControlsSettings: 'Einstellungen',
        topControlsCollapse: 'Einklappen'
    },
    fr: {
        themeNight: '🌙 Nuit',
        themeDay: '☀ Jour',
        modeOpen: 'Ouvert',
        modeClosed: 'Fermé',
        nextPhoto: 'Trouver une nouvelle photo',
        nextPerson: 'Photo suivante',
        unknown: 'Inconnu',
        testPerson: 'Personne de test',
        statsSuccess: 'Réussis',
        statsFailure: 'Échecs',
        statsSuccessRate: 'Taux de réussite',
        checkBtn: 'Vérifier',
        male: 'Homme',
        female: 'Femme',
        alive: 'Vivant',
        deceased: 'Décédé',
        birth: 'Naissance',
        death: 'Décès',
        newGame: 'Nouvelle partie',
        attempts: 'Essais',
        error: 'Erreur',
        guessHistory: 'Historique succès/temps :',
        imageDisplayAlt: 'Image d’une personne',
        errorLoadingImage: 'Erreur de chargement de l’image',
        playerNameLabel: 'Joueur',
        diagnosticsTitle: '📊 Diagnostic & Journaux',
        clearLogs: 'Effacer les journaux',
        runDiagnostics: 'Lancer le diagnostic',
        copyLogs: 'Copier les journaux',
        appVersion: `Version v${APP_VERSION_FALLBACK}`,
        correctGuess: 'CORRECT',
        incorrectGuess: 'INCORRECT',
        overlayText: 'Protocole du Vide',
        statsTitleHeader: 'Statistiques Spirituelles',
        helpBtnText: 'Aide',
        helpModalTitle: 'Comment jouer 📖',
        helpGoalTitle: 'But du jeu',
        helpGoalText: 'Devinez le genre et le statut (vivant ou décédé) grâce aux photos.',
        helpModesTitle: 'Modes de jeu',
        helpModeOpenTitle: '👁️ Mode Ouvert',
        helpModeOpenText: 'La photo est visible immédiatement. Parcourez les photos et infos.',
        helpModeClosedTitle: '🔒 Mode Fermé',
        helpModeClosedText: 'La photo est masquée. Choisissez Genre & Statut, puis appuyez sur « Vérifier » !',
        helpButtonsTitle: 'Commandes & Boutons',
        helpBtnNextPhotoText: '🔄 <strong>Trouver une nouvelle photo</strong> — charger une autre photo de la personne.',
        helpBtnNextPersonText: '👤 <strong>Photo suivante</strong> — passer à une personne aléatoire.',
        helpBtnCheckText: '✅ <strong>Vérifier</strong> — révéler la photo et voir le résultat.',
        helpBtnGenderStatusText: '🔘 <strong>Homme / Femme / Vivant / Décédé</strong> — vos choix.',
        gotItBtn: 'Compris !',
        topControlsSettings: 'Paramètres',
        topControlsCollapse: 'Réduire'
    },
    es: {
        themeNight: '🌙 Noche',
        themeDay: '☀ Día',
        modeOpen: 'Abierto',
        modeClosed: 'Cerrado',
        nextPhoto: 'Buscar nueva foto',
        nextPerson: 'Siguiente foto',
        unknown: 'Desconocido',
        testPerson: 'Persona de prueba',
        statsSuccess: 'Exitosos',
        statsFailure: 'Fallidos',
        statsSuccessRate: 'Tasa de éxito',
        checkBtn: 'Comprobar',
        male: 'Hombre',
        female: 'Mujer',
        alive: 'Vivo',
        deceased: 'Fallecido',
        birth: 'Nacimiento',
        death: 'Muerte',
        newGame: 'Nueva partida',
        attempts: 'Intentos',
        error: 'Error',
        guessHistory: 'Historial éxito/tiempo:',
        imageDisplayAlt: 'Imagen de persona',
        errorLoadingImage: 'Error al cargar la imagen',
        playerNameLabel: 'Jugador',
        diagnosticsTitle: '📊 Diagnóstico y Registros',
        clearLogs: 'Borrar registros',
        runDiagnostics: 'Ejecutar diagnóstico',
        copyLogs: 'Copiar registros',
        appVersion: `Versión v${APP_VERSION_FALLBACK}`,
        correctGuess: 'CORRECTO',
        incorrectGuess: 'INCORRECTO',
        overlayText: 'Protocolo del Vacío',
        statsTitleHeader: 'Estadísticas Espirituales',
        helpBtnText: 'Ayuda',
        helpModalTitle: 'Cómo jugar 📖',
        helpGoalTitle: 'Objetivo del juego',
        helpGoalText: 'Adivina el género y el estado (vivo o fallecido) mediante las fotos.',
        helpModesTitle: 'Modos de juego',
        helpModeOpenTitle: '👁️ Modo Abierto',
        helpModeOpenText: 'La foto se ve de inmediato. Explora más fotos e información.',
        helpModeClosedTitle: '🔒 Modo Cerrado',
        helpModeClosedText: 'La foto está oculta. ¡Elige Género y Estado, luego pulsa "Comprobar"!',
        helpButtonsTitle: 'Botones y Controles',
        helpBtnNextPhotoText: '🔄 <strong>Buscar nueva foto</strong> — cargar otra foto de la misma persona.',
        helpBtnNextPersonText: '👤 <strong>Siguiente foto</strong> — pasar a otra persona aleatoria.',
        helpBtnCheckText: '✅ <strong>Comprobar</strong> — revelar la foto y ver el resultado.',
        helpBtnGenderStatusText: '🔘 <strong>Hombre / Mujer / Vivo / Fallecido</strong> — tus respuestas.',
        gotItBtn: '¡Entendido!',
        topControlsSettings: 'Ajustes',
        topControlsCollapse: 'Plegar'
    },
    zh: {
        themeNight: '🌙 夜间',
        themeDay: '☀ 日间',
        modeOpen: '公开',
        modeClosed: '封闭',
        nextPhoto: '寻找新照片',
        nextPerson: '下一张照片',
        unknown: '未知',
        testPerson: '测试人物',
        statsSuccess: '成功',
        statsFailure: '失败',
        statsSuccessRate: '成功率',
        checkBtn: '验证',
        male: '男性',
        female: '女性',
        alive: '健在',
        deceased: '已故',
        birth: '出生',
        death: '逝世',
        newGame: '新游戏',
        attempts: '尝试次数',
        error: '错误',
        guessHistory: '历史 成功/时间:',
        imageDisplayAlt: '人物照片',
        errorLoadingImage: '图片加载失败',
        playerNameLabel: '玩家',
        diagnosticsTitle: '📊 诊断与日志',
        clearLogs: '清除日志',
        runDiagnostics: '运行诊断',
        copyLogs: '复制日志',
        appVersion: `版本 v${APP_VERSION_FALLBACK}`,
        correctGuess: '正确',
        incorrectGuess: '错误',
        overlayText: '虚无协议',
        statsTitleHeader: '精神统计',
        helpBtnText: '帮助',
        helpModalTitle: '游戏指南 📖',
        helpGoalTitle: '游戏目标',
        helpGoalText: '根据照片与提示，猜猜人物的性别以及状态（健在或已故）。',
        helpModesTitle: '游戏模式',
        helpModeOpenTitle: '👁️ 公开模式',
        helpModeOpenText: '人物照片直接显示，可浏览更多照片和资料。',
        helpModeClosedTitle: '🔒 封闭模式',
        helpModeClosedText: '照片被遮挡。请先选择性别和状态，然后点击“验证”！',
        helpButtonsTitle: '按键与操作',
        helpBtnNextPhotoText: '🔄 <strong>寻找新照片</strong> — 加载同一人物的其他照片。',
        helpBtnNextPersonText: '👤 <strong>下一张照片</strong> — 切换到下一位随机人物。',
        helpBtnCheckText: '✅ <strong>验证</strong> — 揭开照片并查看结果。',
        helpBtnGenderStatusText: '🔘 <strong>男性 / 女性 / 健在 / 已故</strong> — 猜想选项。',
        gotItBtn: '明白了！',
        topControlsSettings: '设置',
        topControlsCollapse: '收起'
    },
    it: {
        themeNight: '🌙 Notte',
        themeDay: '☀ Giorno',
        modeOpen: 'Aperto',
        modeClosed: 'Chiuso',
        nextPhoto: 'Cerca nuova foto',
        nextPerson: 'Prossima foto',
        unknown: 'Sconosciuto',
        testPerson: 'Persona di test',
        statsSuccess: 'Riusciti',
        statsFailure: 'Falliti',
        statsSuccessRate: 'Tasso di successo',
        checkBtn: 'Verifica',
        male: 'Uomo',
        female: 'Donna',
        alive: 'Vivente',
        deceased: 'Deceduto',
        birth: 'Nascita',
        death: 'Morte',
        newGame: 'Nuova partida',
        attempts: 'Tentativi',
        error: 'Errore',
        guessHistory: 'Cronologia successo/tempo:',
        imageDisplayAlt: 'Immagine della persona',
        errorLoadingImage: 'Errore nel caricamento dell’immagine',
        playerNameLabel: 'Giocatore',
        diagnosticsTitle: '📊 Diagnostica e Log',
        clearLogs: 'Cancella log',
        runDiagnostics: 'Esegui diagnostica',
        copyLogs: 'Copia log',
        appVersion: `Versione v${APP_VERSION_FALLBACK}`,
        correctGuess: 'CORRETTO',
        incorrectGuess: 'ERRATO',
        overlayText: 'Protocollo del Vuoto',
        statsTitleHeader: 'Statistiche Spirituali',
        helpBtnText: 'Guida',
        helpModalTitle: 'Come giocare 📖',
        helpGoalTitle: 'Obiettivo del gioco',
        helpGoalText: 'Indovina il genere e lo stato (vivente o deceduto) tramite le foto.',
        helpModesTitle: 'Modalità di gioco',
        helpModeOpenTitle: '👁️ Modalità Aperta',
        helpModeOpenText: 'La foto è visibile subito. Sfoglia le foto e le informazioni.',
        helpModeClosedTitle: '🔒 Modalità Chiusa',
        helpModeClosedText: 'La foto è nascosta. Scegli Genere e Stato, poi premi "Verifica"!',
        helpButtonsTitle: 'Pulsanti e Comandi',
        helpBtnNextPhotoText: '🔄 <strong>Cerca nuova foto</strong> — carica un’altra foto della persona.',
        helpBtnNextPersonText: '👤 <strong>Prossima foto</strong> — passa a una nuova persona casuale.',
        helpBtnCheckText: '✅ <strong>Verifica</strong> — svela la foto e scopri il risultato.',
        helpBtnGenderStatusText: '🔘 <strong>Uomo / Donna / Vivente / Deceduto</strong> — le tue opzioni.',
        gotItBtn: 'Capito!',
        topControlsSettings: 'Impostazioni',
        topControlsCollapse: 'Riduci'
    },
    ru: {
        themeNight: '🌙 Ночь',
        themeDay: '☀ День',
        modeOpen: 'Открытый',
        modeClosed: 'Закрытый',
        nextPhoto: 'Найти новое фото',
        nextPerson: 'Следующее фото',
        unknown: 'Неизвестно',
        testPerson: 'Тестовый персонаж',
        statsSuccess: 'Успешные',
        statsFailure: 'Неуспешные',
        statsSuccessRate: 'Процент успешных',
        checkBtn: 'Проверить',
        male: 'Мужчина',
        female: 'Женщина',
        alive: 'Жив',
        deceased: 'Мертв',
        birth: 'Рождение',
        death: 'Смерть',
        newGame: 'Новая игра',
        attempts: 'Попытки',
        error: 'Ошибка',
        guessHistory: 'История успех/время:',
        imageDisplayAlt: 'Изображение человека',
        errorLoadingImage: 'Ошибка загрузки изображения',
        playerNameLabel: 'Игрок',
        diagnosticsTitle: '📊 Диагностика & Логи',
        clearLogs: 'Очистить логи',
        runDiagnostics: 'Запустить диагностику',
        copyLogs: 'Копировать логи',
        appVersion: `Версия v${APP_VERSION_FALLBACK}`,
        correctGuess: 'ВЕРНО',
        incorrectGuess: 'НЕВЕРНО',
        overlayText: 'Протокол Пустоты',
        statsTitleHeader: 'Духовная статистика',
        helpBtnText: 'Справка',
        helpModalTitle: 'Как играть 📖',
        helpGoalTitle: 'Цель игры',
        helpGoalText: 'Угадать пол человека и его статус (живой или умерший) по фотографиям и подсказкам.',
        helpModesTitle: 'Режимы игры',
        helpModeOpenTitle: '👁️ Открытый режим',
        helpModeOpenText: 'Фото человека видно сразу. Просматривайте доп. фото и изучайте информацию.',
        helpModeClosedTitle: '🔒 Закрытый режим',
        helpModeClosedText: 'Фото скрыто за экраном. Сначала сделайте выбор (Пол и Статус), затем нажмите «Проверить»!',
        helpButtonsTitle: 'Кнопки и управление',
        helpBtnNextPhotoText: '🔄 <strong>Найти новое фото</strong> — загрузить другое фото того же человека.',
        helpBtnNextPersonText: '👤 <strong>Следующее фото</strong> — перейти к другому случайному человеку.',
        helpBtnCheckText: '✅ <strong>Проверить</strong> — открыть фото и узнать результат (в Закрытом режиме).',
        helpBtnGenderStatusText: '🔘 <strong>Мужчина / Женщина / Жив / Мертв</strong> — варианты ответа.',
        gotItBtn: 'Понятно!',
        topControlsSettings: 'Настройки',
        topControlsCollapse: 'Свернуть'
    },
    alien: {
        themeNight: '🌙 ☌⬡☍',
        themeDay: '☀ ☍⚡☌',
        modeOpen: '👁️ ☍Ψ☌',
        modeClosed: '🔒 ☌Ω☍',
        nextPhoto: '🔄 ☌⬡ ϘϞϠ',
        nextPerson: '👤 Ͼ☍Ͽ',
        unknown: '⬡◇☌?',
        testPerson: '⚡☍◈ ϘϞ',
        statsSuccess: '⊕ ϘϞϠ',
        statsFailure: '⊗ Ͼ☍Ͽ',
        statsSuccessRate: '⚡ ⨀/⨁',
        checkBtn: '✅ ☍Ψ☌',
        male: '♂ ⬡Ψ☌',
        female: '♀ ⬡Ω☍',
        alive: '⚡ ϘϞϠ',
        deceased: '✦ Ͼ☍Ͽ',
        birth: '⨀ ☍Ψ',
        death: '⨁ ☌Ω',
        newGame: '🛸 ☌⬡☍',
        attempts: '◈ ϘϞ',
        error: '⚡ Ͼ☍Ͽ!',
        guessHistory: '☍☌◈ ✓/Δ:',
        imageDisplayAlt: '🛸 ⬡◈◇',
        errorLoadingImage: '⚡ ☌ΩϾ',
        playerNameLabel: '👽 ☍ΨϘ',
        diagnosticsTitle: '📊 ⬡☌ & ◈☍',
        clearLogs: '⚡ ☌Ω',
        runDiagnostics: '⬡ ϘϞ',
        copyLogs: '◈ Ͼ☍',
        appVersion: `👽 ☍Ψ v${APP_VERSION_FALLBACK}`,
        correctGuess: '✓ ϘϞϠ',
        incorrectGuess: '✗ Ͼ☍Ͽ',
        overlayText: '🛸 ☍ΨΩ ϘϞϠ',
        statsTitleHeader: '📊 ☍ΨΩ ☌⬡◈',
        helpBtnText: '👽 ☍Ψ☌',
        helpModalTitle: '📖 🛸 ☍ΨΩ ☌⬡',
        helpGoalTitle: '🎯 ⬡ ☍Ψ☌',
        helpGoalText: '👽 ☌⬡ ϘϞϠ ☍ΨΩ ◈◇⬡ Ͼ☍Ͽ ⚡ ⨀/⨁.',
        helpModesTitle: '⚙️ ☍ΨΩ ☌⬡◈',
        helpModeOpenTitle: '👁️ ⬡ ☍Ψ☌',
        helpModeOpenText: '🛸 ☌⬡ ϘϞϠ ☍ΨΩ ⚡ ⨀/⨁ ◈◇⬡.',
        helpModeClosedTitle: '🔒 ☌Ω☍ ☍ΨΩ',
        helpModeClosedText: '🛸 Ͼ☍Ͽ ☌⬡! ⬡Ψ☌ / ⬡Ω☍ ⚡ «☍Ψ☌»!',
        helpButtonsTitle: '🕹️ ☍ΨΩ 🕹️',
        helpBtnNextPhotoText: '🔄 <strong>☌⬡ ϘϞϠ</strong> — ⚡ ◈◇⬡ 🛸 ☍ΨΩ.',
        helpBtnNextPersonText: '👤 <strong>Ͼ☍Ͽ</strong> — 👽 ☌⬡ ⨀/⨁.',
        helpBtnCheckText: '✅ <strong>☍Ψ☌</strong> — 🛸 ϘϞϠ ⚡ ☌Ω☍.',
        helpBtnGenderStatusText: '🔘 <strong>♂/♀ ⚡ ⨀/⨁</strong> — ⬡ ☍Ψ☌.',
        gotItBtn: '👽 ☍Ψ☌!',
        topControlsSettings: '☍Ψ☌ ⚙️',
        topControlsCollapse: '▲ ☍Ψ☌'
    }
};

// Инициализация настроек
let isNight = localStorage.getItem('theme') !== 'day';
let selectedLanguage = localStorage.getItem('language') || 'uk'; // Default to Ukrainian
if (!translations[selectedLanguage]) {
    selectedLanguage = 'uk';
}
let gameMode = localStorage.getItem('mode') || 'open';
if (gameMode !== 'open' && gameMode !== 'closed') {
    gameMode = 'open';
}

let isTopControlsCollapsed = false;
let userManuallyToggledControls = false;

function setTopControlsCollapsed(collapsed, isManual = false) {
    isTopControlsCollapsed = !!collapsed;
    if (isManual) {
        userManuallyToggledControls = true;
        localStorage.setItem('top_controls_collapsed', isTopControlsCollapsed ? 'true' : 'false');
    }
    
    const wrapper = document.getElementById('top-controls-wrapper');
    const toggleBtn = document.getElementById('toggle-top-controls');
    const toggleText = document.getElementById('toggle-top-controls-text');
    const toggleArrow = document.getElementById('toggle-top-controls-arrow');
    const texts = translations[selectedLanguage] || translations.uk;

    if (wrapper) {
        if (isTopControlsCollapsed) {
            wrapper.classList.add('collapsed');
            wrapper.classList.remove('expanded');
            // Close any open custom-select options dropdowns
            document.querySelectorAll('.custom-select .options').forEach(opt => opt.style.display = 'none');
        } else {
            wrapper.classList.remove('collapsed');
            wrapper.classList.add('expanded');
        }
    }

    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', isTopControlsCollapsed ? 'false' : 'true');
    }
    if (toggleText) {
        toggleText.textContent = isTopControlsCollapsed ? (texts.topControlsSettings || 'Налаштування') : (texts.topControlsCollapse || 'Згорнути');
    }
    if (toggleArrow) {
        if (isTopControlsCollapsed) {
            toggleArrow.textContent = 'expand_more';
            toggleArrow.classList.add('collapsed');
        } else {
            toggleArrow.textContent = 'expand_less';
            toggleArrow.classList.remove('collapsed');
        }
    }
    console.log(`[TOP_CONTROLS] Collapsed state: ${isTopControlsCollapsed} (manual: ${isManual})`);
}

function autoCollapseControlsOnGameplay() {
    if (!isTopControlsCollapsed && !userManuallyToggledControls) {
        console.log('[AUTO_COLLAPSE] Auto-collapsing top controls as gameplay is active.');
        setTopControlsCollapsed(true, false);
    }
}

// Google Sheets Webhook Integration & Anti-Spam Tracking
let consecutiveEmptyNewGames = 0;

// Auto-detect Webhook URL from URL query parameters (e.g. ?sheets=https://... or ?webhook=https://...)
try {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        const paramUrl = urlParams.get('sheets') || urlParams.get('webhook') || urlParams.get('sheet_url');
        if (paramUrl && paramUrl.startsWith('https://script.google.com/')) {
            localStorage.setItem('google_sheets_webhook_url', paramUrl);
            googleSheetsWebhookUrl = paramUrl;
            console.log('[SHEETS_INIT] Webhook URL auto-configured from URL parameter.');
        }
    }
} catch (e) {}

// Async check for Telegram CloudStorage fallback (if supported)
if (isCloudStorageSupported() && !googleSheetsWebhookUrl) {
    try {
        window.Telegram.WebApp.CloudStorage.getItem('google_sheets_webhook_url', (err, val) => {
            if (!err && val && !googleSheetsWebhookUrl) {
                googleSheetsWebhookUrl = val;
                localStorage.setItem('google_sheets_webhook_url', val);
                console.log('[SHEETS_TG_CLOUD] Loaded webhook URL from Telegram CloudStorage.');
            }
        });
    } catch (e) {}
}

// Lightweight deterministic string hashing for GDPR & user privacy (pseudonymization)
function anonymizeUserId(rawId) {
    if (!rawId) return 'anon_guest';
    const str = 'ipersonsee_salt_' + String(rawId);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    const hex = (h >>> 0).toString(16).padStart(8, '0');
    return `usr_${hex}`;
}

function anonymizePlayerName(rawName, anonId) {
    if (!rawName) return `Player_${anonId.slice(4)}`;
    const trimmed = String(rawName).trim();
    if (!trimmed) return `Player_${anonId.slice(4)}`;
    const firstChar = Array.from(trimmed)[0] || 'P';
    return `${firstChar}*** (${anonId.slice(4, 10)})`;
}

function simplifyUserAgent(ua) {
    if (!ua) return 'unknown';
    if (ua.includes('iPhone')) return 'iPhone (iOS)';
    if (ua.includes('iPad')) return 'iPad (iPadOS)';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('Ubuntu')) return 'Ubuntu Linux';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Macintosh')) return 'macOS';
    return 'Other';
}

function detectClientPlatform() {
    const tgPlatform = window.Telegram?.WebApp?.platform;
    // Telegram SDK returns string "unknown" when running in standard desktop/mobile web browsers
    if (tgPlatform && tgPlatform !== 'unknown') {
        return tgPlatform;
    }
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'chrome_android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'safari_ios';
    if (/Windows/i.test(ua)) {
        if (/Edg\//i.test(ua)) return 'edge_windows';
        if (/Chrome|CriOS/i.test(ua)) return 'chrome_windows';
        if (/Firefox/i.test(ua)) return 'firefox_windows';
        return 'windows';
    }
    if (/Macintosh|Mac OS X/i.test(ua)) {
        if (/Chrome|CriOS/i.test(ua)) return 'chrome_mac';
        if (/Safari/i.test(ua)) return 'safari_mac';
        if (/Firefox/i.test(ua)) return 'firefox_mac';
        return 'macos';
    }
    if (/Linux/i.test(ua)) {
        if (/Chrome|CriOS/i.test(ua)) return 'chrome_linux';
        if (/Firefox/i.test(ua)) return 'firefox_linux';
        return 'linux';
    }
    return 'web_browser';
}

function sendToGoogleSheet(eventName, eventParams = {}) {
    const webhookUrl = getActiveSheetsWebhookUrl();
    if (!webhookUrl) {
        if (!window._sheetsWarningLogged) {
            console.warn(`[SHEETS_SKIPPED] Event "${eventName}" not sent to Google Sheets: Webhook URL is empty or not configured. (Use ?sheets=URL parameter, GitHub Secrets, or Settings panel).`);
            window._sheetsWarningLogged = true;
        }
        return;
    }

    // In 'summary' mode (1 game = 1 row), send ONLY end-of-game summary, unfinished reports, or manual test
    if (sheetsLoggingMode === 'summary') {
        const isSummaryEvent = (eventName === 'game_over' || eventName === 'game_unfinished_report' || eventName === 'test_connection');
        if (!isSummaryEvent) {
            console.log(`[SHEETS_SUMMARY_FILTER] Bypassed micro-event "${eventName}" in 1-Game=1-Row summary mode.`);
            return;
        }
    }

    // Anti-spam detection: If user clicks 'New Game' 10+ times without making any guesses
    let isSpam = false;
    let spamReason = '';
    if (eventName === 'new_game_started') {
        if (consecutiveEmptyNewGames >= 10) {
            isSpam = true;
            spamReason = `flood_empty_restarts_${consecutiveEmptyNewGames}_times`;
            console.warn(`[ANTI_SPAM] Flagged suspicious empty restart flood (${consecutiveEmptyNewGames} consecutive resets without gameplay).`);
        }
    }

    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const clientPlatform = detectClientPlatform();
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || '';
    
    // Privacy protection: pseudonymize user identifiers before sending over the wire
    const anonId = anonymizeUserId(telegramUserId);
    const anonName = anonymizePlayerName(telegramUserName, anonId);
    const osType = simplifyUserAgent(navigator.userAgent || '');

    // Rich Session Summary Data (matches Screenshot 2)
    const historyString = formatGuessHistoryString() || (eventParams.attempts_history_string || '');
    const sessionDurationSec = gameSessionStartTime ? Math.round((Date.now() - gameSessionStartTime) / 1000) : (eventParams.duration_seconds || 0);
    const durationFormatted = formatDurationSeconds(sessionDurationSec);
    const totalActiveTime = (attemptDurations && attemptDurations.length > 0)
        ? attemptDurations.reduce((sum, d) => sum + (Number(d) || 0), 0)
        : (eventParams.active_time_seconds || 0);
    const personsList = (sessionGuessedPersons && sessionGuessedPersons.length > 0)
        ? sessionGuessedPersons.join(', ')
        : (eventParams.person_name || currentPerson?.personLabel?.value || '');

    const attemptsCountDisplay = currentAttempts > 0 
        ? `${currentAttempts}/${maxAttempts}` 
        : (eventParams.attempt_number || `${maxAttempts}/${maxAttempts}`);

    const payload = {
        token: GOOGLE_SHEETS_SECURITY_TOKEN,
        timestamp_iso: now.toISOString(),
        local_time_string: now.toLocaleString(),
        timezone: timeZone,
        timezone_offset: now.getTimezoneOffset(),
        platform: clientPlatform,
        device_lang: navigator.language || '',
        telegram_lang: tgLang,
        screen_res: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        user_agent: osType,
        
        event_name: eventName,
        status: (eventName === 'game_over' || eventName === 'test_connection') ? 'game_completed' : (eventName === 'game_unfinished_report' ? 'unfinished' : eventName),
        telegram_user_id: anonId,
        telegram_user_name: anonName,
        session_id: currentSessionId || eventParams.session_id || '',
        
        person_name: personsList,
        person_id: eventParams.person_id || (currentPerson?.person?.value ? currentPerson.person.value.split('/').pop() : ''),
        
        guess_gender: eventParams.guessed_gender || userGenderGuess || '',
        actual_gender: eventParams.actual_gender || '',
        guess_status: eventParams.guessed_status || userStatusGuess || '',
        actual_status: eventParams.actual_status || '',
        
        is_correct: eventParams.is_overall_correct !== undefined ? eventParams.is_overall_correct : (eventParams.attempt_result !== undefined ? eventParams.attempt_result : ''),
        duration_seconds: sessionDurationSec,
        duration_formatted: durationFormatted,
        session_duration: durationFormatted,
        active_time_seconds: totalActiveTime,
        attempt_number: attemptsCountDisplay,
        attempts_display: attemptsCountDisplay,
        
        successful_guesses: successfulGuesses !== undefined ? successfulGuesses : (eventParams.successful_guesses || 0),
        failed_guesses: failedGuesses !== undefined ? failedGuesses : (eventParams.failed_guesses || 0),
        success_rate: eventParams.success_rate || `${totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0}%`,
        language: selectedLanguage,
        player_language: selectedLanguage,
        game_mode: gameMode,
        current_theme: isNight ? 'night' : 'day',
        
        // Exact formatting matching Screenshot 2:
        attempts_history: historyString,
        attempts_history_string: historyString,
        history: historyString,
        start_time_local: currentSessionLocalStartTime || playerLocalStartTimeString || now.toLocaleString(),
        find_new_clicks: sessionFindNewClicks,
        logging_mode: sheetsLoggingMode,
        
        is_spam: isSpam,
        spam_reason: spamReason,
        consecutive_empty_restarts: consecutiveEmptyNewGames
    };

    try {
        fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            keepalive: true,
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        }).then(() => {
            console.log(`[SHEETS_SENT] Dispatched anonymized event "${eventName}" to Google Sheets (Spam: ${isSpam})`);
        }).catch((err) => {
            console.warn(`[SHEETS_WARN] Failed to dispatch event "${eventName}" to Google Sheets:`, err);
        });
    } catch (e) {
        console.warn(`[SHEETS_ERROR] Exception in sendToGoogleSheet:`, e);
    }
}

// Google Analytics 4 Event Sender
function sendGAEvent(eventName, eventParams = {}) {
    // Parallel dispatch to Google Sheets webhook
    sendToGoogleSheet(eventName, eventParams);

    if (typeof gtag === 'function') {
        const paramsToSend = { ...eventParams }; // Create a copy
        paramsToSend.debug_mode = true;
        
        // Use pseudonymized user identifier for privacy & GA4 policy compliance
        const anonId = anonymizeUserId(telegramUserId);
        if (anonId) {
            paramsToSend.telegram_user_id = anonId;
        }
        if (currentSessionId) {
            if (!paramsToSend.ga_session_id) {
                paramsToSend.ga_session_id = currentSessionId;
            }
            if (!paramsToSend.session_id) {
                paramsToSend.session_id = currentSessionId;
            }
        }
        if (selectedLanguage) {
            if (!paramsToSend.language) {
                paramsToSend.language = selectedLanguage;
            }
            if (!paramsToSend.new_language) {
                paramsToSend.new_language = selectedLanguage;
            }
        }
        if (!paramsToSend.current_theme) {
            paramsToSend.current_theme = isNight ? 'night' : 'day';
        }
        gtag('event', eventName, paramsToSend);
        console.log(`[GA_EVENT_SENT] Name: ${eventName}, Params:`, JSON.parse(JSON.stringify(paramsToSend)));
    } else {
        console.warn(`[GA_EVENT_FAIL] gtag is not defined. Event not sent: ${eventName}`, eventParams);
    }
}


if (document.body) {
    document.body.classList.toggle('day', !isNight);
}
const languageSelectBtn = document.querySelector('#language-select .selected-option');
if (languageSelectBtn) {
    languageSelectBtn.textContent = languageLabels[selectedLanguage] || 'Українська';
}
const modeToggleBtnInit = document.getElementById('mode-toggle');
if (modeToggleBtnInit) {
    modeToggleBtnInit.textContent = translations[selectedLanguage][`mode${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`];
}
const initialControlsCollapsed = localStorage.getItem('top_controls_collapsed') === 'true';
setTopControlsCollapsed(initialControlsCollapsed, false);

// Логирование инициализации
console.log('[APP_INIT] Initializing application...');
console.log('[APP_INIT] Current theme:', isNight ? 'night' : 'day');
const rgbCount = Object.keys(rgbHslCache || {}).length;
console.log(`[APP_INIT] RGB HSL Cache from localStorage: (${rgbCount} entries)`);
const wikidataCounts = Object.keys(wikidataCache || {}).map(k => `${k}: ${Array.isArray(wikidataCache[k]) ? wikidataCache[k].length : 0}`).join(', ');
console.log(`[APP_INIT] Wikidata Cache summary: { ${wikidataCounts} }`);
console.log('[APP_INIT] Attempts from localStorage:', currentAttempts);
console.log('[APP_INIT] Total Guesses from localStorage:', totalGuesses);
console.log('[APP_INIT] Current Session ID from localStorage:', currentSessionId);
console.log('[APP_INIT] Current Attempt Start Time from localStorage:', currentAttemptStartTime);
console.log('[APP_INIT] Guess Results History from localStorage:', guessResultsHistory);
console.log('[APP_INIT] Attempt Durations from localStorage:', attemptDurations);


// Function to update the New Game button's position
function updateNewGameButtonPosition(isInitialCall = false) {
    console.log('[UI_UPDATE] updateNewGameButtonPosition called. Attempts:', currentAttempts, 'Max:', maxAttempts, 'IsInitialCall:', isInitialCall);
    if (!newGameBtn || !initialNewGameContainer || !gameOverNewGameContainer) {
        console.error("[UI_ERROR] Critical: New Game button or its containers not found for positioning.");
        return;
    }

    // Clear any existing timeout for the "New Game" button visibility
    if (newGameButtonTimeoutId) {
        clearTimeout(newGameButtonTimeoutId);
        newGameButtonTimeoutId = null;
        console.log('[UI_TIMEOUT_CANCELLED] Existing New Game button visibility timeout cancelled.');
    }

    if (currentAttempts >= maxAttempts) {
        if (isInitialCall) {
            console.log('[UI_UPDATE] Game is over on initial load. Moving New Game button to game over location immediately.');
            if (newGameBtn.parentElement !== gameOverNewGameContainer) {
                gameOverNewGameContainer.appendChild(newGameBtn);
            }
            gameOverNewGameContainer.style.display = 'flex';
            initialNewGameContainer.style.display = 'none';
        } else {
            console.log('[UI_UPDATE] Game is over, scheduling New Game button move to game over location in 5s.');
            // Ensure the game over container is hidden initially while the timer runs
            gameOverNewGameContainer.style.display = 'none';
            // If the button is currently in the initial container, hide that container too,
            // so the button doesn't remain visible at the bottom during the delay.
            if (newGameBtn.parentElement === initialNewGameContainer) {
                initialNewGameContainer.style.display = 'none';
            }

            newGameButtonTimeoutId = setTimeout(() => {
                // Re-check the condition in case a new game started very quickly
                if (currentAttempts >= maxAttempts) {
                    console.log('[UI_UPDATE_DELAYED] 5s timeout elapsed. Moving New Game button to game over location.');
                    if (newGameBtn.parentElement !== gameOverNewGameContainer) {
                        gameOverNewGameContainer.appendChild(newGameBtn);
                    }
                    gameOverNewGameContainer.style.display = 'flex';
                    initialNewGameContainer.style.display = 'none'; // Ensure initial container remains hidden
                } else {
                    console.log('[UI_UPDATE_DELAYED] 5s timeout elapsed, but game is no longer over. Button position likely handled by standard logic.');
                }
                newGameButtonTimeoutId = null;
            }, 5000); // 5-second delay
        }
    } else {
        console.log('[UI_UPDATE] Game is active, moving New Game button to initial location.');
        if (newGameBtn.parentElement !== initialNewGameContainer) {
            initialNewGameContainer.appendChild(newGameBtn);
        }
        initialNewGameContainer.style.display = 'flex';
        gameOverNewGameContainer.style.display = 'none';
    }
}

function updateGuessHistoryDisplay() {
    const historyContainer = document.getElementById('stats-guess-history');
    if (!historyContainer) {
        console.warn('[UI_WARN] Guess history container not found.');
        return;
    }

    historyContainer.innerHTML = '';

    if (guessResultsHistory.length === 0) {
        const emptyLabels = {
            uk: 'Немає історії спроб',
            ru: 'Нет истории попыток',
            en: 'No attempts history',
            de: 'Keine Versuchshistorie',
            fr: 'Aucun historique d’essais',
            es: 'Sin historial de intentos',
            zh: '无尝试历史',
            it: 'Nessuna cronologia tentativi',
            alien: '⊸⍟⊸ ⊸⍟⊸ ⊸⍟⊸'
        };
        let emptyLabel = emptyLabels[selectedLanguage] || emptyLabels.en;
        historyContainer.innerHTML = `<span class="font-mono text-xs text-on-surface-variant/40 tracking-wider">${emptyLabel}</span>`;
        return;
    }

    let durationSuffix = 's'; 
    if (selectedLanguage === 'uk' || selectedLanguage === 'ru') {
        durationSuffix = 'с';
    } else if (selectedLanguage === 'alien') {
        durationSuffix = '⍊';
    } else if (selectedLanguage === 'zh') {
        durationSuffix = '秒';
    }

    guessResultsHistory.forEach((result, index) => {
        const duration = attemptDurations[index] !== undefined ? attemptDurations[index] : 0;
        const column = document.createElement('div');
        column.className = 'flex flex-col items-center justify-center space-y-1';

        let circleClass = '';
        let svgIcon = '';

        if (result === 1) {
            circleClass = 'w-7 h-7 rounded-full flex items-center justify-center bg-neon-cyan text-void-black shadow-[0_0_10px_rgba(0,240,255,0.4)] transition-all';
            svgIcon = `
                <svg class="w-4 h-4 stroke-current stroke-2" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
            `;
        } else {
            circleClass = 'w-7 h-7 rounded-full flex items-center justify-center bg-spirit-violet text-white shadow-[0_0_10px_rgba(188,19,254,0.4)] transition-all';
            svgIcon = `
                <svg class="w-3.5 h-3.5 stroke-current stroke-[2.5]" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            `;
        }

        column.innerHTML = `
            <div class="${circleClass}">
                ${svgIcon}
            </div>
            <span class="font-mono text-[9px] text-on-surface-variant/80 tracking-tight">${duration}${durationSuffix}</span>
        `;
        historyContainer.appendChild(column);
    });
}


function updateTelegramUserInfoDisplay() {
    const playerInfoElement = document.getElementById('stats-player-info');
    if (!playerInfoElement) {
        console.warn('[UI_WARN] Stats player info display element (stats-player-info) not found.');
        return;
    }
    const texts = translations[selectedLanguage];
    const label = texts.playerNameLabel || 'Player';

    if (telegramUserName) {
        playerInfoElement.textContent = `${label}: ${telegramUserName}`;
        console.log(`[UI_UPDATE] Telegram user info in stats displayed: ${telegramUserName}`);
    } else {
        playerInfoElement.textContent = label;
        console.log('[UI_UPDATE] Telegram user info in stats displayed as generic "Player" as no name is available.');
    }
}


// === DATA SOURCE HEALTH & INDICATOR STATE ===
let currentDataSourceStatus = 'healthy'; // 'healthy' (green) | 'fallback' (closer to red) | 'error' (red)
let currentDataSourceDetails = 'Wikidata Live';

function updateDataSourceIndicator(status, details = '') {
    if (status) currentDataSourceStatus = status;
    if (details) currentDataSourceDetails = details;

    const versionBadge = document.getElementById('app-version-badge');
    const diagSourceLabel = document.getElementById('data-source-label');
    const diagSourceBadge = document.getElementById('data-source-status-badge');
    const diagSourceText = document.getElementById('data-source-status-text');

    const versionPrefixes = {
        uk: 'Версія v',
        ru: 'Версия v',
        en: 'Version v',
        de: 'Version v',
        fr: 'Version v',
        es: 'Versión v',
        zh: '版本 v',
        it: 'Versione v',
        alien: '⊸⍟⊸ v'
    };
    const prefix = versionPrefixes[selectedLanguage] || 'Version v';
    const verText = `${prefix}${CURRENT_APP_VERSION}`;

    const isHealthy = currentDataSourceStatus === 'healthy' || currentDataSourceStatus === 'live' || currentDataSourceStatus === 'cache';

    const healthyLabel = selectedLanguage === 'ru'
        ? (currentDataSourceStatus === 'cache' ? 'Wikidata (Кэш) ✅' : 'Wikidata (Онлайн) ✅')
        : (selectedLanguage === 'uk'
            ? (currentDataSourceStatus === 'cache' ? 'Wikidata (Кеш) ✅' : 'Wikidata (Онлайн) ✅')
            : (currentDataSourceStatus === 'cache' ? 'Wikidata (Cache) ✅' : 'Wikidata (Live) ✅'));

    const fallbackLabel = selectedLanguage === 'ru'
        ? 'Резервный каталог (сбой Wikidata) ⚠️'
        : (selectedLanguage === 'uk'
            ? 'Резервний каталог (збій Wikidata) ⚠️'
            : 'Offline Backup (Wikidata offline) ⚠️');

    const activeLabel = isHealthy ? healthyLabel : fallbackLabel;

    if (versionBadge) {
        if (isHealthy) {
            // Зелёный цвет надписи версии, когда всё как надо
            versionBadge.className = 'font-mono text-[9px] tracking-[0.25em] uppercase cursor-pointer select-none transition-all duration-300 mt-8 mb-12 flex items-center justify-center gap-1.5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.35)] hover:text-emerald-300';
            versionBadge.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse"></span><span>${verText}</span>`;
            versionBadge.title = selectedLanguage === 'ru' 
                ? `Источник данных: ${activeLabel} (всё как надо)` 
                : (selectedLanguage === 'uk' ? `Джерело даних: ${activeLabel} (все гаразд)` : `Data source: ${activeLabel} (healthy)`);
        } else {
            // Цвет ближе к красному, если что-то не так с данными
            versionBadge.className = 'font-mono text-[9px] tracking-[0.25em] uppercase cursor-pointer select-none transition-all duration-300 mt-8 mb-12 flex items-center justify-center gap-1.5 text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.45)] hover:text-rose-400';
            versionBadge.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]"></span><span>${verText}</span>`;
            versionBadge.title = selectedLanguage === 'ru' 
                ? `Внимание: ${activeLabel} (проблема с живыми данными)` 
                : (selectedLanguage === 'uk' ? `Увага: ${activeLabel} (проблема з живими даними)` : `Warning: ${activeLabel} (issue with live data)`);
        }
    }

    if (diagSourceLabel) {
        diagSourceLabel.textContent = selectedLanguage === 'ru' ? 'Источник данных:' : (selectedLanguage === 'uk' ? 'Джерело даних:' : 'Data Source:');
    }
    if (diagSourceBadge && diagSourceText) {
        if (isHealthy) {
            diagSourceBadge.className = 'font-bold flex items-center gap-1.5 text-emerald-400';
            if (diagSourceBadge.firstElementChild) {
                diagSourceBadge.firstElementChild.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]';
            }
            diagSourceText.textContent = activeLabel;
        } else {
            diagSourceBadge.className = 'font-bold flex items-center gap-1.5 text-rose-500';
            if (diagSourceBadge.firstElementChild) {
                diagSourceBadge.firstElementChild.className = 'w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]';
            }
            diagSourceText.textContent = activeLabel;
        }
    }
}

// Обновление интерфейса по языку
function updateLanguage() {
    console.log(`[LANGUAGE_UPDATE] Updating language to: ${selectedLanguage}`);
    const texts = translations[selectedLanguage];
    document.getElementById('theme-toggle').textContent = isNight ? texts.themeNight : texts.themeDay;
    document.getElementById('next-photo-text').textContent = texts.nextPhoto;
    document.getElementById('next-person').textContent = texts.nextPerson;
    document.getElementById('check-btn').textContent = texts.checkBtn;
    if (newGameBtn) newGameBtn.textContent = texts.newGame;
    document.getElementById('stats-attempts-label').textContent = texts.attempts;
    document.getElementById('stats-success-label').textContent = texts.statsSuccess;
    document.getElementById('stats-failure-label').textContent = texts.statsFailure;
    document.getElementById('stats-success-rate-label').textContent = texts.statsSuccessRate;
    document.getElementById('stats-guess-history-label').textContent = texts.guessHistory; 
    document.getElementById('male-btn').textContent = texts.male;
    document.getElementById('female-btn').textContent = texts.female;
    document.getElementById('alive-btn').textContent = texts.alive;
    document.getElementById('dead-btn').textContent = texts.deceased;
    
    const overlayText = document.getElementById('overlay-text');
    if (overlayText) overlayText.textContent = texts.overlayText || 'Void Protocol';
    const statsTitleHeader = document.getElementById('stats-title-header');
    if (statsTitleHeader) statsTitleHeader.textContent = texts.statsTitleHeader || 'Spiritual Stats';

    const documentTitles = {
        uk: 'Гра: Випадкова людина з Wikidata',
        ru: 'Игра: Случайный человек из Wikidata',
        en: 'Game: Random Person from Wikidata',
        de: 'Spiel: Zufällige Person aus Wikidata',
        fr: 'Jeu : Personne aléatoire de Wikidata',
        es: 'Juego: Persona aleatoria de Wikidata',
        zh: '游戏：来自维基数据的随机人物',
        it: 'Gioco: Persona casuale da Wikidata',
        alien: '⊸⍟⊸: Wikidata'
    };
    document.title = documentTitles[selectedLanguage] || documentTitles.en;

    // Translate diagnostics elements safely
    const diagSummary = document.getElementById('diag-summary-label');
    if (diagSummary) diagSummary.textContent = texts.diagnosticsTitle || '📊 Diagnostics & Logs';
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    if (clearLogsBtn) clearLogsBtn.textContent = texts.clearLogs || 'Очистити логи';
    const runDiagnosticsBtn = document.getElementById('run-diag-btn');
    if (runDiagnosticsBtn) runDiagnosticsBtn.textContent = texts.runDiagnostics || 'Запустити діагностику';
    const copyLogsBtn = document.getElementById('copy-logs-btn');
    if (copyLogsBtn) copyLogsBtn.textContent = texts.copyLogs || 'Копіювати логи';

    const forceReloadTexts = {
        uk: 'Оновити кеш 🔄',
        ru: 'Обновить кэш 🔄',
        en: 'Force Reload 🔄',
        de: 'Cache aktualisieren 🔄',
        fr: 'Forcer la recharge 🔄',
        es: 'Forzar recarga 🔄',
        zh: '强制刷新 🔄',
        it: 'Ricarica forzata 🔄',
        alien: '⊸⍟⊸ 🔄'
    };
    const forceReloadBtn = document.getElementById('force-reload-btn');
    if (forceReloadBtn) forceReloadBtn.textContent = forceReloadTexts[selectedLanguage] || forceReloadTexts.en;

    const sheetsModeLabel = document.getElementById('sheets-mode-label');
    if (sheetsModeLabel) {
        sheetsModeLabel.textContent = selectedLanguage === 'ru' 
            ? 'Режим таблицы:' 
            : (selectedLanguage === 'uk' ? 'Режим таблиці:' : 'Sheets Mode:');
    }
    const sheetsModeSummaryBtn = document.getElementById('sheets-mode-summary-btn');
    if (sheetsModeSummaryBtn) {
        sheetsModeSummaryBtn.textContent = selectedLanguage === 'ru' 
            ? '📊 1 игра = 1 строка' 
            : (selectedLanguage === 'uk' ? '📊 1 гра = 1 рядок' : '📊 1 Game = 1 Row');
    }
    const sheetsModeDetailedBtn = document.getElementById('sheets-mode-detailed-btn');
    if (sheetsModeDetailedBtn) {
        sheetsModeDetailedBtn.textContent = selectedLanguage === 'ru' 
            ? '⚙️ Все события' 
            : (selectedLanguage === 'uk' ? '⚙️ Усі події' : '⚙️ All Events');
    }

    // Update dynamic version badge color and data source indicator (Green when OK, Reddish when fallback/error)
    updateDataSourceIndicator();

    // Help button and Help Modal translation updates
    const helpBtnTextEl = document.getElementById('help-btn-text');
    if (helpBtnTextEl) helpBtnTextEl.textContent = texts.helpBtnText || 'Довідка';
    const helpModalTitleEl = document.getElementById('help-modal-title');
    if (helpModalTitleEl) helpModalTitleEl.textContent = texts.helpModalTitle || 'Як грати 📖';
    const helpGoalTitleEl = document.getElementById('help-goal-title');
    if (helpGoalTitleEl) helpGoalTitleEl.innerHTML = `<span class="material-symbols-outlined text-sm">target</span> ${texts.helpGoalTitle || 'Мета гри'}`;
    const helpGoalTextEl = document.getElementById('help-goal-text');
    if (helpGoalTextEl) helpGoalTextEl.textContent = texts.helpGoalText || '';
    const helpModesTitleEl = document.getElementById('help-modes-title');
    if (helpModesTitleEl) helpModesTitleEl.innerHTML = `<span class="material-symbols-outlined text-sm">tune</span> ${texts.helpModesTitle || 'Режими гри'}`;
    const helpModeOpenTitleEl = document.getElementById('help-mode-open-title');
    if (helpModeOpenTitleEl) helpModeOpenTitleEl.textContent = texts.helpModeOpenTitle || '👁️ Відкритий режим';
    const helpModeOpenTextEl = document.getElementById('help-mode-open-text');
    if (helpModeOpenTextEl) helpModeOpenTextEl.textContent = texts.helpModeOpenText || '';
    const helpModeClosedTitleEl = document.getElementById('help-mode-closed-title');
    if (helpModeClosedTitleEl) helpModeClosedTitleEl.textContent = texts.helpModeClosedTitle || '🔒 Закритий режим';
    const helpModeClosedTextEl = document.getElementById('help-mode-closed-text');
    if (helpModeClosedTextEl) helpModeClosedTextEl.textContent = texts.helpModeClosedText || '';
    const helpButtonsTitleEl = document.getElementById('help-buttons-title');
    if (helpButtonsTitleEl) helpButtonsTitleEl.innerHTML = `<span class="material-symbols-outlined text-sm">touch_app</span> ${texts.helpButtonsTitle || 'Кнопки та керування'}`;
    const helpBtnNextPhotoEl = document.getElementById('help-btn-next-photo');
    if (helpBtnNextPhotoEl) helpBtnNextPhotoEl.innerHTML = texts.helpBtnNextPhotoText || '';
    const helpBtnNextPersonEl = document.getElementById('help-btn-next-person');
    if (helpBtnNextPersonEl) helpBtnNextPersonEl.innerHTML = texts.helpBtnNextPersonText || '';
    const helpBtnCheckEl = document.getElementById('help-btn-check');
    if (helpBtnCheckEl) helpBtnCheckEl.innerHTML = texts.helpBtnCheckText || '';
    const helpBtnGenderStatusEl = document.getElementById('help-btn-gender-status');
    if (helpBtnGenderStatusEl) helpBtnGenderStatusEl.innerHTML = texts.helpBtnGenderStatusText || '';
    const gotItHelpBtnEl = document.getElementById('got-it-help-btn');
    if (gotItHelpBtnEl) gotItHelpBtnEl.textContent = texts.gotItBtn || 'Зрозуміло!';

    const toggleTopControlsText = document.getElementById('toggle-top-controls-text');
    if (toggleTopControlsText) {
        toggleTopControlsText.textContent = isTopControlsCollapsed ? (texts.topControlsSettings || 'Налаштування') : (texts.topControlsCollapse || 'Згорнути');
    }

    updateUI(currentPerson); 
    updateTelegramUserInfoDisplay(); 

    updateModeSelect();
    updateLanguageSelect();
    updateGuessHistoryDisplay(); 
    console.log('[LANGUAGE_UPDATE] Language update complete.');
}

// Обновление текста режима
function updateModeSelect() {
    const modeToggle = document.getElementById('mode-toggle');
    if (modeToggle) {
        modeToggle.textContent = translations[selectedLanguage][`mode${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`];
    }
}

// Обновление текста языка
function updateLanguageSelect() {
    const languageSelectOptions = document.querySelector('#language-select .options');
    if (languageSelectOptions) {
        languageSelectOptions.innerHTML = Object.keys(languageLabels).map(lang => 
            `<li data-value="${lang}" class="px-4 py-2 hover:bg-neon-cyan/20 cursor-pointer text-xs font-headline text-on-surface text-center">${languageLabels[lang]}</li>`
        ).join('');
    }
    const selectedOptionEl = document.querySelector('#language-select .selected-option');
    if (selectedOptionEl) {
        selectedOptionEl.textContent = languageLabels[selectedLanguage] || 'Українська';
    }
}

// Кастомные выпадающие списки (только для языков)
document.querySelectorAll('.custom-select').forEach(select => {
    const selectedOption = select.querySelector('.selected-option');
    const options = select.querySelector('.options');

    if (selectedOption && options) {
        selectedOption.addEventListener('click', () => {
            const wasOpen = options.style.display !== 'none';
            options.style.display = wasOpen ? 'none' : 'block';
            console.log(`[UI_EVENT] Custom select '${select.id}' ${wasOpen ? 'closed' : 'opened'}.`);
        });

        options.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI') {
                const value = e.target.getAttribute('data-value');
                console.log(`[UI_EVENT] Option selected in '${select.id}': Value = ${value}, Text = ${e.target.textContent}`);
                if (select.id === 'language-select') {
                    const oldLanguage = selectedLanguage;
                    selectedLanguage = value;
                    localStorage.setItem('language', selectedLanguage);
                    console.log(`[STATE_CHANGE] Language changed from ${oldLanguage} to ${selectedLanguage}. Saved to localStorage.`);
                    if (oldLanguage !== selectedLanguage) {
                        sendGAEvent('language_changed', { new_language: selectedLanguage }); // Changed from new_lang
                    }
                    updateLanguage();
                }
                selectedOption.textContent = e.target.textContent;
                options.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!select.contains(e.target) && options.style.display !== 'none') {
                options.style.display = 'none';
            }
        });
    }
});

// Кнопка сворачивания/разворачивания верхних кнопок управления
const toggleTopControlsBtn = document.getElementById('toggle-top-controls');
if (toggleTopControlsBtn) {
    toggleTopControlsBtn.addEventListener('click', () => {
        setTopControlsCollapsed(!isTopControlsCollapsed, true);
        sendGAEvent('top_controls_toggled', { collapsed: isTopControlsCollapsed });
    });
}

// Кнопка прямого переключения режима игры
const modeToggleBtn = document.getElementById('mode-toggle');
if (modeToggleBtn) {
    modeToggleBtn.addEventListener('click', () => {
        const oldMode = gameMode;
        gameMode = gameMode === 'open' ? 'closed' : 'open';
        localStorage.setItem('mode', gameMode);
        console.log(`[STATE_CHANGE] Game mode toggled from ${oldMode} to ${gameMode}. Saved to localStorage.`);
        sendGAEvent('game_mode_changed', { new_game_mode: gameMode });
        updateModeVisibility();
        updateCheckButtonState();
        updateModeSelect();
    });
}

// Переключение темы
const themeToggleBtn = document.getElementById('theme-toggle');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        isNight = !isNight;
        const newTheme = isNight ? 'night' : 'day';
        if (document.body) {
            document.body.classList.toggle('day', !isNight);
        }
        localStorage.setItem('theme', newTheme);
        console.log(`[THEME_CHANGE] Theme changed to: ${newTheme}. Saved to localStorage.`);
        sendGAEvent('theme_changed', { new_theme: newTheme });
        updateLanguage(); // To update button text
    });
}

// Обновление видимости элементов в зависимости от режима
function updateModeVisibility() {
    if (buttonVisibilityTimeoutId) {
        clearTimeout(buttonVisibilityTimeoutId);
        buttonVisibilityTimeoutId = null;
    }

    const statusButtons = document.querySelector('.status-buttons');
    const genderButtons = document.querySelector('.gender-buttons');
    const checkBtnElement = document.getElementById('check-btn');
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');
    const nextPersonBtn = document.getElementById('next-person');

    const gameIsActive = currentAttempts < maxAttempts;
    const canMakeGuess = !hasChecked;

    console.log(`[UI_UPDATE_MODE] updateModeVisibility: gameIsActive=${gameIsActive}, canMakeGuess=${canMakeGuess}, mode=${gameMode}`);

    if (gameIsActive && canMakeGuess) {
        if (statusButtons) statusButtons.style.display = 'flex';
        if (checkBtnElement) {
            checkBtnElement.style.display = 'inline-block';
            updateCheckButtonState(); 
        }

        if (gameMode === 'closed') {
            if (genderButtons) genderButtons.style.display = 'flex';
        } else {
            if (genderButtons) genderButtons.style.display = 'none'; 
        }
        if (nextPersonBtn) nextPersonBtn.style.display = 'none';
    } else if (gameIsActive && hasChecked) {
        // Guess has been made and verified: show Next Person button
        if (statusButtons) statusButtons.style.display = 'none';
        if (genderButtons) genderButtons.style.display = 'none';
        if (checkBtnElement) checkBtnElement.style.display = 'none';
        if (nextPersonBtn) {
            nextPersonBtn.style.display = 'block';
            const texts = translations[selectedLanguage] || translations.uk;
            nextPersonBtn.textContent = texts.nextPerson || 'Наступне фото';
        }
    } else {
        // Game is over: hide all in-game guess controls
        if (statusButtons) statusButtons.style.display = 'none';
        if (genderButtons) genderButtons.style.display = 'none';
        if (checkBtnElement) checkBtnElement.style.display = 'none';
        if (nextPersonBtn) nextPersonBtn.style.display = 'none';
    }

    if (gameMode === 'closed') {
        if (hasChecked) { 
            if (overlay) overlay.classList.add('hidden');
            if (personImage) {
                personImage.style.opacity = '';
                personImage.style.visibility = '';
            }
            console.log('[UI_UPDATE_MODE_OVERLAY] Closed mode, checked: Overlay hidden, Image shown.');
        } else { 
            if (overlay) overlay.classList.remove('hidden');
            if (personImage) {
                personImage.style.opacity = '0';
                personImage.style.visibility = 'hidden';
            }
            console.log('[UI_UPDATE_MODE_OVERLAY] Closed mode, not checked: Overlay shown, Image completely hidden.');
        }
    } else {
        if (overlay) overlay.classList.add('hidden');
        if (personImage) {
            personImage.style.opacity = '';
            personImage.style.visibility = '';
        }
        console.log('[UI_UPDATE_MODE_OVERLAY] Open mode: Overlay hidden, Image shown.');
    }
}


// Управление состоянием кнопки "Проверить"
function updateCheckButtonState() {
    const checkBtn = document.getElementById('check-btn');
    if (!checkBtn) return; 
    let disabled;
    if (gameMode === 'closed') {
        disabled = !userGenderGuess || !userStatusGuess;
    } else {
        disabled = !userStatusGuess;
    }
    checkBtn.disabled = disabled;
}

// Логирование состояния загрузки
function logPhotoStatus() {
    const preloadedPersonName = preloadedPersonContainer &&
                                preloadedPersonContainer.data &&
                                preloadedPersonContainer.data.person && 
                                preloadedPersonContainer.data.person.personLabel &&
                                preloadedPersonContainer.data.person.personLabel.value
                                ? preloadedPersonContainer.data.person.personLabel.value
                                : 'None or no label';
    console.log(`[PHOTO_STATUS] Loaded photos in session: ${loadedPhotos}, Remaining in sessionList: ${sessionList.length}, Preloaded: ${preloadedPersonName}`);
}


// Обновление прогресс-бара (горизонтального и кругового)
function updateProgressBar(percentage, isImageLoading = false) {
    const horizontalProgressBar = document.getElementById('progress-bar');
    const circularProgressContainer = document.getElementById('circular-progress-container');
    const circularProgressBar = document.getElementById('circular-progress-bar');

    requestAnimationFrame(() => {
        if (isImageLoading) {
            if (percentage < 100) {
                circularProgressContainer.classList.remove('hidden');
                circularProgressContainer.setAttribute('aria-valuenow', Math.round(percentage));
            }
            const offset = 100 - percentage; 
            circularProgressBar.style.strokeDashoffset = offset;
            
            if (percentage >= 100) {
                setTimeout(() => {
                    circularProgressContainer.classList.add('hidden');
                }, 500); 
            }
        } else {
            horizontalProgressBar.classList.remove('hidden');
            horizontalProgressBar.style.width = `${percentage}%`;
            if (percentage >= 100) {
                setTimeout(() => {
                    horizontalProgressBar.classList.add('hidden');
                }, 500);
            }
        }
    });
}


// Имитация прогресса для загрузки изображения
function simulateImageProgress(duration = 1500) {
    console.log('[IMAGE_LOAD] Starting image loading simulation.');
    return new Promise((resolve) => {
        if (duration <= 0) { 
            updateProgressBar(99, true);
            console.log('[IMAGE_LOAD] Image loading simulation reached 99% (instant due to zero/negative duration).');
            resolve();
            return;
        }
        const startTime = performance.now();
        const interval = Math.min(100, duration / 10); 
        let progress = 0;

        const update = () => {
            const elapsed = performance.now() - startTime;
            progress = Math.min((elapsed / duration) * 99, 99); 
            updateProgressBar(progress, true); 
            if (progress < 99) {
                setTimeout(update, interval);
            } else {
                console.log('[IMAGE_LOAD] Image loading simulation reached 99%.');
                resolve();
            }
        };
        update();
    });
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

function makeWeservProxyUrl(rawUrl, extraParams = '') {
    try {
        let clean = String(rawUrl).trim();
        let decoded = clean;
        try {
            decoded = decodeURIComponent(clean);
        } catch (e) {
            try {
                decoded = decodeURI(clean);
            } catch (e2) {}
        }
        const paramStr = extraParams ? (extraParams.startsWith('&') ? extraParams : '&' + extraParams) : '';
        return `https://images.weserv.nl/?url=${encodeURIComponent(decoded)}${paramStr}`;
    } catch (e) {
        return `https://images.weserv.nl/?url=${encodeURIComponent(rawUrl)}${extraParams || ''}`;
    }
}

async function isBlackAndWhite(imageUrl) { 
    if (!settings.excludeBlackAndWhite) {
        return false;
    }

    const cacheKey = imageUrl;
    if (rgbHslCache[cacheKey] !== undefined) {
        console.log(`[IMAGE_CHECK_BW] Using cached B&W result for ${cacheKey}: ${rgbHslCache[cacheKey] ? 'black-and-white' : 'color'}`);
        return rgbHslCache[cacheKey];
    }
    console.log(`[IMAGE_CHECK_BW] Analyzing image for B&W: ${cacheKey}`);

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous'; 

        const analyzeImage = (imageToAnalyze, sourceUrl) => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 100; 
                canvas.height = 100;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imageToAnalyze, 0, 0, 100, 100);

                const imageData = ctx.getImageData(0, 0, 100, 100).data;
                let rSum = 0, gSum = 0, bSum = 0;
                let rSquareSum = 0, gSquareSum = 0, bSquareSum = 0;
                let saturationSum = 0;
                let count = 0;

                for (let i = 0; i < imageData.length; i += 4) {
                    const r = imageData[i];
                    const g = imageData[i + 1];
                    const b = imageData[i + 2];
                    rSum += r;
                    gSum += g;
                    bSum += b;
                    rSquareSum += r * r;
                    gSquareSum += g * g;
                    bSquareSum += b * b;

                    const [, sVal] = rgbToHsl(r, g, b);
                    saturationSum += sVal;
                    count++;
                }

                const rMean = rSum / count;
                const gMean = gSum / count;
                const bMean = bSum / count;
                const rStdDev = Math.sqrt((rSquareSum / count) - (rMean * rMean));
                const gStdDev = Math.sqrt((gSquareSum / count) - (gMean * gMean));
                const bStdDev = Math.sqrt((bSquareSum / count) - (bMean * bMean));
                const meanSaturation = saturationSum / count;

                const isBW = rStdDev < 20 && gStdDev < 20 && bStdDev < 20 && meanSaturation < 0.2;
                console.log(`[IMAGE_CHECK_BW] Result for ${cacheKey} (via ${sourceUrl}): ${isBW ? 'black-and-white' : 'color'} ` +
                            `(R_stdDev:${rStdDev.toFixed(2)}, G_stdDev:${gStdDev.toFixed(2)}, B_stdDev:${bStdDev.toFixed(2)}, Mean Saturation:${(meanSaturation * 100).toFixed(2)}%)`);
                
                rgbHslCache[cacheKey] = isBW; 
                localStorage.setItem('rgbHslCache', JSON.stringify(rgbHslCache));
                console.log('[CACHE_UPDATE] rgbHslCache updated in localStorage.');
                
                resolve(isBW);
            } catch (e) {
                console.error(`[IMAGE_CHECK_BW_CANVAS_ERROR] Canvas analysis failed for ${sourceUrl}:`, e);
                resolve(false);
            }
        };

        img.onload = () => {
            analyzeImage(img, imageUrl);
        };
        img.onerror = () => {
            console.warn(`[IMAGE_CHECK_BW_DIRECT_ERROR] Direct load failed for B&W check: ${imageUrl}. Trying proxy fallback...`);
            
            const proxyForBWCheck = makeWeservProxyUrl(imageUrl, 'w=100&h=100&fit=cover&output=jpg'); 
            const proxyImg = new Image();
            proxyImg.crossOrigin = 'Anonymous';
            proxyImg.onload = () => {
                analyzeImage(proxyImg, proxyForBWCheck);
            };
            proxyImg.onerror = () => {
                console.error(`[IMAGE_CHECK_BW_ALL_ERROR] Direct and Proxy loaded failed for B&W check: ${imageUrl}`);
                resolve(false);
            };
            proxyImg.src = proxyForBWCheck;
        };
        img.src = imageUrl;
    });
}

async function getCommonsImageUrl(fileName) {
    if (!fileName) return null;
    const cleanFileName = decodeURIComponent(fileName).replace(/^File:/i, '').trim();
    const fallbackUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(cleanFileName)}?width=600`;
    const start = performance.now();
    console.log(`[COMMONS_API] Fetching image URL for file: ${cleanFileName}`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(cleanFileName)}&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*`, {
            headers: {
                'Api-User-Agent': 'iPersonSeeTrivia/2.3.4 (https://romanmod.github.io/personseei/; contact: KRV.MOD@gmail.com) WebApp'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Commons API error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        const pages = data.query ? data.query.pages : null;
        if (!pages) return fallbackUrl;
        const page = pages[Object.keys(pages)[0]];
        const duration = (performance.now() - start).toFixed(0);
        if (!page || !page.imageinfo || !page.imageinfo[0]) {
            console.warn(`[COMMONS_API_WARN] No imageinfo found for file: ${cleanFileName}. API Time: ${duration}ms. Using Special:FilePath fallback.`);
            return fallbackUrl;
        }
        // Prefer 600px CDN thumbnail over multi-megabyte camera original
        const imageUrl = page.imageinfo[0].thumburl || page.imageinfo[0].url || fallbackUrl;
        console.log(`[COMMONS_API_SUCCESS] Got image URL (width ~600px): ${imageUrl}. API Time: ${duration}ms`);
        return imageUrl;
    } catch (error) {
        console.warn(`[COMMONS_API_FALLBACK] Commons API failed or timed out for ${cleanFileName} (${error.message}). Falling back to Special:FilePath directly.`);
        return fallbackUrl;
    }
}

async function loadImageWithFallback(url, element) {
    console.log(`[IMAGE_LOAD] Attempting to load image directly: ${url}`);
    element.classList.remove('loaded');
        
    return new Promise((resolve, reject) => {
        let isCompleted = false;
        let directTimeoutId = null;
        let proxyTimeoutId = null;

        const cleanup = () => {
            if (directTimeoutId) clearTimeout(directTimeoutId);
            if (proxyTimeoutId) clearTimeout(proxyTimeoutId);
            element.onload = null;
            element.onerror = null;
        };

        const tryProxy = (failReason) => {
            if (isCompleted) return;
            console.warn(`[IMAGE_LOAD_DIRECT_${failReason}] Direct image load ${failReason} for ${url}. Trying proxy fallback...`);
            
            const proxyUrl = makeWeservProxyUrl(url);
            
            proxyTimeoutId = setTimeout(() => {
                if (isCompleted) return;
                isCompleted = true;
                console.error(`[IMAGE_LOAD_PROXY_TIMEOUT] Proxy image load timed out for ${proxyUrl}.`);
                element.style.opacity = '';
                element.src = FALLBACK_PLACEHOLDER_URI;
                element.classList.add('loaded');
                cleanup();
                reject(new Error(`Direct and proxy image load timed out for ${url}`));
            }, 5000);

            element.onload = () => {
                if (isCompleted) return;
                isCompleted = true;
                element.style.opacity = ''; 
                element.classList.add('loaded'); 
                console.log(`[IMAGE_LOAD_PROXY_SUCCESS] Image loaded successfully via proxy: ${proxyUrl}`);
                cleanup();
                resolve();
            };
            
            element.onerror = () => {
                if (isCompleted) return;
                isCompleted = true;
                console.error(`[IMAGE_LOAD_PROXY_ERROR] Proxy image load also failed: ${proxyUrl}. Falling back to placeholder.`);
                element.style.opacity = ''; 
                element.src = FALLBACK_PLACEHOLDER_URI; 
                element.classList.add('loaded'); 
                cleanup();
                reject(new Error(`Direct and proxy image load failed for ${url}`));
            };
            
            element.src = proxyUrl;
            if (element.complete && element.naturalWidth > 0) {
                if (isCompleted) return;
                isCompleted = true;
                element.style.opacity = '';
                element.classList.add('loaded');
                cleanup();
                resolve();
            }
        };

        // 6.5s timeout for direct load to prevent premature aborts on slower connections
        directTimeoutId = setTimeout(() => {
            tryProxy('TIMEOUT');
        }, 6500);

        element.onload = () => {
            if (isCompleted) return;
            isCompleted = true;
            element.style.opacity = ''; 
            element.classList.add('loaded'); 
            console.log(`[IMAGE_LOAD_SUCCESS] Image loaded successfully: ${url}`);
            cleanup();
            resolve();
        };

        element.onerror = () => {
            tryProxy('ERROR');
        };
        
        element.src = url;
        if (element.complete && element.naturalWidth > 0) {
            if (isCompleted) return;
            isCompleted = true;
            element.style.opacity = '';
            element.classList.add('loaded');
            cleanup();
            resolve();
        }
    });
}

const WIKIDATA_QUERY_TIMEOUT_MS = 25000; 

const offlinePeople = [
    // Male, Alive
    {
        person: { value: "https://en.wikipedia.org/wiki/Elon_Musk" },
        personLabel: { value: "Elon Musk" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Elon_Musk_Royal_Society_crop.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1971-06-28T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Keanu_Reeves" },
        personLabel: { value: "Keanu Reeves" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Keanu_Reeves_at_TIFF_2025_02_(Cropped).jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1964-09-02T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Brad_Pitt" },
        personLabel: { value: "Brad Pitt" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Brad_Pitt_2019_by_Glenn_Francis.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1963-12-18T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Bill_Gates" },
        personLabel: { value: "Bill Gates" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Bill_Gates_2017_(cropped).jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1955-10-28T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Arnold_Schwarzenegger" },
        personLabel: { value: "Arnold Schwarzenegger" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Arnold_Schwarzenegger_2019.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1947-07-30T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "alive"
    },
    // Male, Deceased
    {
        person: { value: "https://en.wikipedia.org/wiki/Albert_Einstein" },
        personLabel: { value: "Albert Einstein" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Albert_Einstein_Head.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1879-03-14T00:00:00Z" },
        deathDate: { value: "1955-04-18T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Steve_Jobs" },
        personLabel: { value: "Steve Jobs" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Steve_Jobs_Headshot_2010_(cropped_4).jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1955-02-24T00:00:00Z" },
        deathDate: { value: "2011-10-05T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Nikola_Tesla" },
        personLabel: { value: "Nikola Tesla" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Tesla_Sarony.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1856-07-10T00:00:00Z" },
        deathDate: { value: "1943-01-07T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Vincent_van_Gogh" },
        personLabel: { value: "Vincent van Gogh" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1853-03-30T00:00:00Z" },
        deathDate: { value: "1890-07-29T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Thomas_Edison" },
        personLabel: { value: "Thomas Edison" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Thomas_Edison2.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1847-02-11T00:00:00Z" },
        deathDate: { value: "1931-10-18T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Abraham_Lincoln" },
        personLabel: { value: "Abraham Lincoln" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Abraham_Lincoln_O-77_matte_collodion_print.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1809-02-12T00:00:00Z" },
        deathDate: { value: "1865-04-15T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Leonardo_da_Vinci" },
        personLabel: { value: "Leonardo da Vinci" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Leonardo_da_Vinci_-_presumed_self-portrait_-_WGA12798.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1452-04-15T00:00:00Z" },
        deathDate: { value: "1519-05-02T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/William_Shakespeare" },
        personLabel: { value: "William Shakespeare" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/William_Shakespeare_1609.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581097" },
        birthDate: { value: "1564-04-26T00:00:00Z" },
        deathDate: { value: "1616-04-23T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "male",
        status_string: "deceased"
    },
    // Female, Alive
    {
        person: { value: "https://en.wikipedia.org/wiki/Taylor_Swift" },
        personLabel: { value: "Taylor Swift" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Taylor_Swift_at_the_2023_MTV_Video_Music_Awards_(3).png?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1989-12-13T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Beyonc%C3%A9" },
        personLabel: { value: "Beyoncé" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Beyonce_Knowles_with_necklaces.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1981-09-04T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Ruslana" },
        personLabel: { value: "Ruslana" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Ruslana_in_Cologne,_Germany_05.JPG?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1973-05-24T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Lina_Kostenko" },
        personLabel: { value: "Lina Kostenko" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Lina_Kostenko.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1930-03-19T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Angela_Merkel" },
        personLabel: { value: "Angela Merkel" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Angela_Merkel_2019_cropped.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1954-07-17T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/J._K._Rowling" },
        personLabel: { value: "J. K. Rowling" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/J._K._Rowling_2010.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1965-07-31T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Scarlett_Johansson" },
        personLabel: { value: "Scarlett Johansson" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Scarlett_Johansson_by_Gage_Skidmore_2_(cropped).jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1984-11-22T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "alive"
    },
    // Female, Deceased
    {
        person: { value: "https://en.wikipedia.org/wiki/Queen_Elizabeth_II" },
        personLabel: { value: "Elizabeth II" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Queen_Elizabeth_II_in_March_2015.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1926-04-21T00:00:00Z" },
        deathDate: { value: "2022-09-08T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Marie_Curie" },
        personLabel: { value: "Marie Curie" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Marie_Curie_c._1920s.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1867-11-07T00:00:00Z" },
        deathDate: { value: "1934-07-04T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Marilyn_Monroe" },
        personLabel: { value: "Marilyn Monroe" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Monroecirca1953.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1926-06-01T00:00:00Z" },
        deathDate: { value: "1962-08-05T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Audrey_Hepburn" },
        personLabel: { value: "Audrey Hepburn" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Audrey_Hepburn_1956.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1929-05-04T00:00:00Z" },
        deathDate: { value: "1993-01-20T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Lesya_Ukrainka" },
        personLabel: { value: "Lesya Ukrainka" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Lesya_Ukrainka.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1871-02-25T00:00:00Z" },
        deathDate: { value: "1913-08-01T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Frida_Kahlo" },
        personLabel: { value: "Frida Kahlo" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Frida_Kahlo,_by_Guillermo_Kahlo.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1907-07-06T00:00:00Z" },
        deathDate: { value: "1954-07-13T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Ada_Lovelace" },
        personLabel: { value: "Ada Lovelace" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Ada_Lovelace_portrait.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1815-12-10T00:00:00Z" },
        deathDate: { value: "1852-11-27T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    },
    {
        person: { value: "https://en.wikipedia.org/wiki/Rosa_Parks" },
        personLabel: { value: "Rosa Parks" },
        image: { value: "https://commons.wikimedia.org/wiki/Special:FilePath/Rosa_Parks_1955.jpg?width=600" },
        gender: { value: "http://www.wikidata.org/entity/Q6581072" },
        birthDate: { value: "1913-02-04T00:00:00Z" },
        deathDate: { value: "2005-10-24T00:00:00Z" },
        isOfflineFallback: true,
        gender_string: "female",
        status_string: "deceased"
    }
];

// Category deck system to guarantee rich diversity and zero duplicates across games
const categoryDecks = {
    'male-alive': [],
    'male-deceased': [],
    'female-alive': [],
    'female-deceased': []
};

let sessionShownNames = new Set();

function getNextCatalogPerson(category) {
    const gender = category?.gender || (Math.random() > 0.5 ? 'male' : 'female');
    const status = category?.status || (Math.random() > 0.5 ? 'alive' : 'deceased');
    const catKey = `${gender}-${status}`;

    // Refill and Fisher-Yates shuffle if deck is depleted
    if (!categoryDecks[catKey] || categoryDecks[catKey].length === 0) {
        const pool = (Array.isArray(peopleCatalog) && peopleCatalog.length > 0) ? peopleCatalog : offlinePeople;
        let matching = pool.filter(p => p.gender_string === gender && p.status_string === status);
        if (!matching || matching.length === 0) {
            matching = pool;
        }

        const shuffled = [...matching];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        categoryDecks[catKey] = shuffled;
        console.log(`[CATALOG_DECK] Deck "${catKey}" refilled and shuffled (${shuffled.length} candidates).`);
    }

    // Prefer candidate not yet shown in this game session
    let candidateIndex = categoryDecks[catKey].findIndex(p => !sessionShownNames.has(p.personLabel.value));
    if (candidateIndex === -1) {
        candidateIndex = categoryDecks[catKey].length - 1;
    }

    const candidate = categoryDecks[catKey].splice(candidateIndex, 1)[0];
    sessionShownNames.add(candidate.personLabel.value);
    console.log(`[CATALOG_DECK] Dealt candidate: ${candidate.personLabel.value} (${catKey}). Remaining in deck: ${categoryDecks[catKey].length}`);
    return candidate;
}

function getOfflineFallbackPerson(category) {
    return getNextCatalogPerson(category);
}

function removePersonFromCache(personToRemove) {
    if (!personToRemove) return;
    const uri = personToRemove.person?.value;
    const name = personToRemove.personLabel?.value;
    if (!uri && !name) return;

    let modified = false;
    for (const key of Object.keys(wikidataCache)) {
        if (Array.isArray(wikidataCache[key])) {
            const initialCount = wikidataCache[key].length;
            wikidataCache[key] = wikidataCache[key].filter(item => {
                if (!item) return false;
                if (uri && item.person?.value === uri) return false;
                if (name && item.personLabel?.value === name) return false;
                return true;
            });
            if (wikidataCache[key].length !== initialCount) {
                modified = true;
            }
        }
    }
    if (modified) {
        try {
            localStorage.setItem('wikidataCache', JSON.stringify(wikidataCache));
            console.log(`[CACHE_PURGE] Removed bad or failing person "${name || uri}" from local wikidataCache.`);
        } catch (e) {}
    }
}

async function fetchPersonData(useRandom = false, category = null) {
    const categoryKey = `${category?.gender || 'any'}-${category?.status || 'any'}`;
    try {
        // Query live Wikidata database directly for fresh, ordinary, diverse historical/modern figures
        return await fetchPersonDataInner(useRandom, category);
    } catch (err) {
        console.warn(`[WIKIDATA_FETCH_ERROR_FALLBACK] Wikidata live fetch failed for ${categoryKey}: ${err.message}. Invoking backup fallback...`);
        updateDataSourceIndicator('fallback', 'Offline Backup');
        const fallbackPerson = getOfflineFallbackPerson(category);
        if (fallbackPerson) {
            fallbackPerson.isOfflineFallback = true;
            fallbackPerson.dataSource = 'Offline Catalog';
        }
        return fallbackPerson;
    }
}

async function fetchPersonDataInner(useRandom = false, category = null) {
    const start = performance.now();
    let query;
    let attempts = 0;
    const maxQueryAttempts = 2;
    const categoryKey = `${category?.gender || 'any'}-${category?.status || 'any'}`;
    const cacheKey = `${useRandom}-${categoryKey}`;
    
    console.log(`[WIKIDATA_FETCH] Attempting to fetch person data. Random: ${useRandom}, Category: ${categoryKey}, CacheKey: ${cacheKey}`);

    if (wikidataCache[cacheKey] && wikidataCache[cacheKey].length > 0) {
        // Filter out broken upload.wikimedia.org hashes from old caches
        wikidataCache[cacheKey] = wikidataCache[cacheKey].filter(p => 
            p && p.personLabel && p.personLabel.value && 
            p.image && p.image.value && 
            !p.image.value.includes('/wikipedia/commons/b/b5/191125_Taylor_Swift')
        );

        if (wikidataCache[cacheKey].length > 0) {
            let available = wikidataCache[cacheKey].filter(p => p && p.personLabel && p.personLabel.value && !sessionShownNames.has(p.personLabel.value));
            if (available.length > 0) {
                const cachedPerson = available[Math.floor(Math.random() * available.length)];
                if (cachedPerson && cachedPerson.personLabel && cachedPerson.personLabel.value && cachedPerson.image && cachedPerson.image.value && cachedPerson.gender && cachedPerson.birthDate && cachedPerson.person && cachedPerson.person.value) {
                    sessionShownNames.add(cachedPerson.personLabel.value);
                    cachedPerson.dataSource = 'Wikidata Cache';
                    updateDataSourceIndicator('cache', 'Wikidata Cache');
                    console.log(`[WIKIDATA_FETCH_CACHE] Using valid cached data for ${cacheKey}. Person: ${cachedPerson.personLabel.value}`);
                    return cachedPerson;
                }
            }
        }
        delete wikidataCache[cacheKey]; 
    }

    console.log(`[WIKIDATA_FETCH] No valid cache hit for ${cacheKey}, querying Wikidata.`);

    const genderFilter = category?.gender === 'male' ? 'FILTER(?gender = wd:Q6581097)' :
                         category?.gender === 'female' ? 'FILTER(?gender = wd:Q6581072)' :
                         'FILTER(?gender IN (wd:Q6581097, wd:Q6581072))';
    const statusFilter = category?.status === 'alive' ? 'FILTER NOT EXISTS { ?person wdt:P570 ?deathDate }' :
                         category?.status === 'deceased' ? '?person wdt:P570 ?deathDate.' :
                         'OPTIONAL { ?person wdt:P570 ?deathDate }';
    const birthDateFilter = `FILTER(?birthDate >= "${settings.birthYearFilter}-01-01T00:00:00Z"^^xsd:dateTime).`;
    const countryFilter = settings.selectedCountries === 'all' ? '' :
                         `FILTER(?country IN (${settings.selectedCountries
                             .map(code => `wd:${settings.countryMap[code]}`)
                             .filter(id => id)
                             .join(', ')})).`;

    while (attempts < maxQueryAttempts) {
        attempts++;
        const offset = settings.dynamicOffset ? Math.floor(Math.random() * settings.maxOffset) : 0;
        
        // Fast optimized SPARQL: start from wdt:P18 and wdt:P21 to bypass massive wd:Q5 join
        query = `#TOOL: iPersonSeeTrivia/2.3.6 (https://romanmod.github.io/personseei/; contact: KRV.MOD@gmail.com)
            SELECT ?person ?personLabel ?image ?gender ?deathDate ?birthDate
            WHERE {
                ?person wdt:P18 ?image;
                        wdt:P21 ?gender;
                        wdt:P569 ?birthDate.
                ${genderFilter}
                ${statusFilter}
                ${birthDateFilter}
                ${settings.selectedCountries !== 'all' && settings.strictCountryFilter ? countryFilter : ''}
                ?person rdfs:label ?personLabel.
                FILTER (LANG(?personLabel) = "en").
            }
            OFFSET ${offset}
            LIMIT ${settings.maxPeople}
        `;

        const endpoint = 'https://query.wikidata.org/sparql';
        const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json&origin=*`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.warn(`[WIKIDATA_QUERY_TIMEOUT_EVENT] Wikidata query attempt ${attempts}/${maxQueryAttempts} for category ${categoryKey} is taking too long and will be aborted.`);
            controller.abort();
        }, WIKIDATA_QUERY_TIMEOUT_MS);

        try {
            let response = null;
            let usedProxy = false;
            try {
                // Simple CORS GET: keep headers safelisted (no custom headers) to eliminate browser OPTIONS preflight failures
                response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/sparql-results+json'
                    },
                    signal: controller.signal
                });
            } catch (directErr) {
                console.warn(`[WIKIDATA_DIRECT_FAIL] Direct SPARQL query issue (${directErr.message}). Attempting CORS proxy fallback...`);
            }

            if (!response || !response.ok) {
                // Secondary resilient fallback: query through high-speed CORS proxies
                const proxyEndpoints = [
                    (targetUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
                    (targetUrl) => `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
                    (targetUrl) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
                ];
                for (const buildProxyUrl of proxyEndpoints) {
                    try {
                        const proxyUrl = buildProxyUrl(url);
                        const proxyController = new AbortController();
                        const proxyTimer = setTimeout(() => proxyController.abort(), 6000);
                        const proxyRes = await fetch(proxyUrl, {
                            method: 'GET',
                            signal: proxyController.signal
                        });
                        clearTimeout(proxyTimer);
                        if (proxyRes && proxyRes.ok) {
                            response = proxyRes;
                            usedProxy = true;
                            console.log(`[WIKIDATA_PROXY_SUCCESS] CORS proxy fallback succeeded via ${new URL(proxyUrl).hostname} for category ${categoryKey}.`);
                            break;
                        }
                    } catch (proxyErr) {
                        // Continue to next proxy
                    }
                }
            }

            clearTimeout(timeoutId);
            if (!response || !response.ok) throw new Error(`Wikidata API error: ${response ? response.status : 'network failure'}`);
            const data = await response.json();
            const list = data.results && data.results.bindings; 
            const duration = (performance.now() - start).toFixed(0);
            
            if (!list || !list.length) { 
                console.warn(`[WIKIDATA_QUERY_WARN] No results or invalid list for category ${categoryKey}, attempt ${attempts}/${maxQueryAttempts}. Response:`, data);
                if (attempts === maxQueryAttempts) throw new Error(`No person found for category ${categoryKey} after ${maxQueryAttempts} query attempts with different offsets.`);
                continue; 
            }
            console.log(`[WIKIDATA_QUERY_SUCCESS] Attempt ${attempts}/${maxQueryAttempts} successful for category ${categoryKey}. Found ${list.length} results. Time: ${duration}ms`);

            wikidataCache[cacheKey] = (wikidataCache[cacheKey] || []).concat(list).slice(-100); 
            localStorage.setItem('wikidataCache', JSON.stringify(wikidataCache));
            console.log('[CACHE_UPDATE] wikidataCache updated in localStorage.');

            let freshList = list.filter(p => p && p.personLabel && p.personLabel.value && !sessionShownNames.has(p.personLabel.value));
            if (!freshList || freshList.length === 0) {
                freshList = list;
            }
            const randomPerson = freshList[Math.floor(Math.random() * freshList.length)];
            if (randomPerson && randomPerson.personLabel && randomPerson.personLabel.value && randomPerson.image && randomPerson.image.value && randomPerson.gender && randomPerson.birthDate && randomPerson.person && randomPerson.person.value) {
                sessionShownNames.add(randomPerson.personLabel.value);
                randomPerson.dataSource = usedProxy ? 'Wikidata Proxy' : 'Wikidata Live';
                updateDataSourceIndicator('healthy', randomPerson.dataSource);
                return randomPerson;
            } else {
                 console.warn(`[WIKIDATA_QUERY_WARN] Randomly selected person is invalid, attempt ${attempts}/${maxQueryAttempts}. Person:`, randomPerson);
                 if (attempts === maxQueryAttempts) throw new Error(`Selected invalid person on final attempt for category ${categoryKey}.`);
                 continue; 
            }

        } catch (error) {
            clearTimeout(timeoutId);
            const isTimeoutAbort = error.name === 'AbortError';

            if (!isTimeoutAbort) {
                if (error.message && error.message.includes('Failed to fetch')) {
                    console.warn(`[WIKIDATA_QUERY_WARN] Query attempt ${attempts}/${maxQueryAttempts} for category ${categoryKey} failed with fetch issue. Retrying. Error: ${error.message}`);
                } else {
                    console.error(`[WIKIDATA_QUERY_ERROR] Query attempt ${attempts}/${maxQueryAttempts} for category ${categoryKey} failed. Retrying. Error: ${error.message}`);
                }
            }

            if (isTimeoutAbort || attempts >= maxQueryAttempts) {
                let rethrowMessage;
                if (isTimeoutAbort) {
                    rethrowMessage = `Wikidata query for person data (category: ${categoryKey}) timed out on attempt ${attempts}/${maxQueryAttempts}.`;
                } else { 
                    rethrowMessage = `Failed to fetch person data (category: ${categoryKey}) after ${maxQueryAttempts} attempts. Last error on attempt ${attempts}: ${error.message}`;
                }
                console.error(`[WIKIDATA_FETCH_FINAL_ERROR] ${rethrowMessage}`);
                throw new Error(rethrowMessage);
            }
            console.log(`[WIKIDATA_FETCH_RETRY] Retrying query for ${categoryKey}, attempt ${attempts + 1}/${maxQueryAttempts}...`);
        }
    }
    throw new Error(`Failed to fetch person data for category ${categoryKey} after ${maxQueryAttempts} attempts (unexpected exit).`);
}

async function startPreloadNextAvailablePerson() {
    if (isCurrentlyPreloading || sessionList.length === 0) {
        if (isCurrentlyPreloading) console.log('[PRELOAD] Preload already in progress or next item is already the target of current load.');
        if (sessionList.length === 0) console.log('[PRELOAD] Session list empty, nothing to preload.');
        return;
    }

    isCurrentlyPreloading = true;
    const nextPersonToPreloadEntry = sessionList[0]; 

    if (!nextPersonToPreloadEntry || !nextPersonToPreloadEntry.person || !nextPersonToPreloadEntry.person.image || !nextPersonToPreloadEntry.person.image.value || !nextPersonToPreloadEntry.person.personLabel || !nextPersonToPreloadEntry.person.personLabel.value) {
        console.warn('[PRELOAD_WARN] Next person data for preloading is invalid or missing image/label info.', nextPersonToPreloadEntry);
        isCurrentlyPreloading = false;
        return;
    }
    const personBindingForPreload = nextPersonToPreloadEntry.person;
    console.log(`[PRELOAD] Starting preload for: ${personBindingForPreload.personLabel.value}`);

    try {
        let commonsUrl;
        if (personBindingForPreload.isOfflineFallback || personBindingForPreload.isCatalogPerson) {
            commonsUrl = personBindingForPreload.image.value;
        } else {
            const fileName = decodeURIComponent(personBindingForPreload.image.value.split('/').pop());
            commonsUrl = await getCommonsImageUrl(fileName);
            if (!commonsUrl) {
                console.warn(`[PRELOAD_WARN] No Commons URL for ${fileName} (person: ${personBindingForPreload.personLabel.value}) during preload. Preload for this item skipped.`);
                isCurrentlyPreloading = false;
                return;
            }
        }

        if (settings.excludeBlackAndWhite) {
            const isBW = await isBlackAndWhite(commonsUrl);
            if (isBW) {
                console.warn(`[PRELOAD_BW_SKIP] Skipping B&W image during preload for ${personBindingForPreload.personLabel.value}.`);
                isCurrentlyPreloading = false;
                return;
            }
        }

        const preloadedImage = new Image();

        await new Promise((resolve, reject) => {
            let isCompleted = false;
            let directTimeoutId = null;
            let proxyTimeoutId = null;

            const cleanup = () => {
                if (directTimeoutId) clearTimeout(directTimeoutId);
                if (proxyTimeoutId) clearTimeout(proxyTimeoutId);
                preloadedImage.onload = null;
                preloadedImage.onerror = null;
            };

            const tryProxyPreload = (failReason) => {
                if (isCompleted) return;
                console.warn(`[PRELOAD_DIRECT_${failReason}] Direct image preload ${failReason} for ${commonsUrl}. Trying proxy fallback...`);
                
                const proxyImageUrl = makeWeservProxyUrl(commonsUrl);
                const proxyImage = new Image();

                proxyTimeoutId = setTimeout(() => {
                    if (isCompleted) return;
                    isCompleted = true;
                    console.warn(`[PRELOAD_PROXY_TIMEOUT] Proxy image preload timed out for: ${proxyImageUrl}`);
                    cleanup();
                    proxyImage.onload = null;
                    proxyImage.onerror = null;
                    reject(new Error(`Preload timed out for ${commonsUrl}`));
                }, 5000);
                
                proxyImage.onload = () => {
                    if (isCompleted) return;
                    isCompleted = true;
                    cleanup();
                    console.log(`[PRELOAD_PROXY_SUCCESS] Image preloaded successfully via proxy: ${proxyImageUrl} for ${personBindingForPreload.personLabel.value}`);
                    preloadedPersonContainer = {
                        data: nextPersonToPreloadEntry, 
                        imageElement: proxyImage,
                        commonsUrl: commonsUrl,
                        proxyUrl: proxyImageUrl
                    };
                    resolve();
                };
                
                proxyImage.onerror = () => {
                    if (isCompleted) return;
                    isCompleted = true;
                    cleanup();
                    console.error(`[PRELOAD_ERROR] Both direct and proxy preloads failed for: ${commonsUrl} (person: ${personBindingForPreload.personLabel.value})`);
                    removePersonFromCache(personBindingForPreload);
                    reject(new Error(`Preload failed for ${commonsUrl}`));
                };
                
                proxyImage.src = proxyImageUrl;
            };

            directTimeoutId = setTimeout(() => {
                tryProxyPreload('TIMEOUT');
            }, 6500);

            preloadedImage.onload = () => {
                if (isCompleted) return;
                isCompleted = true;
                cleanup();
                console.log(`[PRELOAD_SUCCESS] Image preloaded successfully directly: ${commonsUrl} for ${personBindingForPreload.personLabel.value}`);
                preloadedPersonContainer = {
                    data: nextPersonToPreloadEntry, 
                    imageElement: preloadedImage,
                    commonsUrl: commonsUrl,
                    proxyUrl: commonsUrl
                };
                resolve();
            };
            preloadedImage.onerror = () => {
                tryProxyPreload('FAILED');
            };
            preloadedImage.src = commonsUrl;
        });

    } catch (error) {
        console.error(`[PRELOAD_ERROR] Error during preload process for ${personBindingForPreload.personLabel.value}: ${error.message}`);
        preloadedPersonContainer = null; 
    } finally {
        isCurrentlyPreloading = false;
        console.log('[PRELOAD] Preloading process attempt finished.');
    }
}

async function loadPersonFromData(personDataToDisplay, category = null) {
    const personLabelForLogs = personDataToDisplay?.personLabel?.value || 'No data or no label';
    console.log(`[LOAD_PERSON] loadPersonFromData called for person: ${personLabelForLogs}`);
    
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');
    const circularProgressContainer = document.getElementById('circular-progress-container');

    personImage.onload = null;
    personImage.onerror = null;

    let currentPersonCandidate = personDataToDisplay; 
    let successfullyLoadedImage = false;
    let imageLoadPathDetail = "unknown"; 
    let gaLoadSource = "unknown"; 

    const hasCompletePreload = Boolean(
        preloadedPersonContainer && 
        preloadedPersonContainer.data && 
        preloadedPersonContainer.data.person &&
        currentPersonCandidate && currentPersonCandidate.person && 
        preloadedPersonContainer.data.person.person.value === currentPersonCandidate.person.value &&
        preloadedPersonContainer.imageElement && 
        preloadedPersonContainer.imageElement.complete && 
        preloadedPersonContainer.proxyUrl
    );

    if (gameMode === 'closed') {
        overlay.classList.remove('hidden'); 
        personImage.style.opacity = '0';    
        personImage.style.visibility = 'hidden';
        console.log('[LOAD_PERSON_SETUP] Closed Mode: Overlay ON, Image Opacity 0');
    } else { 
        overlay.classList.add('hidden');    
        personImage.style.opacity = '';     
        personImage.style.visibility = '';
        console.log('[LOAD_PERSON_SETUP] Open Mode: Overlay OFF');
    }

    if (!hasCompletePreload) {
        personImage.classList.remove('loaded');
        if (circularProgressContainer) {
            circularProgressContainer.classList.remove('hidden');
            circularProgressContainer.setAttribute('aria-valuenow', '0');
            const cpBar = document.getElementById('circular-progress-bar');
            if (cpBar) cpBar.style.strokeDashoffset = 100;
        }
    }

    const progressPromise = simulateImageProgress(hasCompletePreload ? 150 : 500);

    if (hasCompletePreload) {
        console.log(`[LOAD_PERSON] Attempting to use PRELOADED and COMPLETE image for: ${currentPersonCandidate.personLabel.value}`);
        const preloadedProxyUrl = preloadedPersonContainer.proxyUrl;
        
        await new Promise((resolvePreloadAssign) => {
            let isPreloadAssignDone = false;
            const assignTimeout = setTimeout(() => {
                if (isPreloadAssignDone) return;
                isPreloadAssignDone = true;
                personImage.onload = null;
                personImage.onerror = null;
                console.warn(`[LOAD_PERSON_PRELOAD_ASSIGN_TIMEOUT] Assigning preloaded image src timed out for ${currentPersonCandidate.personLabel.value}. Fallback to fetch.`);
                preloadedPersonContainer = null;
                imageLoadPathDetail = "preload_assign_timeout_fallback_to_fetch";
                resolvePreloadAssign();
            }, 5000);

            const onAssignSuccess = () => {
                if (isPreloadAssignDone) return;
                isPreloadAssignDone = true;
                clearTimeout(assignTimeout);
                personImage.onload = null;
                personImage.onerror = null;
                if (gameMode === 'closed') {
                    personImage.style.opacity = '0';
                    personImage.style.visibility = 'hidden';
                } else {
                    personImage.style.opacity = '';
                    personImage.style.visibility = '';
                }
                personImage.classList.add('loaded');
                if (circularProgressContainer) {
                    circularProgressContainer.classList.add('hidden');
                }
                
                console.log(`[LOAD_PERSON_PRELOAD_ASSIGN_SUCCESS] Assigned preloaded image to display: ${preloadedProxyUrl}`);
                successfullyLoadedImage = true;
                imageLoadPathDetail = "preload_assigned_successfully";
                gaLoadSource = "preload_success";
                resolvePreloadAssign();
            };

            const onAssignError = () => {
                if (isPreloadAssignDone) return;
                isPreloadAssignDone = true;
                clearTimeout(assignTimeout);
                personImage.onload = null;
                personImage.onerror = null;
                personImage.style.opacity = ''; 
                console.warn(`[LOAD_PERSON_PRELOAD_ASSIGN_FAIL] Error assigning preloaded image src: ${preloadedProxyUrl} for ${currentPersonCandidate.personLabel.value}. Fallback to fresh fetch.`);
                preloadedPersonContainer = null; 
                imageLoadPathDetail = "preload_assign_failed_fallback_to_fetch";
                resolvePreloadAssign(); 
            };

            personImage.onload = onAssignSuccess;
            personImage.onerror = onAssignError;
            personImage.src = preloadedProxyUrl;

            if ((personImage.complete && personImage.naturalWidth > 0) || 
                (preloadedPersonContainer && preloadedPersonContainer.imageElement && preloadedPersonContainer.imageElement.complete && preloadedPersonContainer.imageElement.naturalWidth > 0)) {
                onAssignSuccess();
            }
        });
    } else if (preloadedPersonContainer && 
        preloadedPersonContainer.data &&
        preloadedPersonContainer.data.person &&
        currentPersonCandidate && currentPersonCandidate.person && 
        preloadedPersonContainer.data.person.person.value === currentPersonCandidate.person.value) {
        console.warn(`[LOAD_PERSON_PRELOAD_WARN] Preloaded data for ${currentPersonCandidate.personLabel.value}, but imageElement not complete or proxyUrl missing. Falling back to fetch.`);
        preloadedPersonContainer = null;
        imageLoadPathDetail = "fetch_due_to_incomplete_preload";
    } else {
        imageLoadPathDetail = "fetch_no_preload_match";
    }
    
    if (!successfullyLoadedImage) {
        console.log(`[LOAD_PERSON] Proceeding with standard fetch for ${currentPersonCandidate?.personLabel?.value || 'unknown person'}. Reason: ${imageLoadPathDetail}`);
        imageLoadPathDetail = imageLoadPathDetail.includes("fallback") || imageLoadPathDetail.includes("incomplete_preload") ? imageLoadPathDetail + "_active_fetch" : "direct_fetch_active";
        gaLoadSource = "fetch_direct"; 

        let attempts = 0;
        const maxImageLoadAttempts = 3;

        while (attempts < maxImageLoadAttempts && !successfullyLoadedImage) {
            attempts++;
            console.log(`[LOAD_PERSON_ATTEMPT] Image fetch attempt ${attempts}/${maxImageLoadAttempts} for person: ${currentPersonCandidate?.personLabel?.value || 'Unknown Candidate'}`);
            try {
                if (!currentPersonCandidate || !currentPersonCandidate.image || !currentPersonCandidate.image.value || !currentPersonCandidate.personLabel || !currentPersonCandidate.personLabel.value) {
                     console.warn(`[LOAD_PERSON_WARN] Invalid person data or missing image/label for fetch attempt ${attempts}. Fetching new person. Candidate:`, currentPersonCandidate);
                     currentPersonCandidate = await fetchPersonData(true, category); 
                     if (!currentPersonCandidate || !currentPersonCandidate.image || !currentPersonCandidate.image.value || !currentPersonCandidate.personLabel || !currentPersonCandidate.personLabel.value) {
                        console.warn(`[LOAD_PERSON_WARN] Newly fetched currentPersonCandidate is also invalid for attempt ${attempts}. Continuing to next attempt or failure.`);
                     }
                     continue; 
                }

                let commonsUrl;
                if (currentPersonCandidate.isOfflineFallback || currentPersonCandidate.isCatalogPerson) {
                    commonsUrl = currentPersonCandidate.image.value;
                } else {
                    const fileName = decodeURIComponent(currentPersonCandidate.image.value.split('/').pop());
                    commonsUrl = await getCommonsImageUrl(fileName);
                    if (!commonsUrl) {
                        console.warn(`[LOAD_PERSON_WARN] No Commons URL for ${fileName}. Fetching new person.`);
                        currentPersonCandidate = await fetchPersonData(true, category);
                        continue;
                    }
                }
                
                if (settings.excludeBlackAndWhite) {
                    const isBW = await isBlackAndWhite(commonsUrl);
                    if (isBW) {
                        console.warn(`[LOAD_PERSON_BW_SKIP] Skipping B&W image for ${currentPersonCandidate.personLabel.value}. Fetching new person.`);
                        currentPersonCandidate = await fetchPersonData(true, category);
                        continue;
                    }
                }
                
                await loadImageWithFallback(commonsUrl, personImage); 
                successfullyLoadedImage = true; 
                imageLoadPathDetail = imageLoadPathDetail.includes("fallback") || imageLoadPathDetail.includes("incomplete_preload") ? "fetch_after_preload_issue_success" : "direct_fetch_success";
                if (imageLoadPathDetail === "fetch_after_preload_issue_success") gaLoadSource = "fetch_after_preload_fail";
                else gaLoadSource = "fetch_direct";
                
                console.log(`[LOAD_PERSON_FETCH_SUCCESS] Image successfully fetched for ${currentPersonCandidate.personLabel.value}. Path: ${imageLoadPathDetail}`);
                break; 

            } catch (error) { 
                console.error(`[LOAD_PERSON_ERROR] Error processing person/image (fetch attempt ${attempts}/${maxImageLoadAttempts}): ${error.message}`);
                removePersonFromCache(currentPersonCandidate);
                if (attempts < maxImageLoadAttempts) {
                     console.log("[LOAD_PERSON_RETRY_FETCH] Fetching a new person due to error in current slot.");
                     currentPersonCandidate = await fetchPersonData(true, category); 
                     personImage.classList.remove('loaded');
                     if (gameMode === 'closed') {
                         personImage.style.opacity = '0';
                     } else {
                         personImage.style.opacity = '';
                     }
                     if (circularProgressContainer) {
                         circularProgressContainer.classList.remove('hidden');
                         const cpBarSub = document.getElementById('circular-progress-bar');
                         if (cpBarSub) cpBarSub.style.strokeDashoffset = 100;
                     }
                } else {
                    console.error(`[LOAD_PERSON_FAILURE] Max image fetch attempts (${maxImageLoadAttempts}) reached for this slot. No image loaded.`);
                }
            }
        }
    }

    await progressPromise; 
    updateProgressBar(100, true); 

    if (!successfullyLoadedImage) {
        console.error(`[LOAD_PERSON_CRITICAL_IMAGE_FAIL] Could not load image for slot (intended for ${personLabelForLogs}) after all attempts. Path: ${imageLoadPathDetail}. Handling error.`);
        handleError(); 
        startPreloadNextAvailablePerson(); 
        return;
    }

    if (!currentPersonCandidate || 
        !currentPersonCandidate.personLabel || !currentPersonCandidate.personLabel.value ||
        !currentPersonCandidate.gender || !currentPersonCandidate.gender.value ||
        !currentPersonCandidate.birthDate || !currentPersonCandidate.birthDate.value ||
        !currentPersonCandidate.person || !currentPersonCandidate.person.value) {
        console.error("[LOAD_PERSON_CRITICAL] Final currentPersonCandidate is invalid before assigning to currentPerson. Handling error. Candidate:", currentPersonCandidate);
        handleError(); 
        startPreloadNextAvailablePerson();
        return;
    }

    const isCandidateFallback = Boolean(currentPersonCandidate.isOfflineFallback || currentPersonCandidate.dataSource === 'Offline Catalog');
    currentPerson = { 
        personLabel: currentPersonCandidate.personLabel,
        gender: currentPersonCandidate.gender,
        deathDate: currentPersonCandidate.deathDate,
        birthDate: currentPersonCandidate.birthDate,
        person: currentPersonCandidate.person,
        dataSource: isCandidateFallback ? 'Offline Catalog' : (currentPersonCandidate.dataSource || 'Wikidata Live')
    };
    if (isCandidateFallback) {
        updateDataSourceIndicator('fallback', 'Offline Backup');
    } else {
        updateDataSourceIndicator('healthy', currentPerson.dataSource);
    }
    console.log(`[LOAD_PERSON_SUCCESS] Successfully loaded person: ${currentPerson.personLabel.value} (Source: ${currentPerson.dataSource}, Path: ${imageLoadPathDetail})`);
    updateUI(currentPerson); 
    
    currentAttemptStartTime = Date.now(); 
    localStorage.setItem('currentAttemptStartTime', currentAttemptStartTime.toString());
    console.log(`[STATE_CHANGE] Attempt start time set to ${currentAttemptStartTime} for person: ${currentPerson.personLabel.value}. Saved to localStorage.`);

    sendGAEvent('photo_loaded', {
        person_id: currentPerson.person.value.split('/').pop(),
        person_name: currentPerson.personLabel.value,
        new_language: selectedLanguage, // Changed from new_lang
        game_mode: gameMode,
        load_source: gaLoadSource, 
        load_path_detail: imageLoadPathDetail 
    });
    
    if (preloadedPersonContainer && 
        preloadedPersonContainer.data && 
        preloadedPersonContainer.data.person &&
        currentPersonCandidate && currentPersonCandidate.person && 
        preloadedPersonContainer.data.person.person.value === currentPersonCandidate.person.value) {
        console.log(`[PRELOAD_CONSUMED_OR_INVALIDATED] Preload data for ${currentPersonCandidate.personLabel.value} is now cleared as it's either used or failed assign.`);
        preloadedPersonContainer = null;
    }
    startPreloadNextAvailablePerson(); 
}


function updateUI(personToDisplay) { 
    console.log('[UI_UPDATE] updateUI called for person:', personToDisplay && personToDisplay.personLabel && personToDisplay.personLabel.value ? personToDisplay.personLabel.value : 'No person');
    const personDetails = document.getElementById('person-details');
    const texts = translations[selectedLanguage];
    const personImage = document.getElementById('person-image');
    
    requestAnimationFrame(() => {
        if (personToDisplay && personToDisplay.personLabel && personToDisplay.personLabel.value && personToDisplay.gender && personToDisplay.gender.value) {
             const genderText = personToDisplay.gender.value.split('/').pop() === 'Q6581097' ? texts.male : texts.female;
             const statusText = personToDisplay.deathDate ? texts.deceased : texts.alive; 
             const dateLocales = {
                 uk: 'uk-UA',
                 ru: 'ru-RU',
                 en: 'en-US',
                 de: 'de-DE',
                 fr: 'fr-FR',
                 es: 'es-ES',
                 zh: 'zh-CN',
                 it: 'it-IT',
                 alien: 'en-GB'
             };
             const currentLocale = dateLocales[selectedLanguage] || 'en-US';
             const birthText = personToDisplay.birthDate && personToDisplay.birthDate.value ? new Date(personToDisplay.birthDate.value).toLocaleDateString(currentLocale) : texts.unknown;
             const deathDateVal = personToDisplay.deathDate ? personToDisplay.deathDate.value : null;
             const deathText = deathDateVal ? `, ${texts.death}: ${new Date(deathDateVal).toLocaleDateString(currentLocale)}` : '';
             personDetails.textContent = `${personToDisplay.personLabel.value}, ${genderText}, ${statusText}, ${texts.birth}: ${birthText}${deathText}`;
             personImage.alt = personToDisplay.personLabel.value;
        } else {
            personDetails.textContent = texts.unknown;
            personImage.alt = texts.imageDisplayAlt || 'Image of person'; 
        }

        const nextPersonBtn = document.getElementById('next-person');
        if (nextPersonBtn) {
            if (hasChecked && currentAttempts < maxAttempts) {
                nextPersonBtn.style.display = 'block';
                nextPersonBtn.textContent = texts.nextPerson; 
            } else {
                nextPersonBtn.style.display = 'none';
            }
        }
        
        updateModeVisibility(); 
        if (personToDisplay) { 
             loadedPhotos++;
             const cpContainer = document.getElementById('circular-progress-container');
             if (cpContainer) {
                 cpContainer.classList.add('hidden');
             }
        }
        logPhotoStatus();
    });
}

function handleError() {
    console.error('[HANDLE_ERROR] An error occurred. Displaying placeholder and error message.');
    updateDataSourceIndicator('error', 'Image/Data Error');
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');
    const circularProgressContainer = document.getElementById('circular-progress-container');
    const texts = translations[selectedLanguage];
    const personInfo = document.getElementById('person-info');


    preloadedPersonContainer = null;
    isCurrentlyPreloading = false; 
    console.log('[PRELOAD_RESET] Preload state reset due to error.');


    requestAnimationFrame(() => {
        personImage.src = FALLBACK_PLACEHOLDER_URI; 
        personImage.alt = texts.errorLoadingImage || 'Error loading image'; 
        personImage.classList.add('loaded'); 
        personImage.style.opacity = ''; 
        
        personInfo.style.display = 'none'; 
        personInfo.classList.remove('correct', 'incorrect');
        const statusBadge = document.getElementById('person-status-badge');
        if (statusBadge) statusBadge.classList.add('hidden');
        updateUI(null); 

        if (gameMode === 'closed') {
            overlay.classList.remove('hidden'); 
        } else {
            overlay.classList.add('hidden'); 
        }
        
        circularProgressContainer.classList.remove('hidden'); 
        
        currentAttemptStartTime = null; 
        localStorage.removeItem('currentAttemptStartTime');
        console.log('[STATE_CHANGE] currentAttemptStartTime cleared due to error. Removed from localStorage.');

        setTimeout(() => {
            circularProgressContainer.classList.add('hidden');
        }, 2000); 

        if (currentAttempts < maxAttempts) {
            console.log('[HANDLE_ERROR_RETRY] Scheduling automatic attempt to load new photo in 3 seconds.');
            setTimeout(() => {
                console.log('[HANDLE_ERROR_RETRY] Retrying to load next person due to previous error.');
                loadNextPerson('error_fallback'); 
            }, 3000);
        } else {
            console.log('[HANDLE_ERROR] Game is over, no automatic retry for new photo.');
        }

        logPhotoStatus();
    });
}

async function loadSession() {
    const startTime = performance.now();
    console.log('[LOAD_SESSION] Starting dynamic background streaming session...');
    sessionList = [];
    
    preloadedPersonContainer = null;
    isCurrentlyPreloading = false;
    console.log('[PRELOAD_RESET] Preload state reset for new session.');

    updateProgressBar(0, false); 

    currentStreamId++;
    const streamId = currentStreamId;
    isStreamingActive = true;

    // Define categories to interleave
    const categories = [
        { gender: 'male', status: 'alive' },
        { gender: 'female', status: 'alive' },
        { gender: 'male', status: 'deceased' },
        { gender: 'female', status: 'deceased' }
    ];

    const targets = [];
    const peoplePerCategory = Math.ceil(settings.sessionPeople / categories.length);
    for (let j = 0; j < peoplePerCategory; j++) {
        for (const cat of categories) {
            if (targets.length < settings.sessionPeople) {
                targets.push(cat);
            }
        }
    }

    console.log(`[STREAM_QUEUE] Scheduled highly interleaved queue of ${targets.length} candidates. Starting parallel stream worker pool.`);

    let targetIndex = 0;
    let activePromisesCount = 0;
    let loadedCount = 0;
    let firstPersonRendered = false;

    async function launchNextFetch() {
        if (streamId !== currentStreamId) {
            console.log(`[STREAM_QUEUE] Stream ID mismatch (${currentStreamId} vs task ${streamId}). Halting active worker.`);
            return;
        }

        if (targetIndex >= targets.length || loadedCount >= settings.sessionPeople) {
            if (activePromisesCount === 0 && isStreamingActive) {
                isStreamingActive = false;
                console.log(`[STREAM_QUEUE_COMPLETE] Background stream queue finished. Cached or loaded ${loadedCount} total items.`);
                updateProgressBar(100, false);
                console.log(`[LOAD_SESSION_TIMING] Total stream load elapsed (since launch): ${(performance.now() - startTime).toFixed(0)}ms`);
            }
            return;
        }

        const category = targets[targetIndex++];
        activePromisesCount++;

        try {
            // Defensive delay to prevent browser thread freeze on rapid consecutive cache hits
            await new Promise(resolve => setTimeout(resolve, 50));
            const personBinding = await fetchPersonData(false, category);
            
            if (streamId !== currentStreamId) {
                console.log('[STREAM_QUEUE] Stream ID changed mid-fetch. Discarded entry.');
                return;
            }

            if (personBinding && 
                personBinding.personLabel && personBinding.personLabel.value &&
                personBinding.image && personBinding.image.value &&
                personBinding.gender && personBinding.gender.value &&
                personBinding.birthDate && personBinding.birthDate.value &&
                personBinding.person && personBinding.person.value) {
                
                sessionList.push({ person: personBinding, category: category });
                loadedCount++;
                console.log(`[STREAM_QUEUE] Appended streamed candidate #${loadedCount}: ${personBinding.personLabel.value} (${category.gender}-${category.status})`);
                
                // Update visual thin horizontal progress bar correctly based on loadedCount
                const progressPercentage = (loadedCount / settings.sessionPeople) * 100;
                updateProgressBar(progressPercentage, false);

                // If this is the FIRST person loaded under this session, render them to the screen IMMEDIATELY
                if (!currentPerson && !firstPersonRendered) {
                    firstPersonRendered = true;
                    const firstEntry = sessionList.shift();
                    console.log(`[STREAM_QUEUE_FIRST_ENTRY] Rendering first candidate instantly on screen: ${firstEntry.person.personLabel.value}`);
                    
                    hasChecked = false;
                    await loadPersonFromData(firstEntry.person, firstEntry.category);
                    
                    requestAnimationFrame(() => {
                        document.getElementById('male-btn').disabled = false;
                        document.getElementById('female-btn').disabled = false;
                        document.getElementById('alive-btn').disabled = false;
                        document.getElementById('dead-btn').disabled = false;
                        document.getElementById('next-person').style.display = 'none';
                        document.getElementById('next-photo').disabled = false; 
                        updateCheckButtonState();
                        console.log('[STREAM_QUEUE_UI] Screen initialized with first streaming candidate.');
                    });
                } else {
                    // Preload next image if idle and list has targets
                    if (!isCurrentlyPreloading && !preloadedPersonContainer && sessionList.length > 0) {
                        startPreloadNextAvailablePerson();
                    }
                }
            } else {
                console.warn('[STREAM_QUEUE_WARN] fetchPersonData returned invalid details or null bind.');
            }
        } catch (error) {
            console.error(`[STREAM_QUEUE_ERROR] Fetch error details: ${error.message}`);
        } finally {
            activePromisesCount--;
            // Recursively execute the next queue item in the next tick of the event loop to yield to the browser
            setTimeout(() => {
                launchNextFetch();
            }, 10);
        }
    }

    // Launch 2 background workers in parallel
    launchNextFetch();
    launchNextFetch();
}

async function loadNextPerson(triggerButton = 'unknown') {
    console.log(`[LOAD_NEXT_PERSON] Called. Trigger: ${triggerButton}. Current attempts: ${currentAttempts}/${maxAttempts}`);
    sendGAEvent('next_photo_requested', {
        session_id: currentSessionId, 
        trigger_button: triggerButton,
        new_language: selectedLanguage, // Changed from new_lang
        game_mode: gameMode,
        remaining_in_session: sessionList.length,
        is_preloading: isCurrentlyPreloading,
        preloaded_person_name: preloadedPersonContainer && preloadedPersonContainer.data && preloadedPersonContainer.data.person && preloadedPersonContainer.data.person.personLabel ? preloadedPersonContainer.data.person.personLabel.value : null
    });

    if (currentAttempts >= maxAttempts) {
        console.log('[LOAD_NEXT_PERSON] Max attempts reached. Cannot load next person.');
        updateNewGameButtonPosition(); 
        return;
    }

    if (sessionList.length === 0) {
        if (isStreamingActive) {
            console.log('[LOAD_NEXT_PERSON] Session list is empty but background streaming is still active. Showing spinner and waiting for stream item...');
            const circularProgressContainer = document.getElementById('circular-progress-container');
            if (circularProgressContainer) {
                circularProgressContainer.classList.remove('hidden');
                updateProgressBar(50, true);
            }

            let checkCount = 0;
            while (sessionList.length === 0 && isStreamingActive && checkCount < 30) {
                await new Promise(resolve => setTimeout(resolve, 500));
                checkCount++;
                console.log(`[LOAD_NEXT_PERSON_POLL] Polling for next person from stream queue (attempt ${checkCount}/30)...`);
            }

            if (circularProgressContainer) {
                circularProgressContainer.classList.add('hidden');
            }

            if (sessionList.length === 0) {
                console.warn('[LOAD_NEXT_PERSON_TIMEOUT] Timed out waiting for streaming item. Initiating a fresh session load.');
                currentPerson = null;
                await loadSession();
                return;
            } else {
                console.log('[LOAD_NEXT_PERSON] Successfully received next person from background streaming queue!');
            }
        } else {
            console.log('[LOAD_NEXT_PERSON] Session list is empty and streaming is inactive. Loading new session.');
            currentPerson = null;
            await loadSession(); 
            return; 
        }
    }

    userGenderGuess = null;
    userStatusGuess = null;
    hasChecked = false;
    console.log('[LOAD_NEXT_PERSON] User guesses and checked flag reset.');
    document.getElementById('male-btn').classList.remove('active');
    document.getElementById('female-btn').classList.remove('active');
    document.getElementById('alive-btn').classList.remove('active');
    document.getElementById('dead-btn').classList.remove('active');
    
    const personInfo = document.getElementById('person-info');
    personInfo.style.display = 'none';
    personInfo.classList.remove('correct', 'incorrect');
    const statusBadge = document.getElementById('person-status-badge');
    if (statusBadge) statusBadge.classList.add('hidden');

    const nextEntry = sessionList.shift(); 
    if (nextEntry && nextEntry.person) { 
        console.log(`[LOAD_NEXT_PERSON] Loading next person from session: ${nextEntry.person.personLabel.value}`);
        await loadPersonFromData(nextEntry.person, nextEntry.category);
    } else {
        console.warn("[LOAD_NEXT_PERSON_WARN] Encountered null or invalid person entry in session list, trying next or reloading session.");
        await loadNextPerson(triggerButton); 
        return;
    }
    requestAnimationFrame(() => {
        updateCheckButtonState(); 
        document.getElementById('male-btn').disabled = false;
        document.getElementById('female-btn').disabled = false;
        document.getElementById('alive-btn').disabled = false;
        document.getElementById('dead-btn').disabled = false;
        document.getElementById('next-person').style.display = 'none'; 
        document.getElementById('next-photo').disabled = currentAttempts >= maxAttempts; 
         console.log('[LOAD_NEXT_PERSON_UI] UI reset for the next person.');
    });
}

function startNewGame() {
    console.log('[GAME_FLOW] Starting new game...');
    if (currentAttempts === 0 && currentSessionId) {
        consecutiveEmptyNewGames++;
        console.log(`[ANTI_SPAM] Empty game restart count: ${consecutiveEmptyNewGames}`);
    } else {
        consecutiveEmptyNewGames = 0;
    }
    currentAttempts = 0;
    totalGuesses = 0; 
    successfulGuesses = 0;
    failedGuesses = 0;
    guessResultsHistory = []; 
    attemptDurations = [];
    currentPerson = null; 
    loadedPhotos = 0; 
    console.log('[GAME_FLOW] Game statistics and current person reset.');

    preloadedPersonContainer = null;
    isCurrentlyPreloading = false;
    console.log('[PRELOAD_RESET] Preload state reset for new game.');

    if (sessionShownNames && sessionShownNames.size >= 80) {
        console.log(`[CATALOG_RESET] sessionShownNames reached ${sessionShownNames.size}, clearing to allow fresh cycling.`);
        sessionShownNames.clear();
    }

    const timestampSeconds = Math.floor(Date.now() / 1000);
    const randomNumber = Math.floor(Math.random() * 10000);
    currentSessionId = `${timestampSeconds}_${randomNumber}`;
    localStorage.setItem('currentSessionId', currentSessionId);
    console.log(`[GAME_FLOW] New game session ID: ${currentSessionId}. Saved to localStorage.`);
    
    currentAttemptStartTime = null; 
    localStorage.removeItem('currentAttemptStartTime');
    console.log('[GAME_FLOW] currentAttemptStartTime reset and removed from localStorage.');


    localStorage.setItem('currentAttempts', currentAttempts.toString());
    localStorage.setItem('totalGuesses', totalGuesses.toString());
    localStorage.setItem('successfulGuesses', successfulGuesses.toString());
    localStorage.setItem('failedGuesses', failedGuesses.toString());
    localStorage.setItem('guessResultsHistory', JSON.stringify(guessResultsHistory));
    localStorage.setItem('attemptDurations', JSON.stringify(attemptDurations));
    console.log('[GAME_FLOW] Reset game state saved to localStorage.');

    // Get player's local time string
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    
    const timezoneOffsetMinutes = now.getTimezoneOffset(); // e.g., for UTC+3, this is -180. For UTC-4, this is 240.
    const offsetSign = timezoneOffsetMinutes <= 0 ? '+' : '-'; // Invert sign for display
    const offsetHoursAbs = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
    const offsetMinutesAbs = Math.abs(timezoneOffsetMinutes) % 60;
    
    const playerLocalStartTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC${offsetSign}${offsetHoursAbs.toString().padStart(2, '0')}:${offsetMinutesAbs.toString().padStart(2, '0')}`;
    console.log(`[GAME_FLOW] Player local start time for GA: ${playerLocalStartTimeString}`);
    gameSessionStartTime = Date.now();
    sessionGuessedPersons = [];
    sessionFindNewClicks = 0;
    currentSessionLocalStartTime = playerLocalStartTimeString;

    sendGAEvent('new_game_started', {
        new_language: selectedLanguage, 
        game_mode: gameMode,
        session_id: currentSessionId,
        player_local_start_time: playerLocalStartTimeString,
        current_theme: isNight ? 'night' : 'day' // Added current_theme
    });

    document.getElementById('stats-attempts').textContent = `0/${maxAttempts}`;
    document.getElementById('stats-success').textContent = '0';
    document.getElementById('stats-failure').textContent = '0';
    document.getElementById('stats-success-rate').textContent = '0%';
    updateGuessHistoryDisplay(); 
    
    const personInfo = document.getElementById('person-info');
    personInfo.style.display = 'none'; 
    personInfo.classList.remove('correct', 'incorrect');
    const statusBadge = document.getElementById('person-status-badge');
    if (statusBadge) statusBadge.classList.add('hidden');
    updateUI(null); 
    console.log('[GAME_FLOW_UI] Statistics display and general UI reset.');

    updateNewGameButtonPosition(); 

    userGenderGuess = null;
    userStatusGuess = null;
    hasChecked = false;
    document.getElementById('male-btn').classList.remove('active');
    document.getElementById('female-btn').classList.remove('active');
    document.getElementById('alive-btn').classList.remove('active');
    document.getElementById('dead-btn').classList.remove('active');
    document.getElementById('male-btn').disabled = false;
    document.getElementById('female-btn').disabled = false;
    document.getElementById('alive-btn').disabled = false;
    document.getElementById('dead-btn').disabled = false;
    updateCheckButtonState(); 
    document.getElementById('next-person').style.display = 'none';
    document.getElementById('next-photo').disabled = false; 
    
    userManuallyToggledControls = false;
    setTopControlsCollapsed(false, false);

    loadSession(); 
    console.log('[GAME_FLOW] New game started successfully.');
}

document.getElementById('next-photo').addEventListener('click', () => {
    autoCollapseControlsOnGameplay();
    sessionFindNewClicks++;
    console.log('[USER_ACTION] "Find New Photo" button clicked.');
    if (isCurrentlyPreloading) {
        console.log("[PRELOAD_CANCEL] User clicked 'Find New Photo', cancelling current preload if any.");
        isCurrentlyPreloading = false; 
    }
    preloadedPersonContainer = null; 
    loadNextPerson('find_new');
});

document.getElementById('male-btn').addEventListener('click', () => {
    autoCollapseControlsOnGameplay();
    userGenderGuess = 'male';
    document.getElementById('male-btn').classList.add('active');
    document.getElementById('female-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('[USER_ACTION] Gender selected: Male');
});

document.getElementById('female-btn').addEventListener('click', () => {
    autoCollapseControlsOnGameplay();
    userGenderGuess = 'female';
    document.getElementById('female-btn').classList.add('active');
    document.getElementById('male-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('[USER_ACTION] Gender selected: Female');
});

document.getElementById('alive-btn').addEventListener('click', () => {
    autoCollapseControlsOnGameplay();
    userStatusGuess = 'alive';
    document.getElementById('alive-btn').classList.add('active');
    document.getElementById('dead-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('[USER_ACTION] Status selected: Alive');
});

document.getElementById('dead-btn').addEventListener('click', () => {
    autoCollapseControlsOnGameplay();
    userStatusGuess = 'dead';
    document.getElementById('dead-btn').classList.add('active');
    document.getElementById('alive-btn').classList.remove('active');
    updateCheckButtonState();
    console.log('[USER_ACTION] Status selected: Dead');
});

document.getElementById('check-btn').addEventListener('click', () => {
    autoCollapseControlsOnGameplay();
    console.log('[USER_ACTION] "Check" button clicked.');
    if (!currentPerson || !currentPerson.personLabel || !currentPerson.personLabel.value) { 
        console.warn('[CHECK_ACTION_WARN] No current person or person label to check against.');
        return;
    }
    if (hasChecked) {
        console.warn('[CHECK_ACTION_WARN] Already checked for this person.');
        return;
    }
    
    const endTime = Date.now();

    hasChecked = true;
    consecutiveEmptyNewGames = 0;
    currentAttempts++;
    totalGuesses++; 
    console.log(`[GAME_STATE] Attempt ${currentAttempts}/${maxAttempts}. Total guesses this game: ${totalGuesses}.`);
    
    const actualGender = currentPerson.gender.value.split('/').pop() === 'Q6581097' ? 'male' : 'female';
    const actualStatus = currentPerson.deathDate ? 'dead' : 'alive'; 
    console.log(`[CHECK_ACTION] Actual person - Gender: ${actualGender}, Status: ${actualStatus}`);

    const isGenderCorrect = gameMode === 'closed' ? userGenderGuess === actualGender : true;
    const isStatusCorrect = userStatusGuess === actualStatus;
    const isOverallCorrect = isGenderCorrect && isStatusCorrect;
    console.log(`[CHECK_ACTION] Guess result - Gender Correct: ${isGenderCorrect} (Mode: ${gameMode}), Status Correct: ${isStatusCorrect}, Overall Correct: ${isOverallCorrect}`);
    
    guessResultsHistory.push(isOverallCorrect ? 1 : 0);
    if (currentPerson && currentPerson.personLabel && currentPerson.personLabel.value) {
        sessionGuessedPersons.push(currentPerson.personLabel.value);
    }
    localStorage.setItem('guessResultsHistory', JSON.stringify(guessResultsHistory));
    console.log(`[STATE_CHANGE] Guess result (${isOverallCorrect ? 1 : 0}) added to success/fail history. Saved to localStorage. History:`, guessResultsHistory);
    
    let time_for_attempt_seconds = 0;
    if (currentAttemptStartTime) {
        const time_for_attempt_ms = endTime - currentAttemptStartTime;
        time_for_attempt_seconds = Math.round(time_for_attempt_ms / 1000);
        console.log(`[CHECK_ACTION_TIME] Time for this attempt: ${time_for_attempt_seconds} seconds (${time_for_attempt_ms}ms). Start: ${currentAttemptStartTime}, End: ${endTime}`);
    } else {
        console.warn("[CHECK_ACTION_TIME_WARN] currentAttemptStartTime was not set for this attempt. Time for attempt will be 0.");
    }
    
    attemptDurations.push(time_for_attempt_seconds);
    localStorage.setItem('attemptDurations', JSON.stringify(attemptDurations));
    console.log(`[STATE_CHANGE] Attempt duration ${time_for_attempt_seconds}s added. Saved to localStorage. Durations:`, attemptDurations);


    if (currentSessionId) {
        const attemptCompletedParams = {
            session_id: currentSessionId,
            attempt_number_in_session: currentAttempts, 
            time_for_attempt_seconds: time_for_attempt_seconds,
            attempt_result: isOverallCorrect ? 1 : 0,
            game_mode: gameMode,
            new_language: selectedLanguage  // Changed from new_lang
        };
        sendGAEvent('attempt_completed', attemptCompletedParams);
    } else {
        console.warn("[GA_EVENT_WARN] currentSessionId is not set. Skipping 'attempt_completed' GA event.");
    }

    const personInfo = document.getElementById('person-info');
    const personImage = document.getElementById('person-image');
    const overlay = document.getElementById('overlay');

    sendGAEvent('guess_made', {
        person_id: currentPerson.person.value.split('/').pop(),
        person_name: currentPerson.personLabel.value,
        game_mode: gameMode,
        guessed_gender: gameMode === 'closed' ? userGenderGuess : undefined,
        actual_gender: actualGender,
        guessed_status: userStatusGuess,
        actual_status: actualStatus,
        is_gender_correct: gameMode === 'closed' ? (isGenderCorrect ? 1 : 0) : undefined,
        is_status_correct: isStatusCorrect ? 1 : 0,
        is_overall_correct: isOverallCorrect ? 1 : 0,
        attempt_number: currentAttempts,
        new_language: selectedLanguage // Changed from new_lang
    });
    
    requestAnimationFrame(() => {
        personInfo.style.display = 'block'; 
        personInfo.classList.remove('correct', 'incorrect'); 

        const statusBadge = document.getElementById('person-status-badge');
        const statusTextEl = document.getElementById('person-status-text');
        const statusIconEl = statusBadge ? statusBadge.querySelector('.material-symbols-outlined') : null;

        if (gameMode === 'closed') {
            overlay.classList.add('hidden'); 
            personImage.classList.add('loaded'); 
            personImage.style.opacity = ''; 
            console.log('[CHECK_UI] Mode CLOSED: Revealing image.');
        }
        if (isOverallCorrect) {
            personInfo.classList.add('correct');
            successfulGuesses++;
            console.log('[CHECK_UI] Guess was CORRECT.');
            if (statusBadge && statusTextEl) {
                statusBadge.classList.remove('hidden', 'bg-spirit-violet/10', 'text-spirit-violet', 'border-spirit-violet/20');
                statusBadge.classList.add('bg-neon-cyan/15', 'text-neon-cyan', 'border-neon-cyan/30');
                statusTextEl.textContent = translations[selectedLanguage].correctGuess || 'CORRECT';
                if (statusIconEl) statusIconEl.textContent = 'check_circle';
            }
        } else {
            personInfo.classList.add('incorrect');
            failedGuesses++;
            console.log('[CHECK_UI] Guess was INCORRECT.');
            if (statusBadge && statusTextEl) {
                statusBadge.classList.remove('hidden', 'bg-neon-cyan/15', 'text-neon-cyan', 'border-neon-cyan/30');
                statusBadge.classList.add('bg-spirit-violet/15', 'text-spirit-violet', 'border-spirit-violet/30');
                statusTextEl.textContent = translations[selectedLanguage].incorrectGuess || 'INCORRECT';
                if (statusIconEl) statusIconEl.textContent = 'cancel';
            }
        }
        document.getElementById('next-person').style.display = 'block'; 
        
        document.getElementById('male-btn').disabled = true; 
        document.getElementById('female-btn').disabled = true;
        document.getElementById('alive-btn').disabled = true; 
        document.getElementById('dead-btn').disabled = true;


        document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
        document.getElementById('stats-success').textContent = successfulGuesses;
        document.getElementById('stats-failure').textContent = failedGuesses;
        const successRate = totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0;
        document.getElementById('stats-success-rate').textContent = `${successRate}%`;
        updateGuessHistoryDisplay(); 
        console.log('[CHECK_UI] Stats display updated.');
        
        localStorage.setItem('currentAttempts', currentAttempts.toString());
        localStorage.setItem('totalGuesses', totalGuesses.toString()); 
        localStorage.setItem('successfulGuesses', successfulGuesses.toString());
        localStorage.setItem('failedGuesses', failedGuesses.toString());
        console.log('[STATE_CHANGE] Game stats after check saved to localStorage.');

        updateUI(currentPerson); 
        updateNewGameButtonPosition(); 

        if (currentAttempts >= maxAttempts) {
            console.log('[GAME_OVER] All attempts used. Game over.');
            document.getElementById('next-photo').disabled = true; 
            document.getElementById('next-person').style.display = 'none'; 
            sendGAEvent('game_over', {
                total_attempts: maxAttempts,
                successful_guesses: successfulGuesses,
                failed_guesses: failedGuesses,
                success_rate: `${successRate}%`,
                new_language: selectedLanguage, // Changed from new_lang
                game_mode: gameMode,
                session_id: currentSessionId,
                current_theme: isNight ? 'night' : 'day' 
            });
            localStorage.removeItem('currentSessionId');
            localStorage.removeItem('currentAttemptStartTime');
            currentSessionId = null;
            currentAttemptStartTime = null;
            console.log('[STATE_CHANGE] Game over: currentSessionId and currentAttemptStartTime cleared from localStorage.');
        }
    });
});

document.getElementById('next-person').addEventListener('click', () => {
    autoCollapseControlsOnGameplay();
    console.log('[USER_ACTION] "Next Photo" (after guess) button clicked.');
     requestAnimationFrame(() => { 
        document.getElementById('male-btn').disabled = false; 
        document.getElementById('female-btn').disabled = false;
        document.getElementById('alive-btn').disabled = false; 
        document.getElementById('dead-btn').disabled = false;
    });
    loadNextPerson('next_after_check');
});

document.getElementById('new-game').addEventListener('click', () => {
    console.log('[USER_ACTION] "New Game" button clicked.');
    reportProgressOnLeave('new_game_reset');
    startNewGame();
});

function reportProgressOnLeave(trigger) {
    if (currentSessionId && currentAttempts > 0 && currentAttempts < maxAttempts) {
        console.log(`[LIFE_CYCLE_REPORT] Unfinished game detected inside ${trigger}. Attempts/max: ${currentAttempts}/${maxAttempts}. Reporting to GA...`);
        sendGAEvent('game_unfinished_report', {
            session_id: currentSessionId,
            current_attempts: currentAttempts,
            total_attempts_max: maxAttempts,
            successful_guesses: successfulGuesses,
            failed_guesses: failedGuesses,
            success_rate: `${totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0}%`,
            new_language: selectedLanguage,
            game_mode: gameMode,
            current_theme: isNight ? 'night' : 'day',
            trigger_event: trigger,
            platform: detectClientPlatform()
        });
    } else {
        console.log(`[LIFE_CYCLE_REPORT] No unfinished game report needed inside ${trigger} callback (attempts active: ${currentAttempts > 0 && currentAttempts < maxAttempts}).`);
    }
}

// Setup Help / Instructions Modal dialog event listeners
function initHelpModal() {
    console.log('[HELP_MODAL_SETUP] Initializing Help modal event listeners...');
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelpBtn = document.getElementById('close-help-btn');
    const gotItHelpBtn = document.getElementById('got-it-help-btn');

    if (!helpBtn || !helpModal) {
        console.warn('[HELP_MODAL_WARN] help-btn or help-modal missing from DOM.');
        return;
    }

    const openModal = () => {
        helpModal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        console.log('[HELP_MODAL] Opened help modal.');
        sendGAEvent('help_modal_opened', { language: selectedLanguage });
    };

    const closeModal = () => {
        helpModal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        console.log('[HELP_MODAL] Closed help modal.');
    };

    helpBtn.addEventListener('click', openModal);

    if (closeHelpBtn) {
        closeHelpBtn.addEventListener('click', closeModal);
    }

    if (gotItHelpBtn) {
        gotItHelpBtn.addEventListener('click', closeModal);
    }

    // Close on backdrop click
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            closeModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) {
            closeModal();
        }
    });
}

// Setup diagnostics event listeners
function setupDiagnosticsPanel() {
    console.log('[DIAG_SETUP] Initializing diagnostics panel listeners...');
    
    const diagPanel = document.getElementById('diagnostics-panel');
    if (diagPanel) {
        diagPanel.style.display = window.diagnosticsEnabled ? 'block' : 'none';
    }

    // Google Sheets Webhook Configuration UI
    const sheetsInput = document.getElementById('sheets-webhook-url-input');
    const saveSheetsBtn = document.getElementById('save-sheets-webhook-btn');
    const testSheetsBtn = document.getElementById('test-sheets-webhook-btn');
    const sheetsStatus = document.getElementById('sheets-webhook-status');
    const sheetsIndicator = document.getElementById('sheets-webhook-indicator');

    const updateWebhookIndicator = (hasUrl) => {
        if (sheetsIndicator) {
            sheetsIndicator.className = hasUrl ? 'w-2 h-2 rounded-full bg-neon-cyan shadow-[0_0_8px_rgba(0,240,255,0.6)]' : 'w-2 h-2 rounded-full bg-on-surface-variant/40';
            sheetsIndicator.title = hasUrl ? 'Google Sheets Webhook Connected' : 'Webhook not configured';
        }
    };

    if (sheetsInput) {
        sheetsInput.value = getActiveSheetsWebhookUrl();
        updateWebhookIndicator(Boolean(getActiveSheetsWebhookUrl()));
    }

    if (saveSheetsBtn && sheetsInput) {
        saveSheetsBtn.addEventListener('click', () => {
            const val = sheetsInput.value.trim();
            googleSheetsWebhookUrl = val;
            if (val) {
                localStorage.setItem('google_sheets_webhook_url', val);
                if (isCloudStorageSupported()) {
                    try {
                        window.Telegram.WebApp.CloudStorage.setItem('google_sheets_webhook_url', val);
                    } catch (e) {}
                }
                updateWebhookIndicator(true);
                if (sheetsStatus) {
                    sheetsStatus.textContent = 'Збережено! Webhook активний ✅';
                    sheetsStatus.classList.remove('hidden', 'text-error');
                    sheetsStatus.classList.add('text-neon-cyan');
                }
                console.log('[SHEETS_CONFIG] Saved Google Sheets Webhook URL:', val);
            } else {
                localStorage.removeItem('google_sheets_webhook_url');
                if (isCloudStorageSupported()) {
                    try {
                        window.Telegram.WebApp.CloudStorage.removeItem('google_sheets_webhook_url');
                    } catch (e) {}
                }
                googleSheetsWebhookUrl = BUILTIN_GOOGLE_SHEETS_WEBHOOK_URL;
                if (sheetsInput) sheetsInput.value = BUILTIN_GOOGLE_SHEETS_WEBHOOK_URL;
                updateWebhookIndicator(true);
                if (sheetsStatus) {
                    sheetsStatus.textContent = 'Відновлено стандартний Webhook URL ✅';
                    sheetsStatus.classList.remove('hidden', 'text-error');
                    sheetsStatus.classList.add('text-neon-cyan');
                }
                console.log('[SHEETS_CONFIG] Reverted to default built-in Google Sheets Webhook URL.');
            }
            setTimeout(() => {
                if (sheetsStatus) sheetsStatus.textContent = '';
            }, 3000);
        });
    }

    if (testSheetsBtn) {
        testSheetsBtn.addEventListener('click', () => {
            const currentUrl = (sheetsInput ? sheetsInput.value.trim() : '') || getActiveSheetsWebhookUrl();
            if (!currentUrl) {
                if (sheetsStatus) {
                    sheetsStatus.textContent = 'Вставте URL перед тестом! ❌';
                    sheetsStatus.classList.remove('hidden', 'text-neon-cyan');
                    sheetsStatus.classList.add('text-error');
                }
                return;
            }
            if (sheetsStatus) {
                sheetsStatus.textContent = 'Надсилання тестового рядка... ⏳';
                sheetsStatus.classList.remove('hidden', 'text-error');
                sheetsStatus.classList.add('text-spirit-violet');
            }
            const isSummary = sheetsLoggingMode === 'summary';
            sendToGoogleSheet('test_connection', {
                person_name: isSummary ? 'Тестова гра (Test Session)' : 'Тестовий Персонаж (Test Person)',
                person_id: 'Q999999',
                guessed_gender: 'male',
                actual_gender: 'male',
                guessed_status: 'alive',
                actual_status: 'alive',
                is_overall_correct: 1,
                time_for_attempt_seconds: 3,
                attempt_number: isSummary ? '10/10' : 1,
                successful_guesses: 8,
                failed_guesses: 2,
                success_rate: '80%'
            });
            setTimeout(() => {
                if (sheetsStatus) {
                    sheetsStatus.textContent = isSummary 
                        ? 'Тестовий підсумок надіслано! 🚀 (1 рядок)' 
                        : 'Тестову подію надіслано! Перевірте Google Таблицю 🚀';
                    sheetsStatus.classList.remove('text-spirit-violet');
                    sheetsStatus.classList.add('text-neon-cyan');
                }
            }, 800);
            setTimeout(() => {
                if (sheetsStatus) sheetsStatus.textContent = '';
            }, 4000);
        });
    }

    // Google Sheets Mode toggle buttons (Summary vs Detailed)
    const sheetsModeSummaryBtn = document.getElementById('sheets-mode-summary-btn');
    const sheetsModeDetailedBtn = document.getElementById('sheets-mode-detailed-btn');

    function updateSheetsModeButtons() {
        if (!sheetsModeSummaryBtn || !sheetsModeDetailedBtn) return;
        const isSummary = sheetsLoggingMode === 'summary';
        const activeClass = 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/40 shadow-[0_0_8px_rgba(0,240,255,0.2)]';
        const inactiveClass = 'text-on-surface-variant hover:text-on-surface border-transparent';

        if (isSummary) {
            sheetsModeSummaryBtn.className = `px-2 py-0.5 rounded text-[9px] font-bold transition-all border ${activeClass}`;
            sheetsModeDetailedBtn.className = `px-2 py-0.5 rounded text-[9px] font-bold transition-all border ${inactiveClass}`;
        } else {
            sheetsModeSummaryBtn.className = `px-2 py-0.5 rounded text-[9px] font-bold transition-all border ${inactiveClass}`;
            sheetsModeDetailedBtn.className = `px-2 py-0.5 rounded text-[9px] font-bold transition-all border ${activeClass}`;
        }
    }

    if (sheetsModeSummaryBtn) {
        sheetsModeSummaryBtn.addEventListener('click', () => {
            sheetsLoggingMode = 'summary';
            try {
                localStorage.setItem('sheets_logging_mode', 'summary');
            } catch (e) {}
            updateSheetsModeButtons();
            console.log('[SHEETS_MODE] Switched Google Sheets logging mode to: SUMMARY (1 game = 1 row)');
            if (sheetsStatus) {
                sheetsStatus.textContent = 'Режим: 1 гра = 1 рядок 📊';
                sheetsStatus.classList.remove('hidden', 'text-error', 'text-spirit-violet');
                sheetsStatus.classList.add('text-neon-cyan');
                setTimeout(() => { if (sheetsStatus) sheetsStatus.textContent = ''; }, 2500);
            }
        });
    }

    if (sheetsModeDetailedBtn) {
        sheetsModeDetailedBtn.addEventListener('click', () => {
            sheetsLoggingMode = 'detailed';
            try {
                localStorage.setItem('sheets_logging_mode', 'detailed');
            } catch (e) {}
            updateSheetsModeButtons();
            console.log('[SHEETS_MODE] Switched Google Sheets logging mode to: DETAILED (all micro-events logged)');
            if (sheetsStatus) {
                sheetsStatus.textContent = 'Режим: Усі події ⚙️';
                sheetsStatus.classList.remove('hidden', 'text-error');
                sheetsStatus.classList.add('text-spirit-violet');
                setTimeout(() => { if (sheetsStatus) sheetsStatus.textContent = ''; }, 2500);
            }
        });
    }

    updateSheetsModeButtons();

    const runDiagBtn = document.getElementById('run-diag-btn');
    if (runDiagBtn) {
        runDiagBtn.addEventListener('click', () => {
            runSystemDiagnostics();
        });
    }

    const forceReloadBtn = document.getElementById('force-reload-btn');
    if (forceReloadBtn) {
        forceReloadBtn.addEventListener('click', () => {
            console.log('[DIAG] Force Reload triggered by user. Clearing cache and reloading...');
            try {
                localStorage.removeItem('wikidataCache');
                localStorage.removeItem('rgbHslCache');
                localStorage.removeItem('appLogs_persistent');
            } catch (e) {}
            const url = new URL(window.location.href);
            url.searchParams.set('cache_bust', Date.now().toString());
            window.location.replace(url.toString());
        });
    }

    const clearBtn = document.getElementById('clear-logs-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            window.appLogs = [];
            try {
                localStorage.removeItem('appLogs_persistent');
            } catch (e) {}
            const debugPre = document.getElementById('debug-log-output');
            if (debugPre) {
                debugPre.textContent = 'Logs cleared.';
            }
            console.log('[DIAG] Logs cleared by user.');
        });
    }

    const copyBtn = document.getElementById('copy-logs-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const logsText = window.appLogs.join('\n');
            navigator.clipboard.writeText(logsText).then(() => {
                const originalText = copyBtn.textContent;
                const copiedLabels = {
                    uk: 'Скопійовано! ✅',
                    ru: 'Скопировано! ✅',
                    en: 'Copied! ✅',
                    de: 'Kopiert! ✅',
                    fr: 'Copié ! ✅',
                    es: '¡Copiado! ✅',
                    zh: '已复制！ ✅',
                    it: 'Copiato! ✅',
                    alien: '✓ ⊸⍟⊸'
                };
                copyBtn.textContent = copiedLabels[selectedLanguage] || copiedLabels.en;
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 1500);
                console.log('[DIAG] Logs copied to clipboard.');
            }).catch(err => {
                console.error('[DIAG_ERROR] Failed to copy logs:', err);
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Failed! ❌';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 1500);
            });
        });
    }

    // Version badge 10 clicks toggling
    const versionBadge = document.getElementById('app-version-badge');
    if (versionBadge) {
        let clicksCount = 0;
        let lastClickTime = 0;
        versionBadge.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastClickTime > 3000) {
                clicksCount = 0;
            }
            clicksCount++;
            lastClickTime = now;

            if (clicksCount >= 10) {
                clicksCount = 0;
                window.diagnosticsEnabled = !window.diagnosticsEnabled;
                localStorage.setItem('diagnostics_enabled', window.diagnosticsEnabled ? 'true' : 'false');
                
                if (diagPanel) {
                    diagPanel.style.display = window.diagnosticsEnabled ? 'block' : 'none';
                }

                let currentVersion = APP_VERSION_FALLBACK;

                if (window.diagnosticsEnabled) {
                    runSystemDiagnostics();
                    console.log('[SYSTEM] Diagnostics and logs ENABLED via secret code.');
                    
                    const diagEnabledMsgs = {
                        uk: `Діагностика увімкнена! 📊 (v${currentVersion})`,
                        ru: `Диагностика включена! 📊 (v${currentVersion})`,
                        en: `Diagnostics enabled! 📊 (v${currentVersion})`,
                        de: `Diagnose aktiviert! 📊 (v${currentVersion})`,
                        fr: `Diagnostic activé ! 📊 (v${currentVersion})`,
                        es: `¡Diagnóstico activado! 📊 (v${currentVersion})`,
                        zh: `诊断已启用！ 📊 (v${currentVersion})`,
                        it: `Diagnostica abilitata! 📊 (v${currentVersion})`,
                        alien: `⊸⍟⊸ 📊 (v${currentVersion})`
                    };
                    versionBadge.textContent = diagEnabledMsgs[selectedLanguage] || diagEnabledMsgs.en;
                    setTimeout(() => {
                        updateLanguage();
                    }, 2000);
                } else {
                    window.appLogs = [];
                    try {
                        localStorage.removeItem('appLogs_persistent');
                    } catch (e) {}
                    console.log('[SYSTEM] Diagnostics and logs DISABLED.');
                    
                    // Immediately show the version without any "diagnostics disabled" text
                    updateLanguage();
                }
            }
        });
    }
}

const initApp = () => {
    console.log('[WINDOW_ONLOAD] Page loaded. Initializing application state.');

    if (window.Telegram && window.Telegram.WebApp) {
        try {
            window.Telegram.WebApp.ready(); 
            const tgUser = window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user;
            let hasUserName = false;
            if (tgUser) {
                if (tgUser.id) {
                    telegramUserId = tgUser.id.toString();
                    console.log(`[TELEGRAM_INIT] Telegram User ID: ${telegramUserId}`);
                    if (typeof gtag === 'function') {
                        gtag('set', 'user_id', anonymizeUserId(telegramUserId));
                    }
                } else {
                    console.log('[TELEGRAM_INIT] Telegram User ID missing.');
                }

                if (tgUser.first_name && tgUser.last_name) {
                    telegramUserName = `${tgUser.first_name} ${tgUser.last_name}`;
                } else if (tgUser.first_name) {
                    telegramUserName = tgUser.first_name;
                } else if (tgUser.username) {
                    telegramUserName = tgUser.username;
                }
                
                if (telegramUserName) {
                    hasUserName = true;
                    console.log(`[TELEGRAM_INIT] Telegram User Name: ${telegramUserName}`);
                } else {
                     console.log('[TELEGRAM_INIT] Telegram User Name (first/last/username) not available.');
                }
                sendGAEvent('telegram_user_identified', { 
                    t_user_id_available: !!telegramUserId,
                    t_user_name_available: hasUserName 
                });
            } else {
                console.log('[TELEGRAM_INIT] Telegram user data not available.');
            }
        } catch (e) {
            console.error('[TELEGRAM_INIT_ERROR] Error initializing Telegram WebApp or accessing user data:', e);
        }
    } else {
        console.log('[TELEGRAM_INIT] Telegram WebApp script not loaded or not in Telegram environment.');
    }
    
    // Refresh all global state variables from localStorage after potential pre-load from Telegram CloudStorage
    isNight = localStorage.getItem('theme') !== 'day';
    selectedLanguage = localStorage.getItem('language') || 'uk';
    if (!translations[selectedLanguage]) {
        selectedLanguage = 'uk';
    }
    gameMode = localStorage.getItem('mode') || 'open';
    if (gameMode !== 'open' && gameMode !== 'closed') {
        gameMode = 'open';
    }
    totalGuesses = parseInt(localStorage.getItem('totalGuesses')) || 0;
    successfulGuesses = parseInt(localStorage.getItem('successfulGuesses')) || 0;
    failedGuesses = parseInt(localStorage.getItem('failedGuesses')) || 0;
    currentAttempts = parseInt(localStorage.getItem('currentAttempts')) || 0;

    newGameBtn = document.getElementById('new-game');
    initialNewGameContainer = document.getElementById('new-game-initial-location');
    gameOverNewGameContainer = document.getElementById('new-game-over-location');
    console.log('[WINDOW_ONLOAD] New Game button containers initialized.');

    currentSessionId = localStorage.getItem('currentSessionId');
    const storedAttemptStartTime = localStorage.getItem('currentAttemptStartTime');
    if (storedAttemptStartTime) {
        currentAttemptStartTime = parseInt(storedAttemptStartTime, 10);
    }
    guessResultsHistory = safeParse('guessResultsHistory', []);
    attemptDurations = safeParse('attemptDurations', []);
    console.log(`[WINDOW_ONLOAD_RESTORE] Restored from localStorage - Session ID: ${currentSessionId}, Attempt Start Time: ${currentAttemptStartTime}, Guess Results History: ${guessResultsHistory}, Attempt Durations: ${attemptDurations}`);


    const isFirstLaunchOrReset = localStorage.getItem('currentAttempts') === null;
    console.log(`[WINDOW_ONLOAD] Is first launch or reset: ${isFirstLaunchOrReset}`);
    
    const personInfoOnLoad = document.getElementById('person-info');
    if (personInfoOnLoad) {
        personInfoOnLoad.style.display = 'none'; 
        personInfoOnLoad.classList.remove('correct', 'incorrect'); 
    }
    const statusBadge = document.getElementById('person-status-badge');
    if (statusBadge) statusBadge.classList.add('hidden');

    if (isFirstLaunchOrReset) {
        console.log("[WINDOW_ONLOAD] First launch or reset detected. Initializing a new game.");
        updateLanguage(); 
        startNewGame(); 
        updateNewGameButtonPosition(); 
    } else {
        console.log("[WINDOW_ONLOAD] Resuming existing game state.");
        updateLanguage(); 
        
        if (currentAttempts >= maxAttempts) {
            console.log("[WINDOW_ONLOAD_GAMEOVER] Game was previously over. UI reflects game over state.");
            document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
            document.getElementById('stats-success').textContent = successfulGuesses;
            document.getElementById('stats-failure').textContent = failedGuesses;
            const successRate = totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0;
            document.getElementById('stats-success-rate').textContent = `${successRate}%`;
            
            document.getElementById('next-photo').disabled = true;
            document.getElementById('next-person').style.display = 'none';
            
            if (currentSessionId || currentAttemptStartTime) {
                console.warn("[WINDOW_ONLOAD_GAMEOVER_CLEANUP] Game was over, but session ID or start time found in localStorage. Clearing them now.");
                localStorage.removeItem('currentSessionId');
                localStorage.removeItem('currentAttemptStartTime');
                currentSessionId = null;
                currentAttemptStartTime = null;
            }
            preloadedPersonContainer = null;
            isCurrentlyPreloading = false;
            console.log("[WINDOW_ONLOAD_GAMEOVER] Press 'New Game' to start.");
        } else {
            console.log("[WINDOW_ONLOAD_RESUME] Resuming active game. Attempts:", currentAttempts);
            document.getElementById('stats-attempts').textContent = `${currentAttempts}/${maxAttempts}`;
            document.getElementById('stats-success').textContent = successfulGuesses;
            document.getElementById('stats-failure').textContent = failedGuesses;
            const successRate = totalGuesses > 0 ? Math.round((successfulGuesses / totalGuesses) * 100) : 0;
            document.getElementById('stats-success-rate').textContent = `${successRate}%`;
            
            if (!currentSessionId && currentAttempts > 0 && currentAttempts < maxAttempts) {
                console.warn("[WINDOW_ONLOAD_RESUME_WARN] Resuming game, but currentSessionId is missing from localStorage. It will be generated on the next new game. GA events for ongoing attempts might miss session_id.");
            }

            if (!currentPerson) { 
                console.log("[WINDOW_ONLOAD_RESUME] currentPerson is null. Loading session data to continue/start.");
                preloadedPersonContainer = null;
                isCurrentlyPreloading = false;
                loadSession(); 
            } else {
                 console.log("[WINDOW_ONLOAD_RESUME] currentPerson somehow exists. UI should be updated. Preloading next.");
                 updateUI(currentPerson); 
                 startPreloadNextAvailablePerson(); 
            }
        }
        updateCheckButtonState();
        updateGuessHistoryDisplay(); 
        updateNewGameButtonPosition(true);
    }
    updateTelegramUserInfoDisplay(); 

    // Initialize top controls state based on ongoing game progress or saved preference
    const storedTopControls = localStorage.getItem('top_controls_collapsed');
    if (currentAttempts > 0 && currentAttempts < maxAttempts) {
        // Game is actively underway: collapse to maximize photo and button space
        setTopControlsCollapsed(true, false);
    } else if (storedTopControls !== null) {
        setTopControlsCollapsed(storedTopControls === 'true', true);
    } else {
        setTopControlsCollapsed(false, false);
    }

    // Setup Help / Instructions Modal
    initHelpModal();

    // Setup diagnostics panel and run initial diagnostics if enabled
    setupDiagnosticsPanel();
    if (window.diagnosticsEnabled) {
        runSystemDiagnostics();
    }

    // Setup lifecycle event listeners
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            console.log('[LIFE_CYCLE] Page became hidden (app backgrounded or closed).');
            reportProgressOnLeave('visibility_hidden');
        }
    });

    window.addEventListener('pagehide', () => {
        console.log('[LIFE_CYCLE] pagehide event fired.');
        reportProgressOnLeave('pagehide');
    });

    window.addEventListener('freeze', () => {
        console.log('[LIFE_CYCLE] freeze event fired (app suspended).');
        reportProgressOnLeave('freeze');
    });

    console.log('[WINDOW_ONLOAD] Page load sequence finished.');
};

const bootstrapApp = () => {
    console.log('[BOOTSTRAP] Starting bootstrap sequence...');

    // Guarantee Telegram WebApp is notified of readiness and expanded immediately
    if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
        try {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
            const isAtLeast61 = typeof window.Telegram.WebApp.isVersionAtLeast === 'function' && window.Telegram.WebApp.isVersionAtLeast('6.1');
            if (isAtLeast61 && typeof window.Telegram.WebApp.setHeaderColor === 'function') {
                window.Telegram.WebApp.setHeaderColor('#0A0A0B');
            }
            if (isAtLeast61 && typeof window.Telegram.WebApp.setBackgroundColor === 'function') {
                window.Telegram.WebApp.setBackgroundColor('#0A0A0B');
            }
            console.log('[BOOTSTRAP] Telegram WebApp ready() and expand() signaled.');
        } catch (e) {
            console.warn('[BOOTSTRAP_WARN] Telegram ready() error:', e);
        }
    }

    // Immediately initialize app UI with local storage state so the user never sees a blank screen
    initApp();

    // Asynchronously synchronize with Telegram CloudStorage in background if supported (Bot API 6.9+)
    if (isCloudStorageSupported()) {
        try {
            const keysToLoad = [
                'theme', 'language', 'mode', 'totalGuesses', 
                'successfulGuesses', 'failedGuesses', 'currentAttempts', 
                'guessResultsHistory', 'attemptDurations', 'currentSessionId', 
                'currentAttemptStartTime', 'top_controls_collapsed'
            ];
            
            window.Telegram.WebApp.CloudStorage.getItems(keysToLoad, (err, result) => {
                if (err) {
                    console.warn('[BOOTSTRAP_WARN] Background Telegram CloudStorage sync failed:', err);
                } else if (result) {
                    console.log('[BOOTSTRAP] Background loaded keys from Telegram CloudStorage:', result);
                    let hasSignificantChange = false;
                    for (const key of keysToLoad) {
                        if (result[key] !== undefined && result[key] !== null && result[key] !== '') {
                            const currentVal = localStorage.getItem(key);
                            if (currentVal !== result[key]) {
                                localStorage.setInMemoryValue(key, result[key]);
                                if (key === 'language' || key === 'theme' || key === 'mode') {
                                    hasSignificantChange = true;
                                }
                            }
                        }
                    }
                    if (hasSignificantChange) {
                        updateLanguage();
                    }
                }
            });
        } catch (e) {
            console.warn('[BOOTSTRAP_WARN] Background CloudStorage exception:', e);
        }
    }
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    bootstrapApp();
} else {
    window.addEventListener('DOMContentLoaded', bootstrapApp);
}
