/* app.bundle.js
   Merged JS: parallax + music player + pomodoro + theme manager
   Place at: wwwroot/js/app.bundle.js
*/
(function () {
    'use strict';

    /* -----------------------------
       Utilities
    ----------------------------- */
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /* -----------------------------
       THEME MANAGER
       - Saves chosen theme to localStorage
       - Applies at load
    ----------------------------- */
    const ThemeManager = (function () {
        const KEY = 'pom_theme_v1';
        function applyTheme(name) {
            document.body.classList.remove('theme-light', 'theme-dark', 'theme-original');
            if (name === 'light') document.body.classList.add('theme-light');
            else if (name === 'dark') document.body.classList.add('theme-dark');
            else document.body.classList.add('theme-original');
            try { localStorage.setItem(KEY, name); } catch (e) { }
        }
        function load() {
            try {
                const t = localStorage.getItem(KEY) || 'theme-original';
                applyTheme(t);
            } catch (e) { applyTheme('theme-original'); }
        }
        function toggle(next) { applyTheme(next); }
        return { load, applyTheme, toggle };
    })();

    /* -----------------------------
       PARALLAX + SCROLL REVEAL
       - Uses data-parallax-speed attributes
       - Adds animate-on-scroll .in-view on reveal
    ----------------------------- */
    const Parallax = (function () {
        const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let items = [];
        let ticking = false;
        let lastY = window.scrollY || window.pageYOffset;

        function init() {
            if (prefersReduced) {
                // reveal all and skip parallax
                $$('.animate-on-scroll').forEach(el => el.classList.add('in-view'));
                return;
            }

            // Auto-add data-parallax-speed to common content elements that lack it
            $$('.content-sections .panel, #bigFaqAccordion .accordion-item').forEach((el, i) => {
                if (!el.hasAttribute('data-parallax-speed')) {
                    el.setAttribute('data-parallax-speed', (i % 2 === 0 ? 0.06 : 0.1).toString());
                }
            });

            const parallaxEls = $$('[data-parallax-speed]');
            items = parallaxEls.map(el => {
                const speed = parseFloat(el.getAttribute('data-parallax-speed')) || 0.08;
                return { el, speed, rect: null, maxTranslate: 120 };
            });

            refreshRects();
            window.addEventListener('resize', () => setTimeout(refreshRects, 120), { passive: true });
            window.addEventListener('scroll', onScroll, { passive: true });

            // reveal using IntersectionObserver
            const revealTargets = $$('.animate-on-scroll');
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('in-view');
                        // optional initial transform tweak handled by parallax update
                        observer.unobserve(entry.target);
                    }
                });
            }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
            revealTargets.forEach(t => observer.observe(t));
        }

        function refreshRects() {
            items.forEach(it => {
                it.rect = it.el.getBoundingClientRect();
                const h = it.rect.height || 160;
                it.maxTranslate = clamp(Math.round(h * 0.32), 60, 160);
                // set z-index to order by speed
                it.el.style.zIndex = 200 + Math.round(it.speed * 100);
            });
            update(); // update positions immediately
        }

        function onScroll() {
            lastY = window.scrollY || window.pageYOffset;
            if (!ticking) {
                window.requestAnimationFrame(update);
                ticking = true;
            }
        }

        function update() {
            ticking = false;
            const vh = window.innerHeight || document.documentElement.clientHeight;
            items.forEach(item => {
                if (!item.rect) item.rect = item.el.getBoundingClientRect();
                const topPage = item.rect.top + (window.scrollY || window.pageYOffset);
                const center = topPage + item.rect.height * 0.5;
                const distance = (center - (lastY + vh * 0.5));
                let translateY = -distance * item.speed;
                translateY = clamp(translateY, -item.maxTranslate, item.maxTranslate);
                item.el.style.transform = `translate3d(0,${translateY.toFixed(1)}px,0)`;
            });
        }

        return { init, refreshRects };
    })();

    /* -----------------------------
       MUSIC PLAYER
       - playlist of 3 tracks
       - prev/next/play/pause/seek/loop/volume
       - sets progress to 0 on load (fix)
       - defensive element lookups and fallbacks
    ----------------------------- */
    const MusicPlayer = (function () {
        const playlist = [
            { src: '/music/lofi1.mp3', title: 'Lofi 1', subtitle: 'Background • Lofi' },
            { src: '/music/lofi2.mp3', title: 'Lofi 2', subtitle: 'Focus Mode' },
            { src: '/music/lofi3.mp3', title: 'Lofi 3', subtitle: 'Deep Work' }
        ];

        // DOM references (fallback safe)
        const audioEl = document.getElementById('audioPlayer') || (() => {
            const a = document.createElement('audio'); a.id = 'audioPlayer'; a.preload = 'auto'; document.body.appendChild(a); return a;
        })();
        const playBtn = $('#playBtn');
        const prevBtn = $('#prevBtn');
        const nextBtn = $('#nextBtn');
        const progressBar = $('#progressBar') || $('#progressBar') || document.createElement('input');
        const nowPlayingEl = $('#nowPlaying') || $('#trackTitle');
        const subEl = $('.track-sub') || $('#trackSub');
        const volumeEl = $('#volume') || $('#volumeControl') || $('#volumeControl') || $('#volume');
        const loopBtn = $('#loopBtn');

        let current = 0;
        let isPlaying = false;
        let rafId = null;
        let seeking = false;

        function fmtTime(sec) {
            if (!isFinite(sec)) return '0:00';
            sec = Math.floor(sec);
            const m = Math.floor(sec / 60); const s = sec % 60;
            return `${m}:${String(s).padStart(2, '0')}`;
        }

        function loadTrack(index) {
            if (!playlist.length) return;
            current = ((index % playlist.length) + playlist.length) % playlist.length;
            const t = playlist[current];
            audioEl.src = t.src;
            audioEl.currentTime = 0;
            // ensure progress bar is present and reset
            if (progressBar) {
                progressBar.min = 0;
                progressBar.value = 0;
                progressBar.max = 0;
            }
            if (nowPlayingEl) nowPlayingEl.textContent = t.title;
            if (subEl) subEl.textContent = t.subtitle || '';
            if (playBtn) playBtn.textContent = '▶';
        }

        function startUpdater() {
            cancelAnimationFrame(rafId);
            function step() {
                if (!seeking && audioEl.duration && !isNaN(audioEl.duration)) {
                    if (progressBar) {
                        progressBar.max = Math.floor(audioEl.duration);
                        progressBar.value = Math.floor(audioEl.currentTime);
                    }
                }
                rafId = requestAnimationFrame(step);
            }
            rafId = requestAnimationFrame(step);
        }

        function play() {
            if (!audioEl.src) loadTrack(0);
            audioEl.play().then(() => {
                isPlaying = true;
                if (playBtn) playBtn.textContent = '⏸';
                startUpdater();
            }).catch(() => { /* autoplay prevented */ });
        }
        function pause() {
            audioEl.pause();
            isPlaying = false;
            if (playBtn) playBtn.textContent = '▶';
            cancelAnimationFrame(rafId);
        }

        // Event wiring (defensive)
        if (playBtn) playBtn.addEventListener('click', () => {
            if (audioEl.paused) play(); else pause();
        });
        if (prevBtn) prevBtn.addEventListener('click', () => {
            loadTrack(current - 1);
            if (isPlaying) play();
        });
        if (nextBtn) nextBtn.addEventListener('click', () => {
            loadTrack(current + 1);
            if (isPlaying) play();
        });

        if (progressBar) {
            // make sure it's a range input
            try { progressBar.type = 'range'; } catch (e) { }
            progressBar.addEventListener('input', () => {
                seeking = true;
                // show immediate time feedback if we have duration
            });
            progressBar.addEventListener('change', () => {
                const v = Number(progressBar.value || 0);
                audioEl.currentTime = v;
                seeking = false;
            });
        }

        if (volumeEl) {
            audioEl.volume = Number(volumeEl.value || 0.5);
            volumeEl.addEventListener('input', (e) => {
                audioEl.volume = Number(e.target.value);
            });
        }

        if (loopBtn) {
            loopBtn.addEventListener('click', () => {
                audioEl.loop = !audioEl.loop;
                loopBtn.textContent = audioEl.loop ? 'Loop: On' : 'Loop: Off';
            });
        }

        audioEl.addEventListener('loadedmetadata', () => {
            // reset to 0 so progress never starts mid
            try {
                audioEl.currentTime = 0;
                if (progressBar) { progressBar.value = 0; progressBar.max = Math.floor(audioEl.duration || 0); }
            } catch (e) { /* some browsers may throw if not allowed */ }
            if (!audioEl.paused) startUpdater();
        });

        audioEl.addEventListener('timeupdate', () => {
            if (!seeking && progressBar && audioEl.duration) {
                progressBar.value = Math.floor(audioEl.currentTime);
            }
        });

        audioEl.addEventListener('ended', () => {
            if (!audioEl.loop) {
                loadTrack(current + 1);
                if (isPlaying) play();
            }
        });

        // ensure starts at 0 on page load
        function init() {
            loadTrack(0);
            // some browsers disallow setting currentTime before metadata; safe guard:
            try { audioEl.currentTime = 0; } catch (e) { }
        }

        return { init, loadTrack, play, pause, audioEl };
    })();

    /* -----------------------------
       POMODORO APP
       - Timer, tasks, settings, session history
       - Confetti on session complete
    ----------------------------- */
    const Pomodoro = (function () {
        const LS_TASKS = 'pom_tasks_v1';
        const LS_HISTORY = 'pom_history_v1';
        const LS_SETTINGS = 'pom_settings_v1';
        const DEFAULTS = { work: 25 * 60, short: 5 * 60, long: 15 * 60, autoCycle: true, autoStart: true };

        // state
        let durations = { ...DEFAULTS };
        let mode = 'work';
        let remaining = durations.work;
        let timer = null;
        let isRunning = false;
        let cycles = 0;

        // DOM
        const ring = document.querySelector('.ring');
        const circumference = 2 * Math.PI * 50;
        if (ring) ring.style.strokeDasharray = circumference;
        const timeDisplay = $('#timeDisplay');
        const sessionLabel = $('#sessionLabel');
        const startBtn = $('#startBtn');
        const pauseBtn = $('#pauseBtn');
        const resetBtn = $('#resetBtn');
        const modeButtons = $$('.mode-btn');
        const audioBell = $('#audioBell');
        const audioPlayer = $('#audioPlayer');

        function loadSettings() {
            try {
                const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
                if (s.work) durations.work = s.work;
                if (s.short) durations.short = s.short;
                if (s.long) durations.long = s.long;
                if (typeof s.autoCycle === 'boolean') durations.autoCycle = s.autoCycle;
                if (typeof s.autoStart === 'boolean') durations.autoStart = s.autoStart;
            } catch (e) { }
        }
        function saveSettings() {
            try {
                const s = { work: durations.work, short: durations.short, long: durations.long, autoCycle: durations.autoCycle, autoStart: durations.autoStart };
                localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
            } catch (e) { }
        }

        function updateRing() {
            if (!ring) return;
            const total = durations[mode] || 1;
            const ratio = Math.max(0, Math.min(1, remaining / total));
            const offset = circumference * (1 - ratio);
            ring.style.strokeDashoffset = offset;
        }

        function formatTime(s) {
            const m = Math.floor(s / 60).toString().padStart(2, '0');
            const sec = (s % 60).toString().padStart(2, '0');
            return `${m}:${sec}`;
        }
        function updateDisplay() {
            if (timeDisplay) timeDisplay.innerText = formatTime(remaining);
            if (sessionLabel) sessionLabel.innerText = (mode === 'work') ? 'Focus' : (mode === 'short' ? 'Short Break' : 'Long Break');
            updateRing();
        }

        function startTimer() {
            if (isRunning) return;
            isRunning = true;
            if (startBtn) startBtn.classList.add('btn-running');
            timer = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(timer);
                    isRunning = false;
                    if (startBtn) startBtn.classList.remove('btn-running');
                    notifyComplete();
                    onComplete();
                }
                updateDisplay();
            }, 1000);
        }
        function pauseTimer() {
            if (timer) clearInterval(timer);
            isRunning = false;
            if (startBtn) startBtn.classList.remove('btn-running');
        }
        function resetTimer() {
            pauseTimer();
            remaining = durations[mode];
            updateDisplay();
        }

        function onComplete() {
            const hist = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
            hist.unshift({ mode, completedAt: new Date().toISOString(), duration: durations[mode] });
            try { localStorage.setItem(LS_HISTORY, JSON.stringify(hist)); } catch (e) { }
            renderHistory();
            try { if (audioBell) { audioBell.currentTime = 0; audioBell.play().catch(() => { }); } } catch (e) { }
            showConfetti();
            if (mode === 'work') cycles++;
            if (durations.autoCycle) {
                if (mode === 'work') {
                    mode = (cycles % 4 === 0) ? 'long' : 'short';
                } else {
                    mode = 'work';
                }
                modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
                remaining = durations[mode];
                updateDisplay();
                if (durations.autoStart) startTimer();
            }
        }

        function notifyComplete() {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Pomodoro complete', { body: (sessionLabel ? sessionLabel.innerText + ' finished' : 'Session finished') });
            } else if ('Notification' in window && Notification.permission !== 'denied') {
                Notification.requestPermission().then(p => { if (p === 'granted') new Notification('Pomodoro complete', { body: (sessionLabel ? sessionLabel.innerText + ' finished' : 'Session finished') }); });
            }
        }

        // tasks
        function getTasks() { return JSON.parse(localStorage.getItem(LS_TASKS) || '[]'); }
        function saveTasks(items) { try { localStorage.setItem(LS_TASKS, JSON.stringify(items)); } catch (e) { } renderTasks(); }

        function renderTasks() {
            const list = $('#taskList');
            if (!list) return;
            list.innerHTML = '';
            const items = getTasks();
            items.forEach(t => {
                const li = document.createElement('li');
                li.className = 'task-item d-flex justify-content-between align-items-center';
                li.innerHTML = `<div class="task-text">${escapeHtml(t.text)}</div>
                        <div class="task-actions">
                          <button class="btn btn-sm btn-ghost edit" data-id="${t.id}">✏️</button>
                          <button class="btn btn-sm btn-ghost del" data-id="${t.id}">🗑️</button>
                        </div>`;
                list.appendChild(li);
            });
            const countEl = $('#taskCount'); if (countEl) countEl.innerText = items.length;
            list.querySelectorAll('.del').forEach(btn => btn.addEventListener('click', (e) => {
                const id = btn.dataset.id;
                const newItems = getTasks().filter(x => x.id !== id);
                saveTasks(newItems);
            }));
            list.querySelectorAll('.edit').forEach(btn => btn.addEventListener('click', (e) => {
                const id = btn.dataset.id;
                const items = getTasks();
                const found = items.find(x => x.id === id);
                const newText = prompt('Edit task', found.text);
                if (newText !== null) {
                    found.text = newText.trim();
                    saveTasks(items);
                }
            }));
        }

        function escapeHtml(s) { return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

        // history
        function renderHistory() {
            const hist = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
            const tableBody = $('#historyTable tbody');
            const summaryToday = $('#summaryToday');
            const summaryTotal = $('#summaryTotal');
            const summaryStreak = $('#summaryStreak');
            if (tableBody) tableBody.innerHTML = '';
            if (!hist.length) {
                const empty = $('#historyEmpty');
                if (empty) empty.style.display = 'block';
                if (tableBody) tableBody.innerHTML = '';
                if (summaryToday) summaryToday.innerText = 0;
                if (summaryTotal) summaryTotal.innerText = 0;
                if (summaryStreak) summaryStreak.innerText = 0;
                return;
            } else {
                const empty = $('#historyEmpty');
                if (empty) empty.style.display = 'none';
            }
            hist.forEach(h => {
                if (!tableBody) return;
                const d = new Date(h.completedAt);
                const tr = document.createElement('tr');
                const dateTd = document.createElement('td'); dateTd.innerText = d.toLocaleDateString();
                const timeTd = document.createElement('td'); timeTd.innerText = d.toLocaleTimeString();
                const typeTd = document.createElement('td'); typeTd.innerText = h.mode === 'work' ? 'Focus' : (h.mode === 'short' ? 'Short Break' : 'Long Break');
                const durTd = document.createElement('td'); durTd.innerText = `${Math.round(h.duration / 60)}m`;
                tr.appendChild(dateTd); tr.appendChild(timeTd); tr.appendChild(typeTd); tr.appendChild(durTd);
                tableBody.appendChild(tr);
            });
            const total = hist.length;
            const todayCount = hist.filter(h => (new Date(h.completedAt)).toDateString() === (new Date()).toDateString()).length;
            const streak = computeBestStreak(hist);
            if (summaryToday) summaryToday.innerText = todayCount;
            if (summaryTotal) summaryTotal.innerText = total;
            if (summaryStreak) summaryStreak.innerText = streak;
        }
        function computeBestStreak(hist) {
            if (!hist.length) return 0;
            const days = Array.from(new Set(hist.map(h => (new Date(h.completedAt)).toISOString().slice(0, 10))));
            days.sort();
            let best = 1, cur = 1;
            for (let i = 1; i < days.length; i++) {
                const prev = new Date(days[i - 1]), curr = new Date(days[i]);
                const diff = (curr - prev) / (1000 * 60 * 60 * 24);
                if (diff === 1) { cur++; best = Math.max(best, cur); } else cur = 1;
            }
            return best;
        }

        // settings modal wiring (if present)
        function wireSettingsUI() {
            const open = $('#openSettings');
            const close = $('#closeSettings');
            const save = $('#saveSettings');
            if (open) {
                open.addEventListener('click', () => {
                    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
                    $('#settingWork') && ($('#settingWork').value = (s.work || DEFAULTS.work) / 60);
                    $('#settingShort') && ($('#settingShort').value = (s.short || DEFAULTS.short) / 60);
                    $('#settingLong') && ($('#settingLong').value = (s.long || DEFAULTS.long) / 60);
                    $('#settingAutoStart') && ($('#settingAutoStart').checked = s.autoStart !== false);
                    $('#settingsModal') && ($('#settingsModal').style.display = 'block');
                });
            }
            if (close) close.addEventListener('click', () => { $('#settingsModal') && ($('#settingsModal').style.display = 'none'); });
            if (save) save.addEventListener('click', () => {
                const w = Math.max(1, parseInt($('#settingWork').value || 25, 10));
                const s = Math.max(1, parseInt($('#settingShort').value || 5, 10));
                const l = Math.max(1, parseInt($('#settingLong').value || 15, 10));
                durations.work = w * 60; durations.short = s * 60; durations.long = l * 60;
                durations.autoStart = !!($('#settingAutoStart') && $('#settingAutoStart').checked);
                saveSettings();
                remaining = durations[mode];
                updateDisplay();
                $('#settingsModal') && ($('#settingsModal').style.display = 'none');
            });
        }

        // confetti
        function showConfetti() {
            const canvas = document.createElement('canvas');
            canvas.style.position = 'fixed';
            canvas.style.left = 0; canvas.style.top = 0; canvas.style.width = '100%'; canvas.style.height = '100%';
            canvas.style.zIndex = 9999; canvas.style.pointerEvents = 'none';
            canvas.width = window.innerWidth; canvas.height = window.innerHeight;
            document.body.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            const colors = ['#FFC700', '#FF3D00', '#2A9D8F', '#F94144', '#7B2CFF', '#A18CD1', '#6B4FFF'];
            const pieces = [];
            for (let i = 0; i < 70; i++) {
                pieces.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height - canvas.height,
                    w: 6 + Math.random() * 10,
                    h: 8 + Math.random() * 12,
                    vx: (Math.random() - 0.5) * 4,
                    vy: 2 + Math.random() * 4,
                    rot: Math.random() * Math.PI,
                    vr: (Math.random() - 0.5) * 0.2,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    opacity: 0.95
                });
            }
            let rafId = null;
            function step() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                pieces.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.05;
                    p.rot += p.vr;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.opacity;
                    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    ctx.restore();
                });
                rafId = requestAnimationFrame(step);
            }
            step();
            setTimeout(() => {
                cancelAnimationFrame(rafId);
                canvas.remove();
            }, 4200);
        }

        // public init
        function init() {
            loadSettings();
            remaining = durations.work;
            updateDisplay();
            wireSettingsUI();
            // Button wiring
            startBtn && startBtn.addEventListener('click', startTimer);
            pauseBtn && pauseBtn.addEventListener('click', pauseTimer);
            resetBtn && resetBtn.addEventListener('click', resetTimer);
            // mode buttons
            modeButtons.forEach(btn => btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                mode = btn.dataset.mode || 'work';
                remaining = durations[mode];
                updateDisplay();
            }));
            // keyboard
            window.addEventListener('keydown', (e) => {
                if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
                    e.preventDefault();
                    if (isRunning) pauseTimer(); else startTimer();
                }
            });
            // tasks UI
            $('#addTask') && $('#addTask').addEventListener('click', addTaskFromInput);
            $('#taskInput') && $('#taskInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') addTaskFromInput(); });
            $('#clearTasks') && $('#clearTasks').addEventListener('click', () => { if (confirm('Clear all tasks?')) { localStorage.removeItem(LS_TASKS); renderTasks(); } });
            renderTasks();
            renderHistory();

            // history modal buttons
            $('#openHistory') && $('#openHistory').addEventListener('click', () => { $('#historyModal') && ($('#historyModal').style.display = 'block'); });
            $('#closeHistory') && $('#closeHistory').addEventListener('click', () => { $('#historyModal') && ($('#historyModal').style.display = 'none'); });
            $('#exportHistory') && $('#exportHistory').addEventListener('click', exportHistoryCSV);
            $('#clearHistoryBtn') && $('#clearHistoryBtn').addEventListener('click', () => { if (confirm('Clear session history?')) { localStorage.removeItem(LS_HISTORY); renderHistory(); } });

            // request permission
            if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        }

        function addTaskFromInput() {
            const inp = $('#taskInput');
            if (!inp) return;
            const val = inp.value.trim();
            if (!val) return;
            const items = getTasks();
            const id = Date.now().toString();
            items.unshift({ id, text: val });
            saveTasks(items);
            inp.value = '';
        }

        function exportHistoryCSV() {
            const hist = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
            if (!hist.length) { alert('No history to export'); return; }
            const rows = [['Mode', 'CompletedAt', 'DurationSeconds']];
            hist.forEach(h => rows.push([h.mode, h.completedAt, h.duration]));
            const csv = rows.map(r => r.map(c => JSON.stringify(c)).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'pomodoro_history.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }

        // expose for debug
        return { init, startTimer, pauseTimer, resetTimer, renderTasks, renderHistory };
    })();

    /* -----------------------------
       BOOTSTRAP INIT
    ----------------------------- */
    function initAll() {
        ThemeManager.load();
        Parallax.init();
        MusicPlayer.init();
        Pomodoro.init();

        // expose debug handles
        window.__app = {
            ThemeManager,
            Parallax,
            MusicPlayer,
            Pomodoro
        };

        // Small: ensure parallax recalculates after layout settles
        setTimeout(() => { Parallax.refreshRects && Parallax.refreshRects(); }, 600);
    }

    // Run after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }

})();

