/* pomodoro.js — complete single-file implementation
   Put at: wwwroot/js/pomodoro.js
*/
(function () {
    'use strict';

    /* ========== Core state & constants ========== */
    const DEFAULTS = { work: 25 * 60, short: 5 * 60, long: 15 * 60, autoCycle: true, autoStart: true };
    const LS_TASKS = 'pom_tasks_v1';
    const LS_HISTORY = 'pom_history_v1';
    const LS_SETTINGS = 'pom_settings_v1';

    let durations = { ...DEFAULTS };
    let mode = 'work';
    let remaining = durations.work;
    let sessionTotal = null;
    let timer = null;
    let isRunning = false;
    let cycles = 0;

    /* ========== DOM refs (defensive lookups) ========== */
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));

    const ring = document.querySelector('.ring');
    const SVG_R = 50; // matches SVG circle r attribute used in markup
    const circumference = 2 * Math.PI * SVG_R;
    if (ring) ring.style.strokeDasharray = String(circumference);

    const timeDisplay = document.getElementById('timeDisplay');
    const timeDisplayHero = document.getElementById('timeDisplayHero'); // optional compact
    const sessionLabel = document.getElementById('sessionLabel');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const modeButtons = document.querySelectorAll('.mode-btn');
    const audioBell = document.getElementById('audioBell');

    /* ========== Settings load/save ========== */
    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
            if (s.work) durations.work = s.work;
            if (s.short) durations.short = s.short;
            if (s.long) durations.long = s.long;
            if (typeof s.autoCycle === 'boolean') durations.autoCycle = s.autoCycle;
            if (typeof s.autoStart === 'boolean') durations.autoStart = s.autoStart;
        } catch (e) { /* ignore */ }
    }

    function saveSettings() {
        try {
            const cur = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
            cur.work = durations.work;
            cur.short = durations.short;
            cur.long = durations.long;
            cur.autoCycle = durations.autoCycle;
            cur.autoStart = durations.autoStart;
            localStorage.setItem(LS_SETTINGS, JSON.stringify(cur));
        } catch (e) { /* ignore */ }
    }

    loadSettings();
    remaining = durations.work;

    /* ========== Helpers ========== */
    function pad(n) { return String(n).padStart(2, '0'); }
    function formatTime(s) {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    }
    function formatTimeShort(seconds) {
        if (!isFinite(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /* ========== Visual updates ========== */
    function updateRing() {
        if (!ring) return;
        const total = sessionTotal || durations[mode] || 1;
        const ratio = clamp(remaining / total, 0, 1);
        const offset = circumference * (1 - ratio);
        ring.style.strokeDashoffset = String(offset);
    }

    function updateDisplay() {
        if (timeDisplay) timeDisplay.innerText = formatTime(remaining);
        if (timeDisplayHero) timeDisplayHero.innerText = formatTime(remaining);
        if (sessionLabel) sessionLabel.innerText =
            (mode === 'work') ? 'Focus' : (mode === 'short' ? 'Short Break' : (mode === 'long' ? 'Long Break' : 'Custom'));
        updateRing();
    }

    updateDisplay();


    /* ========== Timer logic ========== */
    // Mode switching buttons
    modeButtons.forEach(btn => btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        mode = btn.dataset.mode || 'work';
        sessionTotal = null;
        remaining = durations[mode] || durations.work;
        updateDisplay();
    }));

    function startTimer() {
        if (isRunning) return;
        isRunning = true;
        if (sessionTotal === null || sessionTotal === undefined) sessionTotal = remaining;
        startBtn && startBtn.classList.add('btn-running');
        // use setInterval; using Date drift mitigation could be added later
        timer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(timer);
                isRunning = false;
                startBtn && startBtn.classList.remove('btn-running');
                notifyComplete();
                onComplete();
            }
            updateDisplay();
        }, 1000);
    }

    function pauseTimer() {
        if (timer) { clearInterval(timer); timer = null; }
        isRunning = false;
        startBtn && startBtn.classList.remove('btn-running');
    }

    function resetTimer() {
        pauseTimer();
        sessionTotal = null;
        remaining = durations[mode] || durations.work;
        updateDisplay();
    }

    if (startBtn) startBtn.addEventListener('click', startTimer);
    if (pauseBtn) pauseBtn.addEventListener('click', pauseTimer);
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);

    function notifyComplete() {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Pomodoro complete', { body: (sessionLabel ? sessionLabel.innerText + ' finished' : 'Session finished') });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    function onComplete() {
        try {
            const hist = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
            const durationSec = (sessionTotal !== null && sessionTotal !== undefined) ? sessionTotal : (durations[mode] || 0);
            hist.unshift({ mode, completedAt: new Date().toISOString(), duration: durationSec });
            localStorage.setItem(LS_HISTORY, JSON.stringify(hist));
        } catch (e) { /* ignore */ }

        renderHistory();
        try { if (audioBell) { audioBell.currentTime = 0; audioBell.play().catch(() => { }); } } catch (e) { }
        if (mode === 'work') cycles++;
        if (mode === 'custom') runCanvasConfetti();

        if (durations.autoCycle) {
            if (mode === 'work') {
                mode = (cycles % 4 === 0) ? 'long' : 'short';
            } else {
                mode = 'work';
            }
            modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            sessionTotal = null;
            remaining = durations[mode] || durations.work;
            updateDisplay();
            if (durations.autoStart) startTimer();
        } else {
            sessionTotal = null;
        }
    }

    /* Spacebar control */
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            if (isRunning) pauseTimer(); else startTimer();
        }
    });


    /* ========== Quick chips (quick durations) ========== */
    document.querySelectorAll('.btn-chip[data-duration]').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = parseInt(btn.dataset.duration || '0', 10);
            if (!isNaN(d) && d > 0) {
                mode = 'work';
                modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === 'work'));
                sessionTotal = null;
                remaining = d;
                updateDisplay();
            }
        });
    });


    /* ========== Tasks ========== */
    function getTasks() {
        try { return JSON.parse(localStorage.getItem(LS_TASKS) || '[]'); } catch (e) { return []; }
    }
    function saveTasks(items) {
        try { localStorage.setItem(LS_TASKS, JSON.stringify(items)); } catch (e) { }
        renderTasks();
    }

    function renderTasks() {
        const list = document.getElementById('taskList');
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
        const countEl = document.getElementById('taskCount'); if (countEl) countEl.innerText = items.length;
        list.querySelectorAll('.del').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            saveTasks(getTasks().filter(x => x.id !== id));
        }));
        list.querySelectorAll('.edit').forEach(btn => btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const items = getTasks();
            const found = items.find(x => x.id === id);
            const newText = prompt('Edit task', found ? found.text : '');
            if (newText !== null) {
                if (found) {
                    found.text = newText.trim();
                    saveTasks(items);
                }
            }
        }));
    }

    function escapeHtml(s) {
        return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }

    (function wireTaskInputs() {
        const addBtn = document.getElementById('addTask');
        const inp = document.getElementById('taskInput');
        if (addBtn) addBtn.addEventListener('click', addTaskFromInput);
        if (inp) inp.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTaskFromInput(); });
        function addTaskFromInput() {
            const input = document.getElementById('taskInput');
            if (!input) return;
            const val = input.value.trim();
            if (!val) return;
            const items = getTasks();
            items.unshift({ id: Date.now().toString(), text: val });
            saveTasks(items);
            input.value = '';
        }
        const clearBtn = document.getElementById('clearTasks');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            if (confirm('Clear all tasks?')) {
                localStorage.removeItem(LS_TASKS);
                renderTasks();
            }
        });
    })();

    renderTasks();


    /* ========== History rendering & utilities ========== */
    function parseHistory() {
        try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch (e) { return []; }
    }
    function saveHistory(arr) {
        try { localStorage.setItem(LS_HISTORY, JSON.stringify(arr)); } catch (e) { }
    }
    function dateKey(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    function formatDuration(seconds) {
        if (!isFinite(seconds)) return '';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        if (m === 0) return `${s}s`;
        return `${m}m ${s}s`;
    }

    function computeBestStreak(workSessions) {
        const dates = {};
        workSessions.forEach(h => { const k = dateKey(new Date(h.completedAt)); dates[k] = true; });
        const uniq = Object.keys(dates).sort();
        if (!uniq.length) return 0;
        let best = 1, cur = 1;
        for (let i = 1; i < uniq.length; i++) {
            const prev = new Date(uniq[i - 1]);
            const curr = new Date(uniq[i]);
            const diff = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
            if (diff === 1) { cur++; if (cur > best) best = cur; } else cur = 1;
        }
        return best;
    }

    function renderHistory() {
        const hist = parseHistory();
        const tbody = document.querySelector('#historyTable tbody');
        const emptyDiv = document.getElementById('historyEmpty');
        const totalEl = document.getElementById('summaryTotal');
        const todayEl = document.getElementById('summaryToday');
        const streakEl = document.getElementById('summaryStreak');

        if (tbody) tbody.innerHTML = '';
        hist.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        if (!hist.length) {
            if (emptyDiv) emptyDiv.style.display = 'block';
            if (totalEl) totalEl.innerText = '0';
            if (todayEl) todayEl.innerText = '0';
            if (streakEl) streakEl.innerText = '0';
            return;
        } else {
            if (emptyDiv) emptyDiv.style.display = 'none';
        }

        hist.forEach(item => {
            if (!tbody) return;
            const dt = new Date(item.completedAt);
            const dateStr = dt.toLocaleDateString();
            const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const type = (item.mode === 'work') ? 'Pomodoro' : (item.mode === 'short' ? 'Short Break' : (item.mode === 'long' ? 'Long Break' : 'Custom'));
            const dur = item.duration ? formatDuration(item.duration) : '';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${dateStr}</td><td>${timeStr}</td><td>${type}</td><td>${dur}</td>`;
            tbody.appendChild(tr);
        });

        const workSessions = hist.filter(h => h.mode === 'work');
        if (totalEl) totalEl.innerText = String(workSessions.length);
        const todayKey = dateKey(new Date());
        if (todayEl) todayEl.innerText = String(workSessions.filter(h => dateKey(new Date(h.completedAt)) === todayKey).length);
        if (streakEl) streakEl.innerText = String(computeBestStreak(workSessions));
    }

    document.getElementById('openHistory')?.addEventListener('click', () => {
        renderHistory();
        const modal = document.getElementById('historyModal');
        if (modal) modal.style.display = 'block';
    });
    document.getElementById('closeHistory')?.addEventListener('click', () => {
        const modal = document.getElementById('historyModal');
        if (modal) modal.style.display = 'none';
    });

    function exportHistoryCSV() {
        const hist = parseHistory();
        if (!hist.length) { alert('No history to export.'); return; }
        const rows = [['Date', 'Time', 'Type', 'DurationSeconds', 'HumanDuration']];
        hist.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        hist.forEach(h => {
            const dt = new Date(h.completedAt);
            const date = dt.toLocaleDateString();
            const time = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const type = h.mode === 'work' ? 'Pomodoro' : (h.mode === 'short' ? 'Short Break' : (h.mode === 'long' ? 'Long Break' : 'Custom'));
            const dur = h.duration || 0;
            rows.push([date, time, type, String(dur), formatDuration(dur)]);
        });
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `pomodoro_history_${(new Date()).toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }

    document.getElementById('exportHistory')?.addEventListener('click', exportHistoryCSV);
    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        if (confirm('Clear entire session history? This cannot be undone.')) {
            localStorage.removeItem(LS_HISTORY);
            renderHistory();
        }
    });

    renderHistory();


    /* ========== Custom timer ========== */
    document.getElementById('startCustomTimer')?.addEventListener('click', () => {
        const minEl = document.getElementById('customMinutes');
        const secEl = document.getElementById('customSeconds');
        const min = minEl ? parseInt(minEl.value || '0', 10) : 0;
        const sec = secEl ? parseInt(secEl.value || '0', 10) : 0;
        const total = Math.max(0, (isFinite(min) ? min : 0) * 60 + (isFinite(sec) ? sec : 0));
        if (total <= 0) { alert('Please enter a valid time.'); return; }
        pauseTimer();
        mode = 'custom';
        modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
        sessionTotal = null;
        remaining = total;
        updateDisplay();
        startTimer();
    });


    /* ========== Confetti (built-in canvas fallback) ========== */
    function runCanvasConfetti() {
        // simple colorful falling confetti using canvas so we don't need external lib
        const canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = 9999;
        canvas.style.pointerEvents = 'none';
        document.body.appendChild(canvas);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');
        const colors = ['#FFC700', '#FF3D00', '#2A9D8F', '#F94144', '#7B2CFF', '#A18CD1', '#6B4FFF'];
        const pieces = [];
        for (let i = 0; i < 70; i++) {
            pieces.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height * -0.5,
                w: 6 + Math.random() * 12,
                h: 8 + Math.random() * 12,
                vx: (Math.random() - 0.5) * 6,
                vy: 2 + Math.random() * 4,
                rot: Math.random() * Math.PI,
                vr: (Math.random() - 0.5) * 0.2,
                color: colors[Math.floor(Math.random() * colors.length)],
                opacity: 1
            });
        }
        let raf = null;
        function step() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < pieces.length; i++) {
                const p = pieces[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.06;
                p.rot += p.vr;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.opacity;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
            raf = requestAnimationFrame(step);
        }
        step();
        setTimeout(() => {
            cancelAnimationFrame(raf);
            canvas.remove();
        }, 3600);
    }


    /* ========== Music player (playlist + controls) ========== */
    const audioPlayer = document.getElementById('audioPlayer') || (function () {
        const a = document.createElement('audio'); a.id = 'audioPlayer'; a.preload = 'auto'; a.loop = false; document.body.appendChild(a); return a;
    })();
    const volInput = document.getElementById('volume') || document.getElementById('volumeControl');
    const playBtn = document.getElementById('playBtn');
    const prevBtn = document.getElementById('prevTrack') || document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextTrack') || document.getElementById('nextBtn');
    const trackProgress = document.getElementById('trackProgress') || document.getElementById('progressBar');
    const nowPlayingEl = document.getElementById('nowPlaying') || document.getElementById('trackTitle');
    const timeDisplayTrack = document.getElementById('timeDisplayTrack') || document.getElementById('trackTime');
    const loopBtn = document.getElementById('loopBtn');

    const playlist = [
        { src: '/music/lofi1.mp3', title: 'Lofi 1' },
        { src: '/music/lofi2.mp3', title: 'Lofi 2' },
        { src: '/music/lofi3.mp3', title: 'Nature Ambience' }
    ];
    let currentTrack = 0;
    let loopEnabled = false;
    let rafId = null;
    let seeking = false;

    function loadTrack(index, autoplay = false) {
        if (!playlist.length) return;
        index = ((index % playlist.length) + playlist.length) % playlist.length;
        currentTrack = index;
        audioPlayer.src = playlist[currentTrack].src;
        audioPlayer.currentTime = 0;
        if (trackProgress) { trackProgress.value = 0; trackProgress.max = 0; }
        if (nowPlayingEl) nowPlayingEl.innerText = playlist[currentTrack].title;
        if (playBtn) playBtn.innerText = '▶';
        audioPlayer.load();
        if (autoplay) {
            audioPlayer.play().catch(() => { });
            if (playBtn) playBtn.innerText = '⏸';
        }
    }

    function startProgressUpdater() {
        cancelAnimationFrame(rafId);
        function step() {
            if (!seeking && audioPlayer.duration && !isNaN(audioPlayer.duration)) {
                if (trackProgress) {
                    trackProgress.max = Math.floor(audioPlayer.duration);
                    trackProgress.value = Math.floor(audioPlayer.currentTime);
                }
                if (timeDisplayTrack) timeDisplayTrack.innerText = `${formatTimeShort(Math.floor(audioPlayer.currentTime || 0))} / ${formatTimeShort(Math.floor(audioPlayer.duration || 0))}`;
            }
            rafId = requestAnimationFrame(step);
        }
        rafId = requestAnimationFrame(step);
    }

    function playMusic() {
        if (!audioPlayer.src) loadTrack(0);
        audioPlayer.play().then(() => {
            if (playBtn) playBtn.innerText = '⏸';
            startProgressUpdater();
        }).catch(() => { });
    }
    function pauseMusic() {
        audioPlayer.pause();
        if (playBtn) playBtn.innerText = '▶';
        cancelAnimationFrame(rafId);
    }

    if (volInput) {
        audioPlayer.volume = parseFloat(volInput.value || '0.5');
        volInput.addEventListener('input', (e) => { audioPlayer.volume = parseFloat(e.target.value || '0.5'); });
    }

    if (playBtn) playBtn.addEventListener('click', () => {
        if (audioPlayer.paused) playMusic(); else pauseMusic();
    });

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); const wasPlaying = !audioPlayer.paused; loadTrack(currentTrack - 1, wasPlaying); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); const wasPlaying = !audioPlayer.paused; loadTrack(currentTrack + 1, wasPlaying); });

    if (trackProgress) {
        try { trackProgress.type = 'range'; } catch (e) { }
        trackProgress.addEventListener('input', (e) => {
            seeking = true;
            const val = Number(e.target.value || 0);
            if (timeDisplayTrack) timeDisplayTrack.innerText = `${formatTimeShort(val)} / ${formatTimeShort(Math.floor(trackProgress.max || 0))}`;
        });
        trackProgress.addEventListener('change', (e) => {
            const val = Number(e.target.value || 0);
            audioPlayer.currentTime = val;
            seeking = false;
            if (!audioPlayer.paused) audioPlayer.play().catch(() => { });
        });
    }

    if (loopBtn) {
        loopBtn.addEventListener('click', () => {
            loopEnabled = !loopEnabled;
            audioPlayer.loop = loopEnabled;
            loopBtn.innerText = loopEnabled ? 'Loop: On' : 'Loop: Off';
            loopBtn.classList.toggle('active', loopEnabled);
        });
    }

    audioPlayer.addEventListener('loadedmetadata', () => {
        try { audioPlayer.currentTime = 0; } catch (e) { }
        if (trackProgress) trackProgress.max = Math.floor(audioPlayer.duration || 0);
        if (timeDisplayTrack) timeDisplayTrack.innerText = `${formatTimeShort(0)} / ${formatTimeShort(Math.floor(audioPlayer.duration || 0))}`;
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (!seeking && trackProgress && audioPlayer.duration) {
            trackProgress.value = Math.floor(audioPlayer.currentTime || 0);
        }
        if (timeDisplayTrack && audioPlayer.duration) {
            timeDisplayTrack.innerText = `${formatTimeShort(Math.floor(audioPlayer.currentTime || 0))} / ${formatTimeShort(Math.floor(audioPlayer.duration || 0))}`;
        }
    });

    audioPlayer.addEventListener('ended', () => {
        if (loopEnabled) {
            audioPlayer.currentTime = 0;
            audioPlayer.play().catch(() => { });
        } else {
            const wasPlaying = true;
            loadTrack(currentTrack + 1, wasPlaying);
        }
    });

    // initialize
    loadTrack(0, false);
    window.addEventListener('pageshow', () => {
        try { audioPlayer.currentTime = 0; } catch (e) { }
        if (trackProgress) trackProgress.value = 0;
        if (playBtn) playBtn.innerText = '▶';
    });


    /* ========== Settings modal: theme + username + durations ========== */
    function applyThemeAndUsername() {
        try {
            const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
            const theme = s.theme || 'original';
            document.body.classList.remove('theme-light', 'theme-dark', 'theme-original');
            document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-original');
            document.body.classList.add('theme-' + theme);
            document.documentElement.classList.add('theme-' + theme);
            const username = s.username || '';
            if (username && username.trim().length > 0) {
                document.querySelectorAll('.user-display').forEach(el => { el.innerText = username; });
                const navName = document.getElementById('userDisplayName');
                if (navName) navName.textContent = username;
            } else {
                document.querySelectorAll('.user-display').forEach(el => { el.innerText = 'Guest'; });
                const navName = document.getElementById('userDisplayName');
                if (navName) navName.textContent = 'Guest';
            }
        } catch (e) { /* ignore */ }
    }

    document.getElementById('openSettings')?.addEventListener('click', () => {
        try {
            const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
            document.getElementById('settingWork').value = (s.work || durations.work) / 60;
            document.getElementById('settingShort').value = (s.short || durations.short) / 60;
            document.getElementById('settingLong').value = (s.long || durations.long) / 60;
            document.getElementById('settingAutoStart').checked = s.autoStart !== false;
            document.getElementById('settingUsername').value = s.username || '';
            document.getElementById('settingTheme').value = s.theme || 'original';
            const modal = document.getElementById('settingsModal');
            if (modal) modal.style.display = 'block';
        } catch (e) { /* ignore */ }
    });

    document.getElementById('saveSettings')?.addEventListener('click', () => {
        try {
            const w = Math.max(1, parseInt(document.getElementById('settingWork').value || '25', 10));
            const sh = Math.max(1, parseInt(document.getElementById('settingShort').value || '5', 10));
            const l = Math.max(1, parseInt(document.getElementById('settingLong').value || '15', 10));
            durations.work = w * 60;
            durations.short = sh * 60;
            durations.long = l * 60;
            durations.autoStart = !!document.getElementById('settingAutoStart').checked;
            durations.autoCycle = (function () {
                try {
                    const cur = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
                    return (cur.autoCycle !== undefined) ? cur.autoCycle : true;
                } catch (e) { return true; }
            })();
            const username = (document.getElementById('settingUsername').value || '').trim();
            const theme = document.getElementById('settingTheme').value || 'original';
            const cur = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');
            cur.work = durations.work; cur.short = durations.short; cur.long = durations.long;
            cur.autoStart = durations.autoStart; cur.autoCycle = durations.autoCycle;
            cur.username = username; cur.theme = theme;
            localStorage.setItem(LS_SETTINGS, JSON.stringify(cur));
            saveSettings();
            applyThemeAndUsername();
            remaining = durations[mode] || durations.work;
            updateDisplay();
            const modal = document.getElementById('settingsModal');
            if (modal) modal.style.display = 'none';
        } catch (e) { /* ignore */ }
    });

    document.getElementById('closeSettings')?.addEventListener('click', () => {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.style.display = 'none';
    });

    // apply immediately on load
    applyThemeAndUsername();


    /* ========== Scroll reveal, parallax, overlay fade ========== */
    (function () {
        if (typeof window === 'undefined') return;
        const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced) {
            document.querySelectorAll('.animate-on-scroll').forEach(el => el.classList.add('in-view'));
            return;
        }

        // ensure there are animate-on-scroll elements
        if (document.querySelectorAll('.animate-on-scroll').length === 0) {
            document.querySelectorAll('.panel, .content-sections .card.panel').forEach(el => el.classList.add('animate-on-scroll'));
        }

        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const delay = parseInt(el.getAttribute('data-delay-ms') || '0', 10);
                    if (delay > 0) el.style.transitionDelay = delay + 'ms';
                    el.classList.add('in-view');
                    io.unobserve(el);
                }
            });
        }, { root: null, rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            const autoDelay = el.hasAttribute('data-auto-stagger') ? (Math.random() * 260 | 0) : 0;
            if (autoDelay && !el.hasAttribute('data-delay-ms')) el.setAttribute('data-delay-ms', String(autoDelay));
            io.observe(el);
        });

        // Parallax: use data-parallax-speed attribute
        const parallaxEls = Array.from(document.querySelectorAll('[data-parallax-speed]'));
        if (parallaxEls.length) {
            let ticking = false;
            function updateParallax() {
                parallaxEls.forEach(el => {
                    const speed = parseFloat(el.getAttribute('data-parallax-speed')) || 0.12;
                    const rect = el.getBoundingClientRect();
                    const offsetFromCenter = (rect.top + rect.height / 2) - (window.innerHeight / 2);
                    const raw = -offsetFromCenter * (speed * 0.45);
                    const clamped = clamp(raw, -140, 140);
                    el.style.transform = `translateY(${clamped}px)`;
                });
            }
            window.addEventListener('scroll', () => {
                if (!ticking) {
                    window.requestAnimationFrame(() => { updateParallax(); ticking = false; });
                    ticking = true;
                }
            }, { passive: true });
            updateParallax();
        }

        // overlay fade
        const overlay = document.getElementById('bgOverlay');
        if (overlay) {
            function updateOverlay() {
                const docH = document.body.scrollHeight - window.innerHeight;
                const ratio = docH > 0 ? (window.scrollY / docH) : 0;
                const eased = Math.pow(ratio, 0.9);
                const opacity = clamp(eased * 0.72, 0, 0.72);
                overlay.style.opacity = String(opacity);
            }
            window.addEventListener('scroll', () => requestAnimationFrame(updateOverlay), { passive: true });
            updateOverlay();
        }
    })();


    /* ========== Public API exposure for debugging ========== */
    window.__pomodoro = {
        startTimer,
        pauseTimer,
        resetTimer,
        renderTasks,
        renderHistory,
        loadSettings,
        saveSettings
    };

})();

