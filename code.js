/**
 * PersonSeeI - Google Sheets Analytics & Real-Time Webhook Engine
 * Version: 2.4.9
 * 
 * Ключевые возможности:
 * 1. 🟢 Яркая изумрудно-зеленая строка-разделитель при нажатии «Новая игра» (new_game_started).
 * 2. 🎨 Уникальный цвет для каждого игрока:
 *    Автоматически генерирует индивидуальный пастельный цвет для каждого Telegram ID.
 *    Когда играют одновременно 2 или больше игроков — их строки четко различаются по цветам.
 * 3. 🏁 Элегантная строка завершения игры (game_over).
 * 4. ✅❌ Четкая подсветка верных (мягкий зеленый) и неверных (мягкий коралловый) ответов.
 * 5. 🚫 Полное устранение унаследованных черных строк (явная установка цвета ячеек).
 */

const DEBUG = false;
const MAX_GAME_ATTEMPTS = 10;
const SPREADSHEET_ID = "17vi2Ya6CfOhFpQcCKlebCa5-QAPYlCUQ2QdQIf3yzYo";

// Положение новых записей: 'top' — сверху (строка 2, сразу под шапкой), 'bottom' — снизу (в конец)
const NEW_ROWS_POSITION = 'top';

// Палитра из 12 гармоничных пастельных оттенков для игроков (с гарантированной контрастностью)
const PLAYER_PALETTE = [
  { bg: '#E3F2FD', text: '#0D47A1', name: 'голубой' },       // 1. Soft Blue
  { bg: '#FFF3E0', text: '#E65100', name: 'персиковый' },     // 2. Soft Peach / Orange
  { bg: '#F3E5F5', text: '#4A148C', name: 'сиреневый' },      // 3. Soft Lilac / Purple
  { bg: '#E0F2F1', text: '#004D40', name: 'мятный' },         // 4. Soft Mint / Teal
  { bg: '#FFFDE7', text: '#F57F17', name: 'кремовый' },       // 5. Soft Lemon / Cream
  { bg: '#FCE4EC', text: '#880E4F', name: 'нежно-розовый' },  // 6. Soft Pink / Rose
  { bg: '#EDE7F6', text: '#311B92', name: 'лавандовый' },     // 7. Lavender
  { bg: '#E0F7FA', text: '#006064', name: 'аквамарин' },      // 8. Pale Ice / Cyan
  { bg: '#FFF8E1', text: '#BF360C', name: 'янтарный' },       // 9. Soft Amber
  { bg: '#FBE9E7', text: '#D84315', name: 'терракотовый' },   // 10. Soft Terracotta
  { bg: '#F1F8E9', text: '#33691E', name: 'фисташковый' },    // 11. Soft Pistachio
  { bg: '#ECEFF1', text: '#263238', name: 'дымчатый' }        // 12. Soft Slate Gray
];

/**
 * Получение персонального стиля для игрока по его Telegram ID
 */
function getPlayerStyle(userId) {
  var str = String(userId || 'player_default');
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  var index = Math.abs(hash) % PLAYER_PALETTE.length;
  return PLAYER_PALETTE[index];
}

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
 * Вставка строки данных с явным форматированием и цветовой схемой.
 * Полностью предотвращает появление темных строк (наследуемых от темной шапки).
 */
function addRowToSheet(sheet, rowValues, options) {
  options = options || {};
  var rowPosition = options.position || NEW_ROWS_POSITION;
  var rowIdx = 2;

  if (rowPosition === 'top') {
    sheet.insertRowAfter(1);
    rowIdx = 2;
  } else {
    sheet.appendRow(rowValues);
    rowIdx = sheet.getLastRow();
  }

  var targetRange = sheet.getRange(rowIdx, 1, 1, rowValues.length);
  if (rowPosition === 'top') {
    targetRange.setValues([rowValues]);
  }

  try {
    var bg = options.backgroundColor || '#FFFFFF';
    var fontColor = options.fontColor || '#111827';
    var fontWeight = options.fontWeight || 'normal';

    // Явно задаем фоновый цвет на всю строку (не оставляем null)
    targetRange.setBackground(bg);
    targetRange.setFontColor(fontColor);
    targetRange.setFontWeight(fontWeight);
    targetRange.setFontStyle('normal');
    targetRange.setVerticalAlignment('middle');

    // Если переданы индивидуальные стили для конкретных колонок (например, Результат 1/0)
    if (options.cellFormats) {
      for (var colKey in options.cellFormats) {
        if (options.cellFormats.hasOwnProperty(colKey)) {
          var colIdx = parseInt(colKey, 10);
          var fmt = options.cellFormats[colKey];
          var cell = sheet.getRange(rowIdx, colIdx);
          if (fmt.backgroundColor) cell.setBackground(fmt.backgroundColor);
          if (fmt.fontColor) cell.setFontColor(fmt.fontColor);
          if (fmt.fontWeight) cell.setFontWeight(fmt.fontWeight);
          if (fmt.horizontalAlignment) cell.setHorizontalAlignment(fmt.horizontalAlignment);
        }
      }
    }
  } catch (e) {
    Logger.log('Formatting error in addRowToSheet: ' + e.toString());
  }
}

