import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONTROL_GROUPS, CREDITS, LORE } from '../src/game/menu_content.js';
import { WEAPON_DEFINITIONS } from '../src/game/weapons.js';

test('créditos na ordem pedida, seguidos da disciplina', () => {
    assert.deepEqual(CREDITS.people, ['Apolo Victor', 'Davi Jannsen', 'Gabriel Marques']);
    assert.equal(CREDITS.course, 'Computação Gráfica - Uece');
});

test('lore tem texto', () => {
    assert.ok(LORE.length >= 3);
    assert.ok(LORE.every(paragraph => paragraph.trim().length > 20));
    assert.ok(LORE.join(' ').includes('Mr. Black'));
});

test('tela de controles lista todas as ações do jogador', () => {
    const labels = CONTROL_GROUPS.flatMap(group => group.controls.flatMap(c => c.keys.flat()));
    for (const key of ['W', 'A', 'S', 'D', '↑', '←', '↓', '→', 'Mouse', 'Shift', 'Espaço', 'Botão esquerdo',
        '1', '2', '3', '4', 'Q', 'F', 'M', 'P', 'Esc']) {
        assert.ok(labels.includes(key), `falta a tecla ${key}`);
    }
    assert.ok(CONTROL_GROUPS.every(group => group.title && group.controls.length));
    assert.ok(CONTROL_GROUPS.flatMap(g => g.controls).every(c => c.action.length > 3 && c.keys.length));
});

test('teclas de arma mostradas existem nas definições das armas', () => {
    const digits = WEAPON_DEFINITIONS.map(weapon => weapon.key.replace('Digit', ''));
    const shown = CONTROL_GROUPS.flatMap(g => g.controls).flatMap(c => c.keys.flat()).filter(k => /^[0-9]$/.test(k));
    assert.deepEqual(shown.sort(), digits.sort());
});

test('index.html tem as cinco abas do menu e a ordem dos botões', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    for (const view of ['home', 'settings', 'lore', 'controls', 'credits']) {
        assert.ok(html.includes(`data-view="${view}"`), `falta a view ${view}`);
    }
    const order = ['data-action="start"', 'data-open="settings"', 'data-open="lore"', 'data-open="controls"', 'data-open="credits"']
        .map(marker => html.indexOf(marker));
    assert.ok(order.every(index => index > 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
});
