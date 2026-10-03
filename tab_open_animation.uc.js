// ==UserScript==
// @name           Tab Open Animations
// @version        2.2
// @description    Animation a l'ouverture d'un onglet (Comete, Laser, Bulles).
// @compatibility  Firefox 100+
// ==/UserScript==

(() => {
    const STYLE_ID = 'tab-open-animations-styles';
    const PREF_PREFIX = 'extension.middle-click-tab-animation.';
    const STARTUP_GRACE_MS = 3000;   // ignore les onglets restaures au demarrage

    const DEFAULTS = { style: 'comete', speed: 160, debug: false };
    const CLICK_WINDOW_MS = 1200;   // un clic sur lien plus recent que ca = origine de la comete

    const COLOR = 'var(--tao-color)';
    const LIGHT = 'color-mix(in srgb, var(--tao-color) 55%, white)';
    const GOLD = '#ffd166';

    let S = 1;        // facteur de duree (1 = normal, 2 = deux fois plus lent)
    let ready = false;
    let cfg = null;

    /* ---------- prefs ---------- */

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

    function readConfig() {
        let speed = parseInt(readPref('tab-animation-speed', DEFAULTS.speed), 10);
        if (Number.isNaN(speed)) speed = DEFAULTS.speed;
        speed = Math.min(300, Math.max(25, speed));
        const dbg = readPref('debug', DEFAULTS.debug);
        return {
            style: String(readPref('tab-animation-style', DEFAULTS.style)),
            slow: 100 / speed,
            debug: dbg === true || dbg === 'true',
        };
    }

    /* ---------- styles + helpers ---------- */

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .tao-container {
                position: absolute;
                width: 0;
                height: 0;
                pointer-events: none;
                z-index: 99999;
                --tao-color: color-mix(in srgb, var(--zen-primary-color, #7F77DD), #e6e8e6);
            }
            .tao-item {
                position: absolute;
                pointer-events: none;
                will-change: transform, opacity;
            }
        `;
        document.head.appendChild(style);
    }

    function getAnimationParent() {
        return document.getElementById('browser')
            || document.getElementById('main-window')
            || document.documentElement;
    }

    const rand = (a, b) => a + Math.random() * (b - a);

    function dot(c, w, h, bg, radius) {
        const e = document.createElement('div');
        e.className = 'tao-item';
        e.style.cssText += `width:${w}px;height:${h}px;left:${-w / 2}px;top:${-h / 2}px;background:${bg};border-radius:${radius}`;
        c.appendChild(e);
        return e;
    }

    function ring(c, size, delay, dur, bw) {
        const e = dot(c, size, size, 'transparent', '50%');
        e.style.border = `${bw}px solid ${COLOR}`;
        e.animate(
            [{ transform: 'scale(.05)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }],
            { duration: dur * S, delay: delay * S, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }
        );
    }

    function sparks(c, n, dist, len = [12, 18]) {
        for (let i = 0; i < n; i++) {
            const e = dot(c, rand(len[0], len[1]), 2.5, COLOR, '2px');
            const a = i * (360 / n) + rand(-8, 8);
            const d = dist * rand(0.75, 1.15);
            e.animate([
                { transform: `rotate(${a}deg) translateX(14px)`, opacity: 1 },
                { transform: `rotate(${a}deg) translateX(${d}px) scaleX(.2)`, opacity: 0 },
            ], { duration: 520 * S, easing: 'ease-out', fill: 'forwards' });
        }
    }

    /* ---------- animations ---------- */

    const EZ = 'cubic-bezier(.2,.8,.3,1)';
    let origin = null;   // position du dernier clic sur un lien, ou null

    const EFFECTS = {
        // Une comete part du clic (ou d'un point par defaut), percute l'onglet, etincelles dorees
        comete(tab, r, c) {
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            let sx, sy;
            if (origin) { sx = origin.x - cx; sy = origin.y - cy; }
            else { sx = 330; sy = -120; }
            const dist = Math.hypot(sx, sy);
            const d = Math.min(420, Math.max(200, 140 + dist * 0.35)) * S;   // rapide : 200-420 ms a 100%
            const pop = 120 * S;
            const o = d / (d + pop);

            tab.animate([
                { opacity: 0, transform: 'scale(.5)' },
                { opacity: 0, transform: 'scale(.5)', offset: o * 0.92 },
                { opacity: 1, transform: 'scale(1.1)', offset: o },
                { opacity: 1, transform: 'scale(1)' },
            ], { duration: d + pop, easing: EZ, fill: 'backwards' });

            for (let i = 0; i < 9; i++) {
                const s = 9 - i * 0.8;
                const e = dot(c, s, s, i === 0 ? '#fff' : (i % 2 ? COLOR : LIGHT), '50%');
                e.animate([
                    { transform: `translate(${sx}px,${sy}px)`, opacity: 0 },
                    { opacity: 1 - i * 0.09, offset: 0.1 },
                    { transform: 'translate(0,0)', opacity: 1 - i * 0.09, offset: 0.98 },
                    { transform: 'translate(0,0)', opacity: 0 },
                ], { duration: d, delay: i * 20 * S, easing: 'cubic-bezier(.4,0,.7,.7)', fill: 'both' });
            }
            // l'impact se cale sur la position REELLE de l'onglet au moment de l'arrivee
            setTimeout(() => {
                const rr = tab.getBoundingClientRect();
                const c2 = makeContainer(rr.width > 0 ? rr : r);
                sparks(c2, 12, 60, [8, 14], GOLD);
                ring(c2, 120, 0, 450, 2);
                setTimeout(() => c2.remove(), 1500 * S);
            }, d);
        },

        // Un rayon traverse la page, l'onglet se devoile en balayage
        laser(tab, r, c) {
            const W = 420, D = 520 * S;
            const dir = (r.left + r.width / 2) > window.innerWidth / 2 ? -1 : 1;   // sidebar a droite -> rayon vers la gauche
            const origin = dir > 0 ? 'left center' : 'right center';
            const left = dir > 0 ? '0' : `${-W}px`;

            const b = dot(c, W, 3, COLOR, '2px');
            b.style.left = left; b.style.top = '-1.5px'; b.style.transformOrigin = origin;
            b.animate([
                { transform: 'scaleX(0)', opacity: 1 },
                { transform: 'scaleX(1)', opacity: 1, offset: 0.45 },
                { transform: 'scaleX(1)', opacity: 0 },
            ], { duration: D, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });

            const b2 = dot(c, W * 0.7, 1.5, LIGHT, '2px');
            b2.style.left = dir > 0 ? '0' : `${-W * 0.7}px`; b2.style.top = '8px'; b2.style.transformOrigin = origin;
            b2.animate([
                { transform: 'scaleX(0)', opacity: 1 },
                { transform: 'scaleX(1)', opacity: 0.9, offset: 0.5 },
                { transform: 'scaleX(1)', opacity: 0 },
            ], { duration: D, delay: 70 * S, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });

            const from = dir > 0 ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
            tab.animate([{ clipPath: from, opacity: 1 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }],
                { duration: 420 * S, delay: 80 * S, easing: EZ, fill: 'backwards' });

            setTimeout(() => {
                const e = dot(c, 10, 10, '#fff', '50%');
                e.style.left = `${dir * W - 5}px`;
                e.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(3)', opacity: 0 }],
                    { duration: 300 * S, fill: 'both' });
            }, D * 0.4);
        },

        // Des bulles montent de l'onglet et eclatent
        bulles(tab, r, c) {
            const dir = (r.left + r.width / 2) > window.innerWidth / 2 ? -1 : 1;
            tab.animate([
                { transform: 'translateY(18px)', opacity: 0 },
                { transform: 'translateY(0)', opacity: 1 },
            ], { duration: 420 * S, delay: 200 * S, easing: EZ, fill: 'backwards' });

            for (let i = 0; i < 16; i++) {
                const s = rand(8, 24);
                const e = dot(c, s, s, 'transparent', '50%');
                e.style.border = `1.5px solid ${i % 3 ? COLOR : LIGHT}`;
                const x = dir * rand(-r.width * 0.5 - 30, r.width * 0.5 + 90);
                const y = rand(-90, -170), sw = rand(-14, 14);
                e.animate([
                    { transform: 'translate(0,12px) scale(.3)', opacity: 0 },
                    { transform: `translate(${x * 0.5 + sw}px,${y * 0.5}px) scale(1)`, opacity: 0.9, offset: 0.55 },
                    { transform: `translate(${x}px,${y}px) scale(1.5)`, opacity: 0 },
                ], { duration: rand(650, 1000) * S, delay: rand(0, 260) * S, easing: 'ease-out', fill: 'both' });
            }
        },
    };

    function pickStyle(name) {
        if (name === 'random') {
            const keys = Object.keys(EFFECTS);
            return keys[Math.floor(Math.random() * keys.length)];
        }
        return EFFECTS[name] ? name : 'comete';
    }

    /* ---------- ouverture d'onglet ---------- */

    // Attend que Zen ait fini de placer l'onglet (sa hauteur/position se stabilisent)
    function whenSettled(tab, cb) {
        let last = null;
        const check = (i) => {
            const r = tab.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && last
                && Math.abs(r.top - last.top) < 0.5 && Math.abs(r.height - last.height) < 0.5) {
                return cb(r);
            }
            last = r;
            if (i < 40) requestAnimationFrame(() => check(i + 1));
            else cb(r.width > 0 && r.height > 0 ? r : null);
        };
        requestAnimationFrame(() => check(0));
    }

    function makeContainer(r) {
        const parent = getAnimationParent();
        const p = parent.getBoundingClientRect();
        const c = document.createElement('div');
        c.className = 'tao-container';
        c.style.left = `${r.left + r.width / 2 - p.left}px`;
        c.style.top = `${r.top + r.height / 2 - p.top}px`;
        parent.appendChild(c);
        return c;
    }

    function run(tab, r, name) {
        S = cfg.slow;

        const lc = window.__lastLinkClick;
        origin = (lc && performance.now() - lc.t < CLICK_WINDOW_MS) ? lc : null;
        window.__lastLinkClick = null;   // un clic = un seul onglet

        const c = makeContainer(r);
        if (cfg.debug) console.log('[TabOpenAnimations]', name, r, origin ? 'depuis le clic' : 'origine par defaut');
        EFFECTS[name](tab, r, c);
        setTimeout(() => c.remove(), 2500 * S);
    }

    // Hauteur "normale" d'un onglet (Zen anime la hauteur du nouvel onglet depuis 0)
    function normalTabHeight() {
        const ref = gBrowser.selectedTab;
        const h = ref ? ref.getBoundingClientRect().height : 0;
        return h > 10 ? h : 36;
    }

    function onTabOpen(event) {
        if (!ready) return;
        const en = readPref('tab-animation-enabled', true);
        if (en === false || en === 'false') return;
        const tab = event.target;
        if (!tab || tab.localName !== 'tab') return;
        if (tab.hasAttribute('zen-glance-tab')) return;

        cfg = readConfig();
        const name = pickStyle(cfg.style);

        // masque l'onglet des l'ouverture pour eviter un flash avant l'animation
        const hold = tab.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 2000, fill: 'forwards' });

        const done = (r) => {
            try {
                if (r) run(tab, r, name);
            } catch (e) {
                console.error('[TabOpenAnimations]', e);
            }
            hold.cancel();
        };

        // Comete : depart immediat (pas d'attente que Zen finisse de placer l'onglet),
        // on vise la position de l'onglet avec sa hauteur normale.
        if (name === 'comete') {
            const r = tab.getBoundingClientRect();
            if (r.width > 0) {
                const h = normalTabHeight();
                done({ left: r.left, top: r.top, width: r.width, height: h, right: r.right, bottom: r.top + h });
                return;
            }
        }
        whenSettled(tab, done);
    }

    function init() {
        if (window.__tabOpenAnimationsInit) return;
        window.__tabOpenAnimationsInit = true;
        injectStyles();
        gBrowser.tabContainer.addEventListener('TabOpen', onTabOpen);
        setTimeout(() => { ready = true; }, STARTUP_GRACE_MS);
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
