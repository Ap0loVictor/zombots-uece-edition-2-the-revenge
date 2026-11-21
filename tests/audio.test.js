import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { GameAudio } from '../src/engine/audio.js';

function setup() {
    const elements = [];
    const audio = new GameAudio(url => {
        const element = { url, paused: true, currentTime: 0, plays: 0,
            play() { this.paused = false; this.plays++; return Promise.resolve(); },
            pause() { this.paused = true; },
            removeAttribute() { this.removed = true; }, load() {} };
        elements.push(element);
        return element;
    });
    return { audio, elements };
}

test('todos os arquivos de áudio configurados existem', async () => {
    const { elements } = setup();
    for (const element of elements) await access(new URL(element.url));
});

test('áudio respeita pausa, mute, retomada e descarte', () => {
    const { audio, elements } = setup();
    audio.play('pistola');
    assert.ok(elements.every(e => e.plays === 0));
    audio.setPlaying(true);
    audio.play('pistola');
    audio.play('pistola');
    assert.equal(audio.pools.get('pistola').filter(e => !e.paused).length, 2);
    audio.setPlaying(false);
    assert.ok(elements.every(e => e.paused));
    audio.setPlaying(true);
    audio.toggleMute();
    assert.ok(elements.every(e => e.paused));
    audio.play('sniper');
    assert.equal(audio.pools.get('sniper')[0].plays, 0);
    audio.toggleMute();
    assert.ok(elements.every(e => e.paused));
    audio.play('sniper');
    assert.equal(audio.pools.get('sniper')[0].plays, 1);
    audio.dispose();
    assert.ok(elements.every(e => e.removed && e.paused));
    assert.equal(audio.pools.size, 0);
});

test('somente sons de armas são carregados e entrar não reproduz áudio', () => {
    const { audio, elements } = setup();
    assert.deepEqual([...audio.pools.keys()], ['pistola', 'akm', 'escopeta', 'sniper']);
    audio.setPlaying(true);
    assert.ok(elements.every(e => e.plays === 0));
});

test('rejeição de autoplay não interrompe o jogo', async () => {
    const { audio } = setup();
    audio.pools.get('akm')[0].play = () => Promise.reject(new Error('autoplay'));
    audio.setPlaying(true);
    audio.play('akm');
    await Promise.resolve();
});
