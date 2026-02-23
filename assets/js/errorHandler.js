// assets/js/errorHandler.js
(function () {
  window.PS = window.PS || {};

  const PREFIX = '[PS-ERROR]';
  const DEFAULT_TITLE = 'Fehler';

  function normalizeError(err, fallbackMessage) {
    if (!err) {
      return {
        title: DEFAULT_TITLE,
        message: fallbackMessage || 'Unbekannter Fehler.',
        raw: err
      };
    }

    if (typeof err === 'string') {
      return { title: DEFAULT_TITLE, message: err, raw: err };
    }

    const title = err.title || DEFAULT_TITLE;
    const message = err.message || fallbackMessage || 'Unbekannter Fehler.';

    return { title, message, raw: err };
  }

  function ensureGlobalContainer() {
    let container = document.getElementById('psGlobalErrorContainer');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'psGlobalErrorContainer';
    container.className = 'ps-global-error-container';
    document.body.appendChild(container);
    return container;
  }

  function buildMessage(title, message) {
    return `⚠️ ${title}: ${message}`;
  }

  function log(errorLike, context = 'general') {
    const normalized = normalizeError(errorLike);
    console.error(`${PREFIX} [${context}] ${normalized.title}: ${normalized.message}`, normalized.raw);
    return normalized;
  }

  function showInline(targetEl, errorLike, options = {}) {
    if (!targetEl) return;
    const normalized = normalizeError(errorLike, options.fallbackMessage);
    targetEl.textContent = buildMessage(normalized.title, normalized.message);
    targetEl.classList.add('ps-inline-error');
    if (options.log !== false) log(normalized, options.context || 'inline');
  }

  function clearInline(targetEl) {
    if (!targetEl) return;
    targetEl.textContent = '';
    targetEl.classList.remove('ps-inline-error');
  }

  function showGlobal(errorLike, options = {}) {
    const normalized = normalizeError(errorLike, options.fallbackMessage);
    if (options.log !== false) log(normalized, options.context || 'global');

    const container = ensureGlobalContainer();
    const item = document.createElement('div');
    item.className = 'ps-global-error-item';
    item.textContent = buildMessage(normalized.title, normalized.message);
    container.appendChild(item);

    const timeoutMs = Number(options.timeoutMs ?? 8000);
    if (timeoutMs > 0) {
      window.setTimeout(() => item.remove(), timeoutMs);
    }
  }

  function mapConfigError(message) {
    if (String(message || '').includes('Supabase nicht konfiguriert')) {
      return {
        title: 'Konfigurationsfehler',
        message: "Supabase ist nicht konfiguriert. Cloud: 'config.json' (aus 'config.json.example') mit SUPABASE_URL + SUPABASE_ANON_KEY bereitstellen. Lokal: 'config.local.example.js' nach 'config.local.js' kopieren."
      };
    }
    return null;
  }

  window.PS.error = {
    normalizeError,
    mapConfigError,
    log,
    showInline,
    clearInline,
    showGlobal
  };

  window.addEventListener('error', (event) => {
    const mapped = mapConfigError(event?.error?.message || event?.message);
    showGlobal(mapped || event.error || event.message || 'Unbehandelter Fehler', {
      context: 'window.error'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const mapped = mapConfigError(reason?.message || reason);
    showGlobal(mapped || reason || 'Unbehandeltes Promise-Rejection', {
      context: 'window.unhandledrejection'
    });
  });
})();
