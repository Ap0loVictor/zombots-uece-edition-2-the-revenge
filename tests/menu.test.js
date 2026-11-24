import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuCamera } from '../src/game/menu_camera.js';

const forward = camera => {
    const c = Math.cos(camera.pitch);
    return { x: -Math.sin(camera.yaw) * c, y: Math.sin(camera.pitch), z: -Math.cos(camera.yaw) * c };
};

test('câmera do menu olha para o alvo em qualquer instante', () => {
    const menu = new MenuCamera();
    for (const t of [0, 1, 7.3, 60, 123.4]) {
        const camera = menu.at(t);
        const to = { x: menu.target.x - camera.position.x, y: menu.target.y - camera.position.y, z: menu.target.z - camera.position.z };
        const length = Math.hypot(to.x, to.y, to.z);
        const f = forward(camera);
        assert.ok(Math.abs(f.x - to.x / length) < 1e-9);
        assert.ok(Math.abs(f.y - to.y / length) < 1e-9);
        assert.ok(Math.abs(f.z - to.z / length) < 1e-9);
    }
});

test('câmera do menu orbita a raio e altura constantes', () => {
    const menu = new MenuCamera({ radius: 25, height: 12 });
    for (const t of [0, 5, 31]) {
        const { position } = menu.at(t);
        assert.ok(Math.abs(Math.hypot(position.x - menu.target.x, position.z - menu.target.z) - 25) < 1e-9);
        assert.equal(position.y, 12);
    }
});

test('câmera do menu realmente se move com o tempo', () => {
    const menu = new MenuCamera();
    const a = { ...menu.at(0).position };
    const b = { ...menu.at(10).position };
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1);
});
