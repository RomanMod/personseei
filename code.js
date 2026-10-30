/**
 * ============================================================================
 * PersonSeeI - Google Sheets Analytics & Real-Time Webhook Engine
 * Version: 2.3.8
 * 
 * Supports TWO dedicated sheets (tabs) in Google Spreadsheet:
 * 1. «Общая»       - Clean session summaries (1 game = 1 row) with stats,
 *                    success rates, attempt history, and duration.
 * 2. «Подробности» - Full chronological log of all micro-events (clicks,
 *                    guesses, photo loads, Wikidata IDs, user agents).
 * ============================================================================
 */

const DEBUG = false; // Set to true to enable detailed console logs in Apps Script Execution view

function logger(message) {
  if (DEBUG) {
    Logger.log(message);
  }
}

const MAX_GAME_ATTEMPTS = 10;
const SECURITY_TOKEN = "ipersonsee_safe_2026";

// Column Headers for Sheet 1: «Общая» (Summary / Overview)
const SUMMARY_HEADERS = [
  'Статус',
  'Telegram ID',
  'Имя игрока',
  'Режим',
  'Попытки',
  'Успешно',
  'Неуспешно',
  '% Успеха',
  'Язык',
  'Тема',
  'История Попыток (из GA4)',
  'Время начала',
  'Локальное время',
  'Кол-во событий',
  'Длительность',
  'Новые фото (клики)',
  'Активное время'
];

// Column Headers for Sheet 2: «Подробности» (Detailed Micro-Events)
const DETAILS_HEADERS = [
  'Дата UTC',
  'Локальное время',
  'Часовой пояс',
  'Платформа',
  'Язык устройства',
  'Язык Telegram',
  'Экран',
  'Событие',
  'Telegram ID',
  'Имя игрока',
  'ID сессии',
  'Персонаж',
  'Wikidata ID',
  'Пол (выбор/факт)',
  'Статус (выбор/факт)',
  'Результат (1/0)',
  'Время ответа (сек)',
  'Попытка №',
  '% успеха',
  'Язык игры',
  'Режим',
  'Агент / Браузер'
];

/**
 * Ensures a sheet exists and has formatted, frozen headers.
 */
function getOrCreateSheet(spreadsheet, sheetName, headers, headerBgColor) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    try {
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground(headerBgColor || '#1b5e20');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    } catch (e) {
      logger('Header styling notice: ' + e.message);
    }
  }
  return sheet;
}

/**
 * Format milliseconds to readable string HH:MM:SS or Dд HH:MM:SS
 */
