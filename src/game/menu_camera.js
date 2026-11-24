import { FPSCamera } from '../engine/camera.js';

// Câmera de fundo do menu principal: órbita lenta em torno de um ponto do campus.
// Só calcula posição e orientação (yaw/pitch) para a FPSCamera da engine; o desenho
// continua sendo feito pelo WebGL, com as mesmas matrizes de visão e projeção do jogo.
export class MenuCamera {
    constructor({ target = { x: 0, y: 2, z: -10 }, radius = 30, height = 14, speed = 0.05 } = {}) {
        this.target = target;
        this.radius = radius;
        this.height = height;
        this.speed = speed; // rad/s
        this.camera = new FPSCamera();
        this.camera.fov = 60 * Math.PI / 180;
    }

    // Posiciona a câmera para o instante `seconds` e a devolve. Função pura do tempo.
    at(seconds) {
        const angle = seconds * this.speed;
        const { target, radius, height, camera } = this;
        camera.position = {
            x: target.x + Math.cos(angle) * radius,
            y: height,
            z: target.z + Math.sin(angle) * radius,
        };
        const dx = target.x - camera.position.x;
        const dy = target.y - camera.position.y;
        const dz = target.z - camera.position.z;
        const horizontal = Math.hypot(dx, dz);
        // Mesma convenção de Player/FPSCamera: frente = (-sen(yaw), -cos(yaw)); pitch > 0 olha para cima.
        camera.yaw = Math.atan2(-dx, -dz);
        camera.pitch = Math.atan2(dy, horizontal);
        return camera;
    }
}
