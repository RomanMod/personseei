/**
 * PersonSeeI - Google Sheets Analytics & Real-Time Webhook Engine
 * Version: 2.4.2
 * 
 * Настройка записи:
 * Новые игры и события теперь добавляются СВЕРХУ (на 2-ю строчку, сразу под шапкой)!
 */

const DEBUG = false;
const MAX_GAME_ATTEMPTS = 10;
const SPREADSHEET_ID = "17vi2Ya6CfOhFpQcCKlebCa5-QAPYlCUQ2QdQIf3yzYo";

// Положение новых записей: 'top' — сверху (строка 2, сразу под шапкой), 'bottom' — снизу (в конец)
const NEW_ROWS_POSITION = 'top';

// Шапка «Общая» (с колонкой «Платформа»)
const SUMMARY_HEADERS = [
  'Статус',
  'Платформа',
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

// Шапка «Подробности»
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
 * Вставка строки данных:
 * Если NEW_ROWS_POSITION === 'top', вставляет строку СВЕРХУ (на 2-ю строчку, сразу под шапкой).
 * Очищает унаследованный стиль шапки (убирает зеленую заливку и белый жирный шрифт).
 */
function addRowToSheet(sheet, rowValues) {
  if (NEW_ROWS_POSITION === 'top') {
    sheet.insertRowAfter(1);
    var targetRange = sheet.getRange(2, 1, 1, rowValues.length);
    targetRange.setValues([rowValues]);
    try {
      targetRange.setBackground(null);
      targetRange.setFontColor('#000000');
      targetRange.setFontWeight('normal');
      targetRange.setFontStyle('normal');
      targetRange.setVerticalAlignment('middle');
    } catch (e) {}
  } else {
    sheet.appendRow(rowValues);
  }
}

/**
 * Запустите эту функцию прямо в Apps Script, чтобы обновить шапки с колонкой «Платформа»!
 */
function createTabsManually() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {}
  }
  getOrCreateSheet(ss, 'Общая', SUMMARY_HEADERS, '#1b5e20');
  getOrCreateSheet(ss, 'Подробности', DETAILS_HEADERS, '#0b192c');
  Logger.log('Шапки успешно обновлены!');
}

function getOrCreateSheet(spreadsheet, sheetName, headers, headerBgColor) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    // Автоматически обновляем первую строку шапки, если добавились новые колонки
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  try {
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground(headerBgColor || '#1b5e20');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  } catch (e) {}
  return sheet;
}

function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) return '0:00';
  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  seconds %= 60; minutes %= 60; hours %= 24;
  let result = "";
  if (days > 0) result += `${days}д `;
  if (hours > 0) result += `${String(hours).padStart(2, '0')}:`;
  result += `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return result;
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    app: 'PersonSeeI Trivia Webhook',
    version: '2.4.4',
    rows_position: NEW_ROWS_POSITION,
    sheets: ['Общая', 'Подробности'],
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No POST data' })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    let ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      try {
        ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      } catch (err) {}
    }

    const eventName = data.event_name || 'unknown';
    const loggingMode = data.logging_mode || 'summary';
    const isSummaryEvent = (eventName === 'game_over' || eventName === 'game_unfinished_report' || eventName === 'test_connection');

    const summarySheet = getOrCreateSheet(ss, 'Общая', SUMMARY_HEADERS, '#1b5e20');
    const detailsSheet = getOrCreateSheet(ss, 'Подробности', DETAILS_HEADERS, '#0b192c');

    // 1. Запись на лист «Общая» (СВЕРХУ на строку 2)
    if (isSummaryEvent || data.target_sheet === 'summary' || data.target_sheet === 'both') {
      const statusLabel = data.status || (eventName === 'game_over' ? 'game_completed' : eventName);
      const attemptsStr = data.attempts_display || data.attempt_number || `${MAX_GAME_ATTEMPTS}/${MAX_GAME_ATTEMPTS}`;
      
      const summaryRow = [
        statusLabel,
        data.platform || 'unknown',
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

      addRowToSheet(summarySheet, summaryRow);
    }

    // 2. Запись на лист «Подробности» (СВЕРХУ на строку 2)
    if (loggingMode === 'detailed' || data.target_sheet === 'detailed' || data.target_sheet === 'both' || !isSummaryEvent) {
      let genderDisplay = (data.guess_gender || data.actual_gender) ? `${data.guess_gender || '-'} (факт: ${data.actual_gender || '?'})` : '';
      let statusDisplay = (data.guess_status || data.actual_status) ? `${data.guess_status || '-'} (факт: ${data.actual_status || '?'})` : '';
      const responseTimeSec = data.time_for_attempt_seconds !== undefined ? data.time_for_attempt_seconds : (data.duration_seconds || '');
      const attemptNum = data.attempt_number_in_session !== undefined ? data.attempt_number_in_session : (data.attempt_number || '');

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
        attemptNum,
        data.success_rate || '',
        data.language || '',
        data.game_mode || '',
        data.user_agent || ''
      ];

      addRowToSheet(detailsSheet, detailsRow);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', event: eventName, position: NEW_ROWS_POSITION })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
