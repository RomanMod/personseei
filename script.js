// Telegram Web App initialization
const Telegram = window.Telegram.WebApp;
Telegram.ready();

// Language translations
const translations = {
    en: {
        alive: "Alive",
        dead: "Dead",
        male: "Male",
        female: "Female",
        check: "Check",
        total: "Total",
        correct: "Correct",
        accuracy: "Accuracy"
    },
    uk: {
        alive: "Живий",
        dead: "Мертвий",
        male: "Чоловік",
        female: "Жінка",
        check: "Перевірити",
        total: "Всього",
        correct: "Правильно",
        accuracy: "Точність"
    },
    ru: {
        alive: "Живой",
        dead: "Мертвый",
        male: "Мужчина",
        female: "Женщина",
        check: "Проверить",
        total: "Всего",
        correct: "Правильно",
        accuracy: "Точность"
    },
    alien: {
        alive: "🌟",
        dead: "💫",
        male: "👽",
        female: "🪐",
        check: "🔍",
        total: "📊",
        correct: "✅",
        accuracy: "🎯"
    }
};

// State
let currentPerson = null;
let stats = { total: 0, correct: 0 };
let isOpenMode = true;
let currentLanguage = "en";

// DOM Elements
const languageSelect = document.getElementById("language");
const difficultySelect = document.getElementById("difficulty");
const themeToggle = document.getElementById("theme-toggle");
const playerName = document.getElementById("player-name");
const personImage = document.getElementById("person-image");
const loadingProgress = document.getElementById("loading-progress");
const nextPhoto = document.getElementById("next-photo");
const checkAnswer = document.getElementById("check-answer");
const personInfo = document.getElementById("person-info");
const wikiLink = document.getElementById("wiki-link");
const resultDiv = document.querySelector(".result");
const totalStat = document.getElementById("total");
const correctStat = document.getElementById("correct");
const accuracyStat = document.getElementById("accuracy");

// Initialize player name
playerName.textContent = Telegram.initDataUnsafe.user?.first_name || "Player";

// Theme toggle
themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("light-theme");
    themeToggle.textContent = document.body.classList.contains("light-theme") ? "🌙" : "🌞";
});

// Language change
languageSelect.addEventListener("change", () => {
    currentLanguage = languageSelect.value;
    updateUI();
});

// Difficulty change
difficultySelect.addEventListener("change", () => {
    isOpenMode = difficultySelect.value === "open";
    loadNewPerson();
});

// Update UI with translations
function updateUI() {
    const t = translations[currentLanguage];
    document.querySelectorAll('input[name="status"]').forEach((input, i) => {
        input.nextSibling.textContent = i === 0 ? t.alive : t.dead;
    });
    document.querySelectorAll('input[name="gender"]').forEach((input, i) => {
        input.nextSibling.textContent = i === 0 ? t.male : t.female;
    });
    checkAnswer.textContent = t.check;
    totalStat.previousSibling.textContent = t.total + ": ";
    correctStat.previousSibling.textContent = t.correct + ": ";
    accuracyStat.previousSibling.textContent = t.accuracy + ": ";
}

// Fetch person from Wikipedia
async function loadNewPerson() {
    loadingProgress.style.display = "block";
    personImage.style.display = "none";
    resultDiv.style.display = "none";
    personInfo.textContent = "";
    wikiLink.href = "#";
    document.querySelectorAll('input[type="radio"]').forEach(input => input.checked = false);

    try {
        // Simulate loading progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            loadingProgress.textContent = `${progress}%`;
            if (progress >= 100) clearInterval(progressInterval);
        }, 200);

        // Wikipedia API query
        const lang = currentLanguage === "alien" ? "en" : currentLanguage;
        const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?` +
            `action=query&list=random&rnnamespace=0&rnlimit=1&format=json&origin=*`);
        const data = await response.json();
        const pageId = data.query.random[0].id;

        // Get page details
        const pageResponse = await fetch(`https://${lang}.wikipedia.org/w/api.php?` +
            `action=query&prop=pageimages|info&piprop=original&inprop=url&format=json&origin=*&pageids=${pageId}`);
        const pageData = await pageResponse.json();
        const page = pageData.query.pages[pageId];

        // Check if image exists
        if (!page.original) {
            console.log("No image found, retrying...");
            return loadNewPerson();
        }

        // Fetch person details (simplified, assumes person page)
        const extractResponse = await fetch(`https://${lang}.wikipedia.org/w/api.php?` +
            `action=query&prop=extracts&exintro& explaintext&format=json&origin=*&pageids=${pageId}`);
        const extractData = await extractResponse.json();
        const extract = extractData.query.pages[pageId].extract;

        // Mock person data (Wikipedia doesn't provide alive/dead or gender directly)
        currentPerson = {
            name: page.title,
            image: page.original.source,
            wikiUrl: page.fullurl,
            isAlive: Math.random() > 0.5,
            isMale: Math.random() > 0.5
        };

        // Load image to check validity
        const img = new Image();
        img.src = currentPerson.image;
        img.onload = () => {
            loadingProgress.style.display = "none";
            personImage.src = currentPerson.image;
            personImage.style.display = isOpenMode ? "block" : "none";
            console.log("Image loaded successfully:", currentPerson.image);
        };
        img.onerror = () => {
            console.log("Image failed to load, retrying...");
            loadNewPerson();
        };

    } catch (error) {
        console.error("Error fetching person:", error);
        loadNewPerson();
    }
}

// Check answer
checkAnswer.addEventListener("click", () => {
    if (!currentPerson) return;

    const statusInput = document.querySelector('input[name="status"]:checked');
    const genderInput = document.querySelector('input[name="gender"]:checked');

    if (!statusInput || !genderInput) {
        alert("Please select both status and gender!");
        return;
    }

    const isStatusCorrect = statusInput.value === (currentPerson.isAlive ? "alive" : "dead");
    const isGenderCorrect = genderInput.value === (currentPerson.isMale ? "male" : "female");

    // Highlight answers
    document.querySelectorAll('input[name="status"]').forEach(input => {
        input.nextSibling.classList.add(input.value === (currentPerson.isAlive ? "alive" : "dead") ? "correct" : "incorrect");
    });
    document.querySelectorAll('input[name="gender"]').forEach(input => {
        input.nextSibling.classList.add(input.value === (currentPerson.isMale ? "male" : "female") ? "correct" : "incorrect");
    });

    // Show result
    personImage.style.display = "block";
    personInfo.textContent = `${currentPerson.name}`;
    wikiLink.href = currentPerson.wikiUrl;
    resultDiv.style.display = "block";

    // Update stats
    stats.total++;
    if (isStatusCorrect && isGenderCorrect) stats.correct++;
    totalStat.textContent = stats.total;
    correctStat.textContent = stats.correct;
    accuracyStat.textContent = `${Math.round((stats.correct / stats.total) * 100)}%`;

    // Send to GA4
    gtag('event', 'check_answer', {
        event_category: 'Game',
        event_label: 'Answer',
        status_correct: isStatusCorrect,
        gender_correct: isGenderCorrect,
        person_name: currentPerson.name
    });
});

// Next photo
nextPhoto.addEventListener("click", loadNewPerson);

// Initial load
updateUI();
loadNewPerson();