function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) return '0:00';

  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  seconds %= 60;
  minutes %= 60;
  hours %= 24;

  let result = "";
  if (days > 0) {
    result += `${days}д `;
  }
  if (hours > 0) {
    result += `${String(hours).padStart(2, '0')}:`;
  }
  result += `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return result;
}

/**
 * Функция для мгновенной ручной инициализации вкладок прямо из редактора Apps Script.
 * Выберите "createTabsManually" в верхнем выпадающем меню Apps Script и нажмите кнопку "Выполнить" (Run).
 * Это мгновенно создаст и красиво раскрасит вкладки «Общая» и «Подробности» в вашей таблице!
 */
function createTabsManually() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById('17vi2Ya6CfOhFpQcCKlebCa5-QAPYlCUQ2QdQIf3yzYo');
    } catch (e) {}
  }
  getOrCreateSheet(ss, 'Общая', SUMMARY_HEADERS, '#1b5e20');
  getOrCreateSheet(ss, 'Подробности', DETAILS_HEADERS, '#0b192c');
  Logger.log('Вкладки «Общая» и «Подробности» успешно созданы и отформатированы!');
}

/**
 * Webhook Health Check (GET request)
 */
function doGet(e) {
  const result = {
    status: 'ok',
    app: 'PersonSeeI Trivia Webhook',
    version: '2.3.8',
    sheets: ['Общая', 'Подробности'],
    timestamp: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Real-Time Webhook Handler (POST request from iPersonSee client)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No POST data received'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    let ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      try {
        ss = SpreadsheetApp.openById('17vi2Ya6CfOhFpQcCKlebCa5-QAPYlCUQ2QdQIf3yzYo');
      } catch (err) {}
    }
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No active spreadsheet found'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const eventName = data.event_name || 'unknown';
    const loggingMode = data.logging_mode || 'summary';
    const isSummaryEvent = (eventName === 'game_over' || eventName === 'game_unfinished_report' || eventName === 'test_connection');

    // 1. Ensure sheets exist with designated color themes
    // «Общая» has a polished Forest Green header (#1b5e20)
    // «Подробности» has a Dark Slate Navy header (#0b192c)
    const summarySheet = getOrCreateSheet(ss, 'Общая', SUMMARY_HEADERS, '#1b5e20');
    const detailsSheet = getOrCreateSheet(ss, 'Подробности', DETAILS_HEADERS, '#0b192c');

    // 2. Route to «Общая» (Summary Tab)
    // Triggered when a game finishes, is aborted, or for manual test
    if (isSummaryEvent || data.target_sheet === 'summary' || data.target_sheet === 'both') {
      const statusLabel = data.status || (eventName === 'game_over' ? 'game_completed' : eventName);
      const attemptsStr = data.attempts_display || data.attempt_number || `${MAX_GAME_ATTEMPTS}/${MAX_GAME_ATTEMPTS}`;
      
      const summaryRow = [
        statusLabel,
        data.telegram_user_id || 'anon_guest',
        data.telegram_user_name || 'Player_guest',
        data.game_mode || 'open',
        attemptsStr,
        data.successful_guesses !== undefined ? data.successful_guesses : 0,
        data.failed_guesses !== undefined ? data.failed_guesses : 0,
        data.success_rate || '0%',
        data.language || 'uk',
        data.current_theme || 'night',
        data.attempts_history || data.attempts_history_string || '',
        data.start_time_local || data.timestamp_iso || '',
        data.local_time_string || '',
        data.event_count || 1,
        data.session_duration || data.duration_formatted || '0:00',
        data.find_new_clicks || 0,
        formatDuration((data.active_time_seconds || 0) * 1000)
      ];

      summarySheet.appendRow(summaryRow);
      logger(`Logged summary row for session ${data.session_id} to «Общая»`);
    }

    // 3. Route to «Подробности» (Details Tab)
    // Triggered for all micro-events, or when user has selected 'detailed' logging mode
    if (loggingMode === 'detailed' || data.target_sheet === 'detailed' || data.target_sheet === 'both' || !isSummaryEvent) {
      let genderDisplay = '';
      if (data.guess_gender || data.actual_gender) {
        genderDisplay = `${data.guess_gender || '-'} (факт: ${data.actual_gender || '?'})`;
      }

      let statusDisplay = '';
      if (data.guess_status || data.actual_status) {
        statusDisplay = `${data.guess_status || '-'} (факт: ${data.actual_status || '?'})`;
      }

      const attemptNumberVal = data.attempt_number_in_session !== undefined
        ? data.attempt_number_in_session
        : (data.attempt_number || '');

      const responseTimeSec = data.time_for_attempt_seconds !== undefined
        ? data.time_for_attempt_seconds
        : (data.duration_seconds !== undefined ? data.duration_seconds : '');

      const detailsRow = [
        data.timestamp_iso || new Date().toISOString(),
        data.local_time_string || new Date().toLocaleString(),
        data.timezone || '',
        data.platform || '',
        data.device_lang || '',
        data.telegram_lang || '',
        data.screen_res || '',
        eventName,
        data.telegram_user_id || '',
        data.telegram_user_name || '',
        data.session_id || '',
        data.person_name || '',
        data.person_id || '',
        genderDisplay,
        statusDisplay,
        data.is_correct !== undefined ? data.is_correct : '',
        responseTimeSec,
        attemptNumberVal,
        data.success_rate || '',
        data.language || '',
        data.game_mode || '',
        data.user_agent || ''
      ];

      detailsSheet.appendRow(detailsRow);
      logger(`Logged micro-event "${eventName}" for session ${data.session_id} to «Подробности»`);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      event: eventName,
      mode: loggingMode
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('Critical error in doPost: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Historical Data Extraction from GA4 Analytics API
 * Populates sheet «Общая» with consolidated game metrics.
 */
function getGA4Data() {
  const DATA_START_DATE = '2025-06-14';
  const spreadsheetId = '17vi2Ya6CfOhFpQcCKlebCa5-QAPYlCUQ2QdQIf3yzYo';
  const propertyId = '490577136';
  let sheet;

  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    sheet = getOrCreateSheet(spreadsheet, 'Общая', SUMMARY_HEADERS, '#1b5e20');
  } catch (error) {
    logger(`Ошибка доступа к Google Sheet: ${error.message}, Stack: ${error.stack}`);
    return;
  }
  const token = ScriptApp.getOAuthToken();

  // Helper function to run a report
  function runReport(payload, requestName) {
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const options = {
      method: 'POST',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    if (result.error) {
      logger(`Ошибка GA4 API для запроса "${requestName}": ${JSON.stringify(result.error)}`);
    }
    return result;
  }

  const sessions = {};
  const findNewPhotoClicksCount = {};

  // API Call 1: New Game Started
  const payloadNewGame = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [
      { name: 'customEvent:ga_session_id' },
      { name: 'date' },
      { name: 'customEvent:telegram_user_id' },
      { name: 'customEvent:new_language' },
      { name: 'customEvent:current_theme' },
      { name: 'customEvent:game_mode' },
      { name: 'customEvent:player_local_start_time' }
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'new_game_started' } } }
  };
  const newGameResult = runReport(payloadNewGame, 'NewGameStarted');
  if (newGameResult.error) { logger('Прекращение работы из-за ошибки в NewGameStarted.'); return; }

  if (newGameResult.rows) {
    newGameResult.rows.forEach(row => {
      const dimVals = row.dimensionValues;
      const metricVals = row.metricValues;
      const getDim = (idx, def = '(not set)') => (dimVals[idx] && dimVals[idx].value !== '(not set)' && dimVals[idx].value) ? dimVals[idx].value : def;
      
      const sessionId = getDim(0);
      if (sessionId === '(not set)') return;

      const sessionDate = getDim(1);
      const startTime = parseSessionIdToDate(sessionId);
      const eventCountFromGA = (metricVals && metricVals[0] && metricVals[0].value) ? parseInt(metricVals[0].value, 10) : 0;
      const langFromNewGame = getDim(3);

      if (!sessions[sessionId] || (sessions[sessionId].startTime > startTime)) {
        sessions[sessionId] = {
          sessionId: sessionId,
          startTime: startTime,
          lastEventDate: sessionDate,
          telegramId: getDim(2),
          language: langFromNewGame,
          currentTheme: getDim(4),
          gameMode: getDim(5),
          playerLocalStartTime: getDim(6, '(not set)'),
          eventCount: eventCountFromGA,
          attemptsMade: 0,
          successfulGuesses: 0,
          failedGuesses: 0,
          attemptHistory: [],
          status: 'game_in_progress',
          maxAttempts: MAX_GAME_ATTEMPTS,
          gameOverData: null,
          totalActiveTimeSeconds: 0
        };
      } else {
        if (getDim(2) !== '(not set)') sessions[sessionId].telegramId = getDim(2);
        if (langFromNewGame !== '(not set)') sessions[sessionId].language = langFromNewGame;
        if (getDim(4) !== '(not set)') sessions[sessionId].currentTheme = getDim(4);
        if (getDim(5) !== '(not set)') sessions[sessionId].gameMode = getDim(5);
        if (getDim(6, '(not set)') !== '(not set)') sessions[sessionId].playerLocalStartTime = getDim(6, '(not set)');
        if (sessionDate > sessions[sessionId].lastEventDate) sessions[sessionId].lastEventDate = sessionDate;
        if (eventCountFromGA > 0 && (!sessions[sessionId].eventCount || sessions[sessionId].eventCount === 0) ) {
          sessions[sessionId].eventCount = eventCountFromGA;
        }
      }
    });
  }

  // API Call 2: Attempt Details (Core)
  const payloadAttemptDetails = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [
      { name: 'customEvent:ga_session_id' },
      { name: 'date' },
      { name: 'customEvent:attempt_number_in_session' },
      { name: 'customEvent:attempt_result' },
      { name: 'customEvent:time_for_attempt_seconds' },
      { name: 'customEvent:new_language' },
      { name: 'customEvent:game_mode' }
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'attempt_completed' } } }
  };
  const attemptDetailsResult = runReport(payloadAttemptDetails, 'AttemptDetails');

  if (attemptDetailsResult && attemptDetailsResult.rows) {
    attemptDetailsResult.rows.forEach(row => {
      const dimVals = row.dimensionValues;
      const getDim = (idx, def = '(not set)') => (dimVals[idx] && dimVals[idx].value !== '(not set)' && dimVals[idx].value) ? dimVals[idx].value : def;

      const sessionId = getDim(0);
      if (sessionId === '(not set)') return;

      const eventDate = getDim(1);
      const attemptNumberStr = getDim(2);
      const attemptResultStr = getDim(3);
      const timeForAttemptStr = getDim(4);
      const languageVal = getDim(5);
      const gameModeVal = getDim(6);

      if (!sessions[sessionId]) {
        sessions[sessionId] = initializeMinimalSession(sessionId, eventDate);
      }
      const session = sessions[sessionId];
      if (session.totalActiveTimeSeconds === undefined) session.totalActiveTimeSeconds = 0;
      if (eventDate > session.lastEventDate) session.lastEventDate = eventDate;

      if (session.language === '(not set)' && languageVal !== '(not set)') session.language = languageVal;
      if (session.gameMode === '(not set)' && gameModeVal !== '(not set)') session.gameMode = gameModeVal;
      
      if (attemptNumberStr !== '(not set)' && attemptResultStr !== '(not set)') {
        const attemptNumber = parseInt(attemptNumberStr, 10);
        const attemptResultValue = parseInt(attemptResultStr, 10);

        let attemptEntry = session.attemptHistory.find(a => a.number === attemptNumber);
        if (!attemptEntry && !isNaN(attemptNumber)) {
          attemptEntry = {
            number: attemptNumber,
            result: null, time: null, lang: '(not set)', mode: '(not set)',
            teleId: '(not set)', theme: '(not set)'
          };
          session.attemptHistory.push(attemptEntry);
        }
        
        if (attemptEntry) {
          if (!isNaN(attemptResultValue)) attemptEntry.result = attemptResultValue;
          if (languageVal !== '(not set)') attemptEntry.lang = languageVal;
          if (gameModeVal !== '(not set)') attemptEntry.mode = gameModeVal;

          if (timeForAttemptStr !== '(not set)') {
            const timeForAttemptSec = parseInt(timeForAttemptStr, 10);
            if (!isNaN(timeForAttemptSec) && timeForAttemptSec >= 0) {
              if (attemptEntry.time === null || attemptEntry.time === undefined) {
                session.totalActiveTimeSeconds += timeForAttemptSec;
              }
              attemptEntry.time = timeForAttemptSec;
            }
          }
        }
      }
    });
  }

  // API Call 3: Game Over
  const payloadGameOver = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [
      { name: 'customEvent:ga_session_id' },
      { name: 'date' },
      { name: 'customEvent:new_language' },
      { name: 'customEvent:current_theme' },
      { name: 'customEvent:game_mode' },
      { name: 'customEvent:total_attempts' },
      { name: 'customEvent:successful_guesses' },
      { name: 'customEvent:failed_guesses' }
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'game_over' } } }
  };
  const gameOverResult = runReport(payloadGameOver, 'GameOver');
  
  if (gameOverResult && gameOverResult.rows) {
    gameOverResult.rows.forEach(row => {
      const dimVals = row.dimensionValues;
      const getDim = (idx, def = '(not set)') => (dimVals[idx] && dimVals[idx].value !== '(not set)' && dimVals[idx].value) ? dimVals[idx].value : def;

      const sessionId = getDim(0);
      if (sessionId === '(not set)') return;
      
      const eventDate = getDim(1);
      const langFromGameOver = getDim(2);

      if (!sessions[sessionId]) {
        sessions[sessionId] = initializeMinimalSession(sessionId, eventDate);
      }
      
      const session = sessions[sessionId];
      session.status = 'game_over';
      if (eventDate > session.lastEventDate) session.lastEventDate = eventDate;

      if (langFromGameOver !== '(not set)') session.language = langFromGameOver;
      if (getDim(3) !== '(not set)') session.currentTheme = getDim(3);
      if (getDim(4) !== '(not set)') session.gameMode = getDim(4);
      
      const goTotalAttempts = parseInt(getDim(5), 10);
      const goSuccessfulGuesses = parseInt(getDim(6), 10);
      const goFailedGuesses = parseInt(getDim(7), 10);

      session.gameOverData = {
        total_attempts_go: !isNaN(goTotalAttempts) ? goTotalAttempts : session.maxAttempts,
        successful_guesses_go: !isNaN(goSuccessfulGuesses) ? goSuccessfulGuesses : 0,
        failed_guesses_go: !isNaN(goFailedGuesses) ? goFailedGuesses : 0
      };
      
      session.attemptsMade = session.gameOverData.total_attempts_go;
      session.successfulGuesses = session.gameOverData.successful_guesses_go;
      session.failedGuesses = session.gameOverData.failed_guesses_go;
    });
  }

  // API Call 4: "Find New Photo" Clicks
  const payloadFindNewPhotoClicks = {
    dateRanges: [{ startDate: DATA_START_DATE, endDate: 'today' }],
    dimensions: [{ name: 'customEvent:ga_session_id' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'eventName', stringFilter: { value: 'next_photo_requested' } } },
          { filter: { fieldName: 'customEvent:trigger_button', stringFilter: { value: 'find_new' } } }
        ]
      }
    }
  };
  const findNewPhotoClicksResult = runReport(payloadFindNewPhotoClicks, 'FindNewPhotoClicks');

  if (findNewPhotoClicksResult && findNewPhotoClicksResult.rows) {
    findNewPhotoClicksResult.rows.forEach(row => {
      const dimVals = row.dimensionValues;
      const metricVals = row.metricValues;
      const sessionId = (dimVals[0] && dimVals[0].value !== '(not set)' && dimVals[0].value) ? dimVals[0].value : null;
      const count = (metricVals && metricVals[0] && metricVals[0].value) ? parseInt(metricVals[0].value, 10) : 0;

      if (sessionId && count > 0 && sessions[sessionId]) {
        findNewPhotoClicksCount[sessionId] = (findNewPhotoClicksCount[sessionId] || 0) + count;
      }
    });
  }

  const values = [SUMMARY_HEADERS];

  const sortedSessionIds = Object.keys(sessions).sort((a,b) => {
    const timeA = sessions[a].startTime instanceof Date ? sessions[a].startTime.getTime() : 0;
    const timeB = sessions[b].startTime instanceof Date ? sessions[b].startTime.getTime() : 0;
    return timeB - timeA;
  });

  sortedSessionIds.forEach(sessionId => {
    const session = sessions[sessionId];
    session.attemptHistory.sort((a, b) => a.number - b.number);
    
    let successRateValue = 0;
    if (session.attemptsMade > 0) {
      successRateValue = (session.successfulGuesses / session.attemptsMade);
    } else if (session.status === 'game_over' && session.gameOverData) {
      const goAttempts = session.gameOverData.successful_guesses_go + session.gameOverData.failed_guesses_go;
      if (goAttempts > 0) {
        successRateValue = (session.gameOverData.successful_guesses_go / goAttempts);
      }
    }

    const attemptSequenceDisplay = session.attemptHistory.length > 0 ?
      session.attemptHistory
        .map(attempt => {
          const icon = attempt.result === 1 ? '✅' : (attempt.result === 0 ? '❌' : '❔');
          const timeDisplay = (typeof attempt.time === 'number' && !isNaN(attempt.time)) ? `(${attempt.time}s)` : '(n/a)';
          return `${icon}${timeDisplay}`;
        })
        .join(' ') : 'n/a';
    
    let sessionStartTimeDisplay = 'unknown_time';
    if (session.startTime instanceof Date && !isNaN(session.startTime)) {
      sessionStartTimeDisplay = Utilities.formatDate(session.startTime, Session.getScriptTimeZone(), 'HH:mm:ss dd-MM-yyyy');
    }

    let playerLocalStartTimeDisplay = session.playerLocalStartTime || '(not set)';
    let sessionDurationDisplay = 'n/a';
    if (session.startTime instanceof Date && !isNaN(session.startTime) &&
        session.lastEventDate && typeof session.lastEventDate === 'string' && session.lastEventDate.length === 8) {
      try {
        const endYear = parseInt(session.lastEventDate.substring(0, 4), 10);
        const endMonth = parseInt(session.lastEventDate.substring(4, 6), 10) - 1;
        const endDay = parseInt(session.lastEventDate.substring(6, 8), 10);
        const endDateForCalc = new Date(endYear, endMonth, endDay, 23, 59, 59);

        if (!isNaN(endDateForCalc)) {
          let durationMs = endDateForCalc.getTime() - session.startTime.getTime();
          if (durationMs < 0) durationMs = 0;
          sessionDurationDisplay = formatDuration(durationMs);
        }
      } catch (e) {
        sessionDurationDisplay = 'n/a';
      }
    }
    
    const totalActiveTimeDisplay = formatDuration((session.totalActiveTimeSeconds || 0) * 1000);
    const successRateFormatted = `${Math.round(successRateValue * 100)}%`;
    const pseudoName = session.telegramId !== '(not set)' ? `Player_${session.telegramId.slice(0, 6)}` : 'Player_guest';

    values.push([
      session.status,
      session.telegramId,
      pseudoName,
      session.gameMode,
      `${session.attemptsMade}/${session.maxAttempts}`,
      session.successfulGuesses,
      session.failedGuesses,
      successRateFormatted,
      session.language,
      session.currentTheme,
      attemptSequenceDisplay,
      sessionStartTimeDisplay,
      playerLocalStartTimeDisplay,
      session.eventCount || 0,
      sessionDurationDisplay,
      findNewPhotoClicksCount[session.sessionId] || 0,
      totalActiveTimeDisplay
    ]);
  });

  try {
    sheet.clear();
    SpreadsheetApp.flush();

    if (values.length > 0) {
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
      var headerRange = sheet.getRange(1, 1, 1, values[0].length);
      headerRange.setBackground('#1b5e20');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
  } catch (e) {
    logger(`Ошибка во время записи листа «Общая»: ${e.message}`);
  }
}

function initializeMinimalSession(sessionId, eventDate) {
  return {
    sessionId: sessionId,
    startTime: parseSessionIdToDate(sessionId),
    lastEventDate: eventDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd'),
    telegramId: '(not set)',
    language: '(not set)',
    currentTheme: '(not set)',
    gameMode: '(not set)',
    playerLocalStartTime: '(not set)',
    eventCount: 0,
    attemptsMade: 0,
    successfulGuesses: 0,
    failedGuesses: 0,
    attemptHistory: [],
    status: 'game_in_progress',
    maxAttempts: MAX_GAME_ATTEMPTS,
    gameOverData: null,
    totalActiveTimeSeconds: 0
  };
}

function parseSessionIdToDate(sessionId) {
  try {
    if (!sessionId || typeof sessionId !== 'string') return 'invalid_session_id';
    const parts = sessionId.split('_');
    const timestampSeconds = parseInt(parts[0], 10);
    if (isNaN(timestampSeconds) || timestampSeconds < 946684800 || timestampSeconds > 4102444800) {
      return 'invalid_timestamp';
    }
    return new Date(timestampSeconds * 1000);
  } catch (e) {
    return 'parsing_error';
  }
}

function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'getGA4Data') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('getGA4Data')
    .timeBased()
    .everyDays(1)
    .atHour(1) 
    .inTimezone(Session.getScriptTimeZone())
    .create();
  logger('Триггер установлен на ежедневный запуск в 1:00 ночи');
}