/**
 * Запустите эту функцию прямо в Apps Script, чтобы обновить шапки!
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

/**
 * 🎨 Запустите эту функцию прямо в Apps Script, чтобы за 1 секунду
 * АВТОМАТИЧЕСКИ РАСКРАСИТЬ ВСЕ СТАРЫЕ СТРОКИ в таблице по цветам игроков,
 * убрать все темные полосы и выделить правильные (зеленый) и неверные (красный) ответы!
 */
function colorizeExistingRows() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {}
  }
  if (!ss) {
    Logger.log('Таблица не найдена.');
    return;
  }

  // 1. Раскраска листа «Подробности»
  var detailsSheet = ss.getSheetByName('Подробности');
  if (detailsSheet && detailsSheet.getLastRow() > 1) {
    var lastRow = detailsSheet.getLastRow();
    var lastCol = Math.max(detailsSheet.getLastColumn(), DETAILS_HEADERS.length);
    var data = detailsSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    for (var i = 0; i < data.length; i++) {
      var rowIdx = i + 2;
      var row = data[i];
      var eventName = String(row[7] || '').trim(); // Колонка 8: Событие
      var userId = String(row[8] || '').trim();    // Колонка 9: Telegram ID
      var isCorrect = row[15];                     // Колонка 16: Результат (1/0)

      var rowRange = detailsSheet.getRange(rowIdx, 1, 1, lastCol);

      if (eventName === 'new_game_started' || eventName.indexOf('НОВАЯ ИГРА') !== -1) {
        rowRange.setBackground('#2E7D32');
        rowRange.setFontColor('#FFFFFF');
        rowRange.setFontWeight('bold');
      } else if (eventName === 'game_over' || eventName.indexOf('ЗАВЕРШЕНА') !== -1) {
        rowRange.setBackground('#1565C0');
        rowRange.setFontColor('#FFFFFF');
        rowRange.setFontWeight('bold');
      } else {
        var style = getPlayerStyle(userId);
        rowRange.setBackground(style.bg);
        rowRange.setFontColor('#111827');
        rowRange.setFontWeight('normal');

        var resultCell = detailsSheet.getRange(rowIdx, 16);
        if (isCorrect === 1 || isCorrect === '1' || String(isCorrect).indexOf('Верно') !== -1) {
          resultCell.setBackground('#A5D6A7');
          resultCell.setFontColor('#1B5E20');
          resultCell.setFontWeight('bold');
          resultCell.setHorizontalAlignment('center');
        } else if (isCorrect === 0 || isCorrect === '0' || String(isCorrect).indexOf('Неверно') !== -1) {
          resultCell.setBackground('#FFCDD2');
          resultCell.setFontColor('#B71C1C');
          resultCell.setFontWeight('bold');
          resultCell.setHorizontalAlignment('center');
        }
      }
    }
    Logger.log('Лист «Подробности» успешно раскрашен: ' + (lastRow - 1) + ' строк.');
  }

  // 2. Раскраска листа «Общая»
  var summarySheet = ss.getSheetByName('Общая');
  if (summarySheet && summarySheet.getLastRow() > 1) {
    var sLastRow = summarySheet.getLastRow();
    var sLastCol = Math.max(summarySheet.getLastColumn(), SUMMARY_HEADERS.length);
    var sData = summarySheet.getRange(2, 1, sLastRow - 1, sLastCol).getValues();

    for (var j = 0; j < sData.length; j++) {
      var sRowIdx = j + 2;
      var sUserId = String(sData[j][2] || '').trim(); // Колонка 3: Telegram ID
      var sStyle = getPlayerStyle(sUserId);
      var sRange = summarySheet.getRange(sRowIdx, 1, 1, sLastCol);
      sRange.setBackground(sStyle.bg);
      sRange.setFontColor('#111827');
      sRange.setFontWeight('normal');
    }
    Logger.log('Лист «Общая» успешно раскрашен: ' + (sLastRow - 1) + ' строк.');
  }
}

