import { Matrix4 } from '../engine/matrix.js';
import { createAABB, moveAABB } from '../engine/collision.js';

export class Enemy {
    constructor(name, position, color) {
        this.name = name;
        this.position = { ...position };
        this.color = color;
        this.speed = 1.1;
        this.stopDistance = 1.15;
        this.halfSize = { x: 0.46, y: 1.05, z: 0.4 };
        this.yaw = 0;
    }

    get collider() {
        return createAABB({ x: this.position.x, y: this.position.y + this.halfSize.y, z: this.position.z }, this.halfSize);
    }

    update(dt, target, obstacles, groundHeightAt = () => 0) {
        this.position.y = groundHeightAt(this.position.x, this.position.z, this.position.y);
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance === 0) return;
        this.yaw = Math.atan2(dx, dz);
        // A distância de parada evita contato; os AABBs evitam atravessar cenário, jogador e outros inimigos.
        const step = Math.min(this.speed * dt, Math.max(0, distance - this.stopDistance));
        if (step === 0) return;
        const center = moveAABB(
            { x: this.position.x, y: this.position.y + this.halfSize.y, z: this.position.z },
            this.halfSize,
            { x: dx / distance * step, y: 0, z: dz / distance * step },
            obstacles,
        );
        this.position.x = center.x;
        this.position.z = center.z;
        this.position.y = groundHeightAt(this.position.x, this.position.z, this.position.y);
    }

    draw(mesh, programInfo, elapsed) {
        if (mesh.maxY !== undefined) {
            const scale = 1.8 / Math.max(mesh.maxY - mesh.minY, 1e-6);
            mesh.color = [1, 1, 1, 1];
            mesh.modelMatrix = Matrix4.multiply(
                Matrix4.translation(this.position.x, this.position.y, this.position.z),
                Matrix4.multiply(Matrix4.rotationY(this.yaw),
                    Matrix4.multiply(Matrix4.scaling(scale, scale, scale),
                        Matrix4.translation(-mesh.centerX, -mesh.minY, -mesh.centerZ))),
            );
            mesh.draw(programInfo);
            return;
        }
        // Animação ociosa: mantém a cena viva sem criar lógica de combate.
        const bob = Math.sin(elapsed * 2 + this.position.x) * 0.035;
        mesh.color = this.color;
        mesh.modelMatrix = Matrix4.multiply(Matrix4.translation(this.position.x, 0.8 + bob, this.position.z),
            Matrix4.multiply(Matrix4.rotationY(this.yaw), Matrix4.scaling(0.85, 1.55, 0.62)));
        mesh.draw(programInfo);
        mesh.modelMatrix = Matrix4.multiply(Matrix4.translation(this.position.x, 1.8 + bob, this.position.z),
            Matrix4.multiply(Matrix4.rotationY(this.yaw), Matrix4.scaling(0.58, 0.5, 0.58)));
        mesh.draw(programInfo);
    }
}
