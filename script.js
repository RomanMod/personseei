document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand(); // Expand the Mini App to full height

    // --- UI Elements ---
    const themeToggleBtn = document.getElementById('theme-toggle');
    const languageSelect = document.getElementById('language-select');
    const welcomeMessageEl = document.getElementById('welcome-message');
    const difficultyOpenBtn = document.getElementById('difficulty-open');
    const difficultyClosedBtn = document.getElementById('difficulty-closed');
    const photoFrame = document.getElementById('photo-frame');
    const personPhotoImg = document.getElementById('person-photo');
    const shutterEl = document.getElementById('shutter');
    const questionsArea = document.getElementById('questions-area');
    const answerBtns = document.querySelectorAll('.answer-btn');
    const resultsArea = document.getElementById('results-area');
    const personNameEl = document.getElementById('person-name');
    const wikiLinkEl = document.getElementById('wiki-link');
    const exitButton = document.getElementById('exit-button');
    const nextPhotoButton = document.getElementById('next-photo-button');
    const loadingIndicator = document.getElementById('loading-indicator');

    // --- Stats Elements ---
    const gamesPlayedEl = document.getElementById('games-played');
    const correctAnswersEl = document.getElementById('correct-answers');
    const totalQuestionsEl = document.getElementById('total-questions');

    // --- Game State ---
    let currentDifficulty = 'open'; // 'open' or 'closed'
    let currentPersonData = null;
    let answers = {
        aliveDead: null,
        gender: null
    };
    let questionsAnswered = false;
    let stats = {
        gamesPlayed: 0,
        correctAnswers: 0,
        totalQuestions: 0
    };

    // --- Localization Strings ---
    const translations = {
        en: {
            toggleThemeNight: '🌙',
            toggleThemeDay: '☀️',
            langEnglish: 'English',
            langUkrainian: 'Українська',
            langRussian: 'Русский',
            langAlien: '👽︎◆︎●︎♓︎■︎',
            welcome: `Welcome, ${tg.initDataUnsafe?.user?.first_name || 'Player'}!`,
            difficultyLabel: 'Difficulty:',
            difficultyOpen: 'Open',
            difficultyClosed: 'Closed',
            question1: 'Is this person alive or dead?',
            alive: 'Alive',
            dead: 'Dead',
            question2: 'Is this person a man or a woman?',
            man: 'Man',
            woman: 'Woman',
            wikiLink: 'View on Wikipedia',
            statsTitle: 'Statistics',
            gamesPlayed: 'Games Played:',
            correctAnswers: 'Correct Answers:',
            totalQuestions: 'Total Questions Answered:',
            exit: 'Exit',
            nextPhoto: 'Next Photo',
            loading: 'Loading new person...',
            shutterReveal: 'Guess to Reveal',
            photoError: 'Could not load image or find person. Trying another...',
            allQuestionsAnswered: "Please answer all questions.",
        },
        uk: {
            toggleThemeNight: '🌙',
            toggleThemeDay: '☀️',
            langEnglish: 'English',
            langUkrainian: 'Українська',
            langRussian: 'Русский',
            langAlien: '👽︎◆︎●︎♓︎■︎',
            welcome: `Вітаємо, ${tg.initDataUnsafe?.user?.first_name || 'Гравець'}!`,
            difficultyLabel: 'Складність:',
            difficultyOpen: 'Відкрита',
            difficultyClosed: 'Закрита',
            question1: 'Ця людина жива чи мертва?',
            alive: 'Жива(-ий)',
            dead: 'Мертва(-ий)',
            question2: 'Це чоловік чи жінка?',
            man: 'Чоловік',
            woman: 'Жінка',
            wikiLink: 'Дивитися у Вікіпедії',
            statsTitle: 'Статистика',
            gamesPlayed: 'Ігор зіграно:',
            correctAnswers: 'Правильних відповідей:',
            totalQuestions: 'Всього питань:',
            exit: 'Вихід',
            nextPhoto: 'Наступне фото',
            loading: 'Завантаження нової персони...',
            shutterReveal: 'Вгадай, щоб відкрити',
            photoError: 'Не вдалося завантажити зображення або знайти особу. Спроба іншої...',
            allQuestionsAnswered: "Будь ласка, дайте відповідь на всі питання.",
        },
        ru: {
            toggleThemeNight: '🌙',
            toggleThemeDay: '☀️',
            langEnglish: 'English',
            langUkrainian: 'Українська',
            langRussian: 'Русский',
            langAlien: '👽︎◆︎●︎♓︎■︎',
            welcome: `Добро пожаловать, ${tg.initDataUnsafe?.user?.first_name || 'Игрок'}!`,
            difficultyLabel: 'Сложность:',
            difficultyOpen: 'Открытая',
            difficultyClosed: 'Закрытая',
            question1: 'Этот человек жив или мертв?',
            alive: 'Жив(-а)',
            dead: 'Мертв(-а)',
            question2: 'Это мужчина или женщина?',
            man: 'Мужчина',
            woman: 'Женщина',
            wikiLink: 'Смотреть в Википедии',
            statsTitle: 'Статистика',
            gamesPlayed: 'Игр сыграно:',
            correctAnswers: 'Правильных ответов:',
            totalQuestions: 'Всего вопросов:',
            exit: 'Выход',
            nextPhoto: 'Следующее фото',
            loading: 'Загрузка новой персоны...',
            shutterReveal: 'Угадай, чтобы открыть',
            photoError: 'Не удалось загрузить изображение или найти человека. Попытка другой...',
            allQuestionsAnswered: "Пожалуйста, ответьте на все вопросы.",
        },
        alien: { // Simple "Alien" text
            toggleThemeNight: '🌙✨',
            toggleThemeDay: '☀️✨',
            langEnglish: 'E■︎♑︎●︎♓︎⬧︎♒︎',
            langUkrainian: 'У😐︎❒︎♋︎♓︎■︎♓︎♋︎■︎',
            langRussian: 'P◆︎⬧︎⬧︎♓︎♋︎■︎',
            langAlien: '👽︎◆︎●︎♓︎■︎',
            welcome: `🖖︎, ${tg.initDataUnsafe?.user?.first_name || '👾︎'}!`,
            difficultyLabel: '👾︎:',
            difficultyOpen: '👁️‍🗨️',
            difficultyClosed: '❓',
            question1: '🌌︎❓︎💀︎❓︎',
            alive: '🌌︎',
            dead: '💀︎',
            question2: '🧑︎❓︎👩︎❓︎',
            man: '🧑︎',
            woman: '👩︎',
            wikiLink: '🛰️︎ 📜︎',
            statsTitle: '📊︎',
            gamesPlayed: '🎮︎:',
            correctAnswers: '✔️︎:',
            totalQuestions: '❓︎∑:',
            exit: '🚪︎💨︎',
            nextPhoto: '➡️︎🖼️︎',
            loading: '⏳︎●︎●︎●︎',
            shutterReveal: '👁️‍🗨️❓',
            photoError: '❌🖼️. 🔄...',
            allQuestionsAnswered: "👽🤷❓❓",
        }
    };

    function updateUIStrings(lang) {
        document.querySelectorAll('[data-translate]').forEach(el => {
            const key = el.dataset.translate;
            if (translations[lang] && translations[lang][key]) {
                if (el.tagName === 'BUTTON' && (key === 'toggleThemeDay' || key === 'toggleThemeNight')) {
                     // Special handling for theme toggle button text if needed based on current theme
                    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
                    if (key === 'toggleThemeDay' && currentTheme === 'dark') el.textContent = translations[lang][key];
                    if (key === 'toggleThemeNight' && currentTheme === 'light') el.textContent = translations[lang][key];
                    // Default for init
                    if (!el.textContent) el.textContent = document.body.classList.contains('light-theme') ? translations[lang].toggleThemeNight : translations[lang].toggleThemeDay;

                } else {
                    el.innerHTML = translations[lang][key]; // Use innerHTML for elements that might contain other tags like the welcome message
                }
            }
        });
        // Update shutter text specifically
        shutterEl.setAttribute('data-text-reveal', translations[lang].shutterReveal);
        // Update dynamic welcome message if language changes after init
        if (translations[lang].welcome.includes('${')) { // Re-interpolate if it's a dynamic string
             welcomeMessageEl.innerHTML = `Вітаємо, ${tg.initDataUnsafe?.user?.first_name || (lang === 'uk' ? 'Гравець' : (lang === 'ru' ? 'Игрок' : 'Player'))}!`;
        }

        // Ensure option texts in select are also translated (if they were static)
        // This is handled if options have data-translate. If not, you'd do:
        // languageSelect.options[0].text = translations[lang].langEnglish; etc.
    }


    // --- Event Listeners ---
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeToggleBtn.textContent = isLight ? translations[languageSelect.value].toggleThemeNight : translations[languageSelect.value].toggleThemeDay;
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        console.log('Theme toggled:', isLight ? 'Light' : 'Dark');
         gtag('event', 'theme_change', { 'theme': isLight ? 'light' : 'dark' });
    });

    languageSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        updateUIStrings(lang);
        localStorage.setItem('language', lang);
        // Re-fetch data if language affects Wikipedia API calls
        fetchNewPerson();
        console.log('Language changed to:', lang);
        gtag('event', 'language_change', { 'language_code': lang });
    });

    difficultyOpenBtn.addEventListener('click', () => setDifficulty('open'));
    difficultyClosedBtn.addEventListener('click', () => setDifficulty('closed'));

    answerBtns.forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(btn));
    });

    exitButton.addEventListener('click', () => {
        console.log('Exit button clicked');
        gtag('event', 'exit_app');
        tg.close();
    });

    nextPhotoButton.addEventListener('click', () => {
        console.log('Next photo button clicked');
        gtag('event', 'next_photo_click');
        fetchNewPerson();
    });

    // --- Functions ---
    function setDifficulty(difficulty) {
        currentDifficulty = difficulty;
        difficultyOpenBtn.classList.toggle('active', difficulty === 'open');
        difficultyClosedBtn.classList.toggle('active', difficulty === 'closed');
        applyDifficulty();
        console.log('Difficulty set to:', difficulty);
        gtag('event', 'difficulty_change', { 'difficulty_level': difficulty });
    }

    function applyDifficulty() {
        if (currentDifficulty === 'open') {
            shutterEl.classList.remove('closed');
            shutterEl.classList.add('open');
        } else {
            shutterEl.classList.remove('open');
            shutterEl.classList.add('closed');
        }
         // If difficulty changes after results are shown, hide results and reset questions
        if (resultsArea.style.display !== 'none') {
            resultsArea.style.display = 'none';
            resetQuestionState(); // Ensure questions are active again
        }
    }

    async function fetchWikipediaData(lang = 'en') {
        loadingIndicator.style.display = 'block';
        questionsArea.style.display = 'none'; // Hide questions while loading
        resultsArea.style.display = 'none'; // Hide previous results
        personPhotoImg.src = 'placeholder.jpg'; // Placeholder while loading
        console.log(`Workspaceing random person from Wikipedia (lang: ${lang})`);

        const WIKI_API_BASE = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*`;

        try {
            let personFound = false;
            let attempts = 0;
            while (!personFound && attempts < 10) { // Limit attempts
                attempts++;
                console.log(`Attempt ${attempts} to find a person with an image.`);

                // 1. Get a random page title
                const randomResponse = await fetch(`${WIKI_API_BASE}&list=random&rnnamespace=0&rnlimit=1`);
                if (!randomResponse.ok) throw new Error(`Wikipedia API error (random): ${randomResponse.status}`);
                const randomData = await randomResponse.json();
                const pageTitle = randomData.query.random[0].title;

                // 2. Get page image, categories, and page ID for the title
                // We also try to get birth and death dates via cirrussearch fulltext if possible (less reliable than Wikidata)
                // Or extractinfo for a summary that might contain dates.
                const pageInfoResponse = await fetch(
                    `${WIKI_API_BASE}&prop=pageimages|categories|info|extracts&piprop=original|thumbnail&pithumbsize=300&titles=${encodeURIComponent(pageTitle)}&inprop=url&exintro&explaintext`
                );
                if (!pageInfoResponse.ok) throw new Error(`Wikipedia API error (pageinfo): ${pageInfoResponse.status}`);
                const pageInfoData = await pageInfoResponse.json();
                const pageId = Object.keys(pageInfoData.query.pages)[0];
                const page = pageInfoData.query.pages[pageId];

                // Check if it's a person (very basic check: look for "births" or "deaths" categories)
                // This is highly unreliable. A better way is Wikidata (P31=Q5).
                let isLikelyPerson = false;
                if (page.categories) {
                    const yearRegex = /\b\d{4}\b/;
                    isLikelyPerson = page.categories.some(cat =>
                        cat.title.toLowerCase().includes('births') ||
                        cat.title.toLowerCase().includes('deaths') ||
                        cat.title.toLowerCase().includes('people') ||
                        cat.title.toLowerCase().includes('persons')
                    );
                }
                 // If no categories, check extract for typical biography phrases (less reliable)
                if (!isLikelyPerson && page.extract) {
                    const bioKeywords = ['was born', 'is an', 'was an', ' (born ', ' (died '];
                    if (bioKeywords.some(kw => page.extract.toLowerCase().includes(kw))) {
                        isLikelyPerson = true;
                    }
                }


                if (page.original?.source && isLikelyPerson) {
                    // Attempt to parse birth/death years from extract (very naive)
                    let birthYear = null;
                    let deathYear = null;
                    if (page.extract) {
                        const bornMatch = page.extract.match(/(?:born|b\.)\s*c?\.\s*(\d{3,4})/i);
                        if (bornMatch && bornMatch[1]) birthYear = parseInt(bornMatch[1]);

                        const diedMatch = page.extract.match(/(?:died|d\.)\s*c?\.\s*(\d{3,4})/i);
                        if (diedMatch && diedMatch[1]) deathYear = parseInt(diedMatch[1]);

                         // More complex date parsing e.g. (1 January 1950 – 23 March 2020)
                        const dateRangeMatch = page.extract.match(/\((\d{1,2}\s+\w+\s+)?(\d{4})\s*–\s*(\d{1,2}\s+\w+\s+)?(\d{4})\)/);
                        if (dateRangeMatch) {
                            if (dateRangeMatch[2]) birthYear = parseInt(dateRangeMatch[2]);
                            if (dateRangeMatch[4]) deathYear = parseInt(dateRangeMatch[4]);
                        }
                    }

                    currentPersonData = {
                        name: page.title,
                        imageUrl: page.original.source,
                        wikiUrl: page.fullurl,
                        isAlive: deathYear === null && birthYear !== null, // Simplified: alive if no death year but has birth year
                        // Gender is NOT reliably fetched here. Placeholder logic.
                        isMan: Math.random() > 0.5, // Placeholder: Randomly assign for now
                        birthYear: birthYear,
                        deathYear: deathYear
                    };
                    personFound = true;
                    console.log('Person found:', currentPersonData);
                } else {
                    console.log(`Page "${page.title}" is not a person or has no image. Retrying...`);
                }
            }

            if (!personFound) {
                throw new Error("Could not find a suitable person after multiple attempts.");
            }

        } catch (error) {
            console.error("Error fetching Wikipedia data:", error);
            currentPersonData = null; // Clear data on error
            personPhotoImg.alt = translations[languageSelect.value].photoError;
            alert(translations[languageSelect.value].photoError); // User feedback
            // Optionally, load a default person or show error state more gracefully
            // For now, we'll just log and the user can click "Next Photo"
        } finally {
            loadingIndicator.style.display = 'none';
            questionsArea.style.display = 'block'; // Show questions again
        }
    }


    function fetchNewPerson() {
        console.log("Fetching new person...");
        questionsAnswered = false;
        resultsArea.style.display = 'none';
        personPhotoImg.src = 'placeholder.jpg'; // Show placeholder while loading
        personPhotoImg.alt = 'Loading...';
        resetQuestionState();

        fetchWikipediaData(languageSelect.value)
            .then(() => {
                if (currentPersonData) {
                    personPhotoImg.src = currentPersonData.imageUrl;
                    personPhotoImg.alt = currentPersonData.name;
                    personNameEl.textContent = currentPersonData.name;
                    wikiLinkEl.href = currentPersonData.wikiUrl;
                    applyDifficulty(); // Re-apply shutter based on difficulty
                    stats.gamesPlayed++;
                    updateStatsDisplay();
                    gtag('event', 'person_loaded', {
                        'person_name': currentPersonData.name,
                        'language': languageSelect.value
                    });
                } else {
                    // Handle case where no person data was loaded (e.g. after errors)
                    personPhotoImg.alt = "Error loading person. Try again.";
                }
            })
            .catch(error => {
                 console.error("Failed to fetch and display new person:", error);
                 personPhotoImg.alt = "Error loading. Click Next.";
            });
    }


    function handleAnswer(buttonEl) {
        if (questionsAnswered || !currentPersonData) return; // Don't allow changes after reveal or if no data

        const group = buttonEl.dataset.answerGroup;
        const answer = buttonEl.dataset.answer;

        answers[group] = answer;

        // Update button styles
        document.querySelectorAll(`.answer-btn[data-answer-group="${group}"]`).forEach(btn => {
            btn.classList.remove('selected');
        });
        buttonEl.classList.add('selected');
        console.log(`Answered ${group}: ${answer}`);

        // Check if all questions are answered
        if (answers.aliveDead && answers.gender) {
            console.log("All questions answered. Revealing.");
            revealAnswers();
            gtag('event', 'questions_answered', {
                'person_name': currentPersonData.name,
                'answer_alive_dead': answers.aliveDead,
                'answer_gender': answers.gender
            });
        }
    }

    function revealAnswers() {
        if (!currentPersonData) return;
        questionsAnswered = true;

        let correctCountThisRound = 0;
        let totalQuestionsThisRound = 0;

        // --- Alive/Dead ---
        const isAliveCorrect = (answers.aliveDead === 'alive' && currentPersonData.isAlive) ||
                               (answers.aliveDead === 'dead' && !currentPersonData.isAlive);
        const aliveDeadBtns = document.querySelectorAll('.answer-btn[data-answer-group="aliveDead"]');
        totalQuestionsThisRound++;
        if (isAliveCorrect) {
            correctCountThisRound++;
            stats.correctAnswers++;
        }
        stats.totalQuestions++;
        aliveDeadBtns.forEach(btn => {
            if (btn.dataset.answer === answers.aliveDead) { // User's choice
                btn.classList.add(isAliveCorrect ? 'correct' : 'incorrect');
            }
            // Also highlight the actual correct answer if different from user's choice
            if ((currentPersonData.isAlive && btn.dataset.answer === 'alive') ||
                (!currentPersonData.isAlive && btn.dataset.answer === 'dead')) {
                 btn.classList.add('correct'); // Ensure actual correct one is green
            }
        });
        console.log(`Alive/Dead question: User chose ${answers.aliveDead}, Correct was ${currentPersonData.isAlive ? 'alive' : 'dead'}. Correct: ${isAliveCorrect}`);


        // --- Gender ---
        // IMPORTANT: currentPersonData.isMan is a PLACEHOLDER.
        // This part needs a reliable data source for actual gender.
        const isGenderCorrect = (answers.gender === 'man' && currentPersonData.isMan) ||
                                (answers.gender === 'woman' && !currentPersonData.isMan);
        const genderBtns = document.querySelectorAll('.answer-btn[data-answer-group="gender"]');
        totalQuestionsThisRound++;
        if (isGenderCorrect) {
            correctCountThisRound++;
            stats.correctAnswers++;
        }
        stats.totalQuestions++;
        genderBtns.forEach(btn => {
            if (btn.dataset.answer === answers.gender) { // User's choice
                btn.classList.add(isGenderCorrect ? 'correct' : 'incorrect');
            }
             // Also highlight the actual correct answer
            if ((currentPersonData.isMan && btn.dataset.answer === 'man') ||
                (!currentPersonData.isMan && btn.dataset.answer === 'woman')) {
                 btn.classList.add('correct');
            }
        });
        console.log(`Gender question: User chose ${answers.gender}, Correct was ${currentPersonData.isMan ? 'man' : 'woman'}. Correct: ${isGenderCorrect}`);


        // Open shutter if closed
        if (currentDifficulty === 'closed') {
            shutterEl.classList.remove('closed');
            shutterEl.classList.add('open');
        }

        resultsArea.style.display = 'block';
        updateStatsDisplay();

        gtag('event', 'round_completed', {
            'person_name': currentPersonData.name,
            'correct_this_round': correctCountThisRound,
            'total_this_round': totalQuestionsThisRound,
            'difficulty': currentDifficulty,
            'correct_is_alive': isAliveCorrect,
            'correct_gender': isGenderCorrect // Based on placeholder
        });
    }

    function resetQuestionState() {
        answers = { aliveDead: null, gender: null };
        questionsAnswered = false;
        answerBtns.forEach(btn => {
            btn.classList.remove('selected', 'correct', 'incorrect');
        });
        resultsArea.style.display = 'none';
        if (currentDifficulty === 'closed') {
            shutterEl.classList.remove('open');
            shutterEl.classList.add('closed');
        }
        console.log("Question state reset.");
    }

    function updateStatsDisplay() {
        gamesPlayedEl.textContent = stats.gamesPlayed;
        correctAnswersEl.textContent = stats.correctAnswers;
        totalQuestionsEl.textContent = stats.totalQuestions;
        // Persist stats
        localStorage.setItem('gameStats', JSON.stringify(stats));
        console.log('Stats updated:', stats);
    }

    function loadInitialSettings() {
        // Load theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
        }
        themeToggleBtn.textContent = document.body.classList.contains('light-theme') ? translations.en.toggleThemeNight : translations.en.toggleThemeDay; // Default to EN on init for button text

        // Load language
        const savedLang = localStorage.getItem('language') || 'en';
        languageSelect.value = savedLang;
        updateUIStrings(savedLang); // Apply translations after setting select value

        // Load stats
        const savedStats = localStorage.getItem('gameStats');
        if (savedStats) {
            stats = JSON.parse(savedStats);
        }
        updateStatsDisplay();

        console.log('Initial settings loaded.');
    }

    // --- Initialization ---
    console.log("Initializing Telegram Mini App Game...");
    tg.ready(); // Inform Telegram that the app is ready

    loadInitialSettings(); // Load theme, lang, stats before first fetch
    setDifficulty('open'); // Default difficulty
    fetchNewPerson(); // Load the first person

    // DevTool logging
    console.log('DevTool logging enabled.');
    console.log('Telegram User Data (initDataUnsafe):', tg.initDataUnsafe);
    console.log('Telegram Color Scheme:', tg.colorScheme); // 'light' or 'dark'
    console.log('Telegram Platform:', tg.platform);
});