function getOrCreateSheet(spreadsheet, sheetName, headers, headerBgColor) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
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
    version: '2.4.9',
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

    const playerStyle = getPlayerStyle(data.telegram_user_id);

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

      addRowToSheet(summarySheet, summaryRow, {
        backgroundColor: playerStyle.bg,
        fontColor: '#111827',
        fontWeight: 'normal'
      });
    }

    // 2. Запись на лист «Подробности» (СВЕРХУ на строку 2)
    if (loggingMode === 'detailed' || data.target_sheet === 'detailed' || data.target_sheet === 'both' || !isSummaryEvent) {
      let genderDisplay = (data.guess_gender || data.actual_gender) ? `${data.guess_gender || '-'} (факт: ${data.actual_gender || '?'})` : '';
      let statusDisplay = (data.guess_status || data.actual_status) ? `${data.guess_status || '-'} (факт: ${data.actual_status || '?'})` : '';
      const responseTimeSec = data.time_for_attempt_seconds !== undefined ? data.time_for_attempt_seconds : (data.duration_seconds || '');
      const attemptNum = data.attempt_number_in_session !== undefined ? data.attempt_number_in_session : (data.attempt_number || '');

      let eventDisplay = eventName;
      let personNameDisplay = data.person_name || '';
      let resultDisplay = '';

      if (data.is_correct === 1 || data.is_correct === '1') {
        resultDisplay = '1 (Верно)';
      } else if (data.is_correct === 0 || data.is_correct === '0') {
        resultDisplay = '0 (Неверно)';
      } else if (data.is_correct !== undefined && data.is_correct !== '') {
        resultDisplay = String(data.is_correct);
      }

      var rowOptions = {
        backgroundColor: playerStyle.bg,
        fontColor: '#111827',
        fontWeight: 'normal',
        cellFormats: {}
      };

      // 🟢 1. Зелёная строка-разделитель при начале новой игры
      if (eventName === 'new_game_started') {
        eventDisplay = '🟢 НОВАЯ ИГРА';
        personNameDisplay = '🟢 --- СТАРТ НОВОЙ ИГРЫ ---';
        rowOptions.backgroundColor = '#2E7D32'; // Насыщенный изумрудно-зеленый
        rowOptions.fontColor = '#FFFFFF';       // Белый яркий текст
        rowOptions.fontWeight = 'bold';
      } 
      // 🏁 2. Выделение завершения игры
      else if (eventName === 'game_over') {
        eventDisplay = '🏁 ИГРА ЗАВЕРШЕНА';
        resultDisplay = `${data.successful_guesses !== undefined ? data.successful_guesses : ''}/${MAX_GAME_ATTEMPTS}`;
        rowOptions.backgroundColor = '#1565C0'; // Королевский синий
        rowOptions.fontColor = '#FFFFFF';
        rowOptions.fontWeight = 'bold';
      }

      // ✅❌ 3. Подсветка ответа в колонке 16 «Результат (1/0)»
      if (data.is_correct === 1 || data.is_correct === '1') {
        rowOptions.cellFormats[16] = {
          backgroundColor: '#A5D6A7', // Мягкий зеленый
          fontColor: '#1B5E20',       // Темно-зеленый текст
          fontWeight: 'bold',
          horizontalAlignment: 'center'
        };
      } else if (data.is_correct === 0 || data.is_correct === '0') {
        rowOptions.cellFormats[16] = {
          backgroundColor: '#FFCDD2', // Мягкий кораллово-красный
          fontColor: '#B71C1C',       // Темно-красный текст
          fontWeight: 'bold',
          horizontalAlignment: 'center'
        };
      }

      const detailsRow = [
        data.timestamp_iso || new Date().toISOString(),
        data.local_time_string || new Date().toLocaleString(),
        data.timezone || '',
        data.platform || '',
        data.device_lang || '',
        data.telegram_lang || '',
        data.screen_res || '',
        eventDisplay,
        data.telegram_user_id || '',
        data.telegram_user_name || '',
        data.session_id || '',
        personNameDisplay,
        data.person_id || '',
        genderDisplay,
        statusDisplay,
        resultDisplay,
        responseTimeSec,
        attemptNum,
        data.success_rate || '',
        data.language || '',
        data.game_mode || '',
        data.user_agent || ''
      ];

      addRowToSheet(detailsSheet, detailsRow, rowOptions);
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'success', 
      event: eventName, 
      position: NEW_ROWS_POSITION,
      player_color: playerStyle.bg 
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
