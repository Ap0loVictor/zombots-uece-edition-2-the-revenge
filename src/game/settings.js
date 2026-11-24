// Configurações do jogador: modelo puro (sem DOM), validação e persistência opcional.

// Velocidade angular do mouse com sensibilidade 100% (igual ao padrão de FPSCamera).
export const BASE_LOOK_SPEED = 0.0025;

export const SETTINGS_SPEC = {
    sensitivity: { min: 25, max: 300, step: 5, default: 100, unit: '%' },
    fov: { min: 60, max: 110, step: 5, default: 70, unit: '°' },
    volume: { min: 0, max: 100, step: 5, default: 100, unit: '%' },
};

export const DEFAULT_SETTINGS = Object.freeze({
    sensitivity: SETTINGS_SPEC.sensitivity.default,
    fov: SETTINGS_SPEC.fov.default,
    volume: SETTINGS_SPEC.volume.default,
    showHints: true,
});

const STORAGE_KEY = 'zombots.settings.v1';

// Aceita qualquer valor (inclusive vindo de armazenamento corrompido) e devolve configurações válidas.
export function sanitizeSettings(raw) {
    const result = { ...DEFAULT_SETTINGS };
    for (const [name, { min, max, step }] of Object.entries(SETTINGS_SPEC)) {
        const value = Number(raw?.[name]);
        if (raw?.[name] === null || raw?.[name] === undefined || raw?.[name] === '' || !Number.isFinite(value)) continue;
        const snapped = min + Math.round((value - min) / step) * step;
        result[name] = Math.min(max, Math.max(min, snapped));
    }
    if (typeof raw?.showHints === 'boolean') result.showHints = raw.showHints;
    return result;
}

export function lookSpeedFor(settings) {
    return BASE_LOOK_SPEED * settings.sensitivity / 100;
}

export function fovRadians(settings) {
    return settings.fov * Math.PI / 180;
}

function defaultStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null; // acesso bloqueado (modo privado, políticas do navegador)
    }
}

export function loadSettings(storage = defaultStorage()) {
    try {
        const text = storage?.getItem(STORAGE_KEY);
        return sanitizeSettings(text ? JSON.parse(text) : null);
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings, storage = defaultStorage()) {
    try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
        return true;
    } catch {
        return false; // as configurações continuam valendo até recarregar a página
    }
}
