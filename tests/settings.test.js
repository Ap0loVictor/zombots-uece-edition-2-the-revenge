import test from 'node:test';
import assert from 'node:assert/strict';
import { FPSCamera } from '../src/engine/camera.js';
import {
    BASE_LOOK_SPEED, DEFAULT_SETTINGS, SETTINGS_SPEC, fovRadians, loadSettings, lookSpeedFor, sanitizeSettings, saveSettings,
} from '../src/game/settings.js';

const memoryStorage = (initial = {}) => {
    const data = new Map(Object.entries(initial));
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), data };
};

test('padrões coincidem com a câmera e o jogo originais', () => {
    const camera = new FPSCamera();
    assert.equal(BASE_LOOK_SPEED, camera.lookSpeed);
    assert.equal(lookSpeedFor(DEFAULT_SETTINGS), camera.lookSpeed);
    assert.ok(Math.abs(fovRadians(DEFAULT_SETTINGS) - camera.fov) < 1e-12);
    assert.equal(DEFAULT_SETTINGS.volume, 100);
    assert.equal(DEFAULT_SETTINGS.showHints, true);
});

test('sanitizeSettings limita, arredonda ao passo e ignora lixo', () => {
    assert.deepEqual(sanitizeSettings(null), { ...DEFAULT_SETTINGS });
    assert.deepEqual(sanitizeSettings('texto'), { ...DEFAULT_SETTINGS });
    const s = sanitizeSettings({ sensitivity: 9999, fov: -5, volume: 47, showHints: false });
    assert.equal(s.sensitivity, SETTINGS_SPEC.sensitivity.max);
    assert.equal(s.fov, SETTINGS_SPEC.fov.min);
    assert.equal(s.volume, 45);
    assert.equal(s.showHints, false);
    const bad = sanitizeSettings({ sensitivity: 'abc', fov: NaN, volume: null, showHints: 'sim' });
    assert.deepEqual(bad, { ...DEFAULT_SETTINGS });
    assert.equal(sanitizeSettings({ volume: 0 }).volume, 0);
});

test('sensibilidade e FOV viram valores da câmera', () => {
    assert.ok(Math.abs(lookSpeedFor({ sensitivity: 200 }) - BASE_LOOK_SPEED * 2) < 1e-12);
    assert.ok(Math.abs(fovRadians({ fov: 90 }) - Math.PI / 2) < 1e-12);
});

test('salvar e carregar configurações', () => {
    const storage = memoryStorage();
    assert.deepEqual(loadSettings(storage), { ...DEFAULT_SETTINGS });
    assert.equal(saveSettings({ sensitivity: 150, fov: 90, volume: 30, showHints: false }, storage), true);
    assert.deepEqual(loadSettings(storage), { sensitivity: 150, fov: 90, volume: 30, showHints: false });
});

test('armazenamento ausente, corrompido ou bloqueado não quebra o jogo', () => {
    assert.deepEqual(loadSettings(null), { ...DEFAULT_SETTINGS });
    assert.equal(saveSettings(DEFAULT_SETTINGS, null), true);
    const corrupted = memoryStorage({ 'zombots.settings.v1': '{não é json' });
    assert.deepEqual(loadSettings(corrupted), { ...DEFAULT_SETTINGS });
    const blocked = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('cheio'); } };
    assert.deepEqual(loadSettings(blocked), { ...DEFAULT_SETTINGS });
    assert.equal(saveSettings(DEFAULT_SETTINGS, blocked), false);
});
