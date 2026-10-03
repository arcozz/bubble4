// ==UserScript==
// @name           Middle Click Sparks
// @version        3.0
// @description    Instant spark burst around the cursor when you middle-click a link.
// @compatibility  Firefox 100+
// ==/UserScript==

(() => {
    const STYLE_ID = 'middle-click-sparks-styles';
    const PREF_PREFIX = 'extension.middle-click-tab-animation.';
    const DEBOUNCE_MS = 300;   // mousedown + auxclick = un seul éclatement

    const DEFAULTS = {
        sparkCount: 8,
        animationDuration: 450,
        sparkLength: 12,
        sparkWidth: 2,
        spread: 44,
        debug: false,
    };

    function readPref(key, fallback) {
        const fullKey = PREF_PREFIX + key;
        try {
            switch (Services.prefs.getPrefType(fullKey)) {
                case Services.prefs.PREF_INT: return Services.prefs.getIntPref(fullKey);
                case Services.prefs.PREF_BOOL: return Services.prefs.getBoolPref(fullKey);
                case Services.prefs.PREF_STRING: return Services.prefs.getCharPref(fullKey);
            }
        } catch (_) { /* pref absente */ }
        return fallback;
    }

    function intPref(key, fallback) {
        const v = parseInt(readPref(key, fallback), 10);
        return Number.isNaN(v) ? fallback : v;
    }

    function readConfig() {
        const dbg = readPref('debug', DEFAULTS.debug);
        return {
            sparkCount: intPref('spark-count', DEFAULTS.sparkCount),
            animationDuration: intPref('animation-duration', DEFAULTS.animationDuration),
            sparkLength: intPref('spark-length', DEFAULTS.sparkLength),
            sparkWidth: intPref('spark-width', DEFAULTS.sparkWidth),
            spread: intPref('spread', DEFAULTS.spread),
            debug: dbg === true || dbg === 'true',
        };
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .mcs-container {
                position: absolute;
                width: 0;
                height: 0;
                pointer-events: none;
                z-index: 99999;
            }
            .mcs-spark {
                position: absolute;
                background-color: color-mix(in srgb, var(--zen-primary-color), #e6e8e6);
                border-radius: 1px;
                animation: mcsSpark var(--mcs-duration) ease-out forwards;
                will-change: transform, opacity;
            }
            @keyframes mcsSpark {
                0%   { transform: rotate(var(--a)) translateX(8px) scaleX(1); opacity: 1; }
                100% { transform: rotate(var(--a)) translateX(var(--d)) scaleX(0.2); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    function getAnimationParent() {
        return document.getElementById('browser')
            || document.getElementById('main-window')
            || document.documentElement;
    }

    function createSpark(index, config) {
        const spark = document.createElement('div');
        spark.className = 'mcs-spark';

        // rayons répartis en cercle, avec un petit décalage aléatoire
        const angle = index * (360 / config.sparkCount) + (Math.random() * 20 - 10);
        const dist = config.spread * (0.8 + Math.random() * 0.4);

        spark.style.width = `${config.sparkLength}px`;
        spark.style.height = `${config.sparkWidth}px`;
        spark.style.left = `${-config.sparkLength / 2}px`;
        spark.style.top = `${-config.sparkWidth / 2}px`;
        spark.style.setProperty('--a', `${angle}deg`);
        spark.style.setProperty('--d', `${dist}px`);
        return spark;
    }

    function burstAt(clientX, clientY, config) {
        const parent = getAnimationParent();
        const p = parent.getBoundingClientRect();

        const container = document.createElement('div');
        container.className = 'mcs-container';
        container.style.left = `${clientX - p.left}px`;
        container.style.top = `${clientY - p.top}px`;
        container.style.setProperty('--mcs-duration', `${config.animationDuration}ms`);

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < config.sparkCount; i++) fragment.appendChild(createSpark(i, config));
        container.appendChild(fragment);
        parent.appendChild(container);

        setTimeout(() => container.remove(), config.animationDuration + 50);
    }

    let lastBurst = 0;

    // Zen/Firefox connaît à tout instant le lien survolé (c'est l'URL affichée en bas de la fenêtre).
    // true = curseur sur un lien, false = pas sur un lien, null = impossible à savoir.
    function isOverLink() {
        const link = window.XULBrowserWindow?.overLink;
        return typeof link === 'string' ? link !== '' : null;
    }

    function isInsidePage(event) {
        const r = gBrowser.selectedBrowser.getBoundingClientRect();
        return event.clientX >= r.left && event.clientX <= r.right
            && event.clientY >= r.top && event.clientY <= r.bottom;
    }

    // Instantané : déclenché à l'appui du clic milieu (ou Ctrl+clic) sur un lien.
    function onClick(event) {
        const middle = event.button === 1;
        const ctrlClick = event.button === 0 && (event.ctrlKey || event.metaKey);
        if (!middle && !ctrlClick) return;
        if (!isInsidePage(event)) return;

        if (isOverLink() === false) return; // pas sur un lien

        const now = performance.now();
        if (now - lastBurst < DEBOUNCE_MS) return;
        lastBurst = now;

        const config = readConfig();
        if (config.debug) console.log('[MiddleClickSparks]', event.type, 'lien:', window.XULBrowserWindow?.overLink, event.clientX, event.clientY);
        // partage la position du clic avec tab_open_animation.uc.js (la comete part d'ici)
        window.__lastLinkClick = { x: event.clientX, y: event.clientY, t: performance.now() };
        burstAt(event.clientX, event.clientY, config);
    }

    function init() {
        if (window.__middleClickSparksInit) return;
        window.__middleClickSparksInit = true;

        injectStyles();

        // mousedown = instantané ; auxclick = secours si mousedown n'est pas transmis par la page
        for (const type of ['mousedown', 'auxclick']) {
            window.addEventListener(type, onClick, true);
        }
    }

    if (gBrowserInit?.delayedStartupFinished) {
        init();
    } else {
        const obs = (subject, topic) => {
            if (topic === 'browser-delayed-startup-finished' && subject === window) {
                Services.obs.removeObserver(obs, topic);
                init();
            }
        };
        Services.obs.addObserver(obs, 'browser-delayed-startup-finished');
    }
})();
