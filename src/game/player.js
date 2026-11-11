import { Matrix4 } from '../engine/matrix.js';
import { FPSCamera } from '../engine/camera.js';
import { createAABB, moveAABB } from '../engine/collision.js';

export class Player {
    constructor(spawn, mesh) {
        this.position = { x: spawn.x, y: spawn.y, z: spawn.z };
        this.mesh = mesh;
        this.camera = new FPSCamera();
        this.camera.yaw = spawn.yaw ?? 0;
        this.eyeHeight = 1.6;
        this.walkSpeed = 3;
        this.runSpeed = 5.5;
        this.bodySize = 0.8;
        this.bodyHeight = 0.8;
        // Abrange os cantos do cubo mesmo quando ele gira; a câmera também fica protegida.
        this.halfSize = { x: this.bodySize / Math.SQRT2, y: 0.9, z: this.bodySize / Math.SQRT2 };
        this.syncCamera();
    }

    get collider() {
        return createAABB({ ...this.position, y: this.position.y + this.halfSize.y }, this.halfSize);
    }

    update(input, dt, colliders) {
        this.camera.look(input.getMouseDelta());
        const forward = Number(input.isPressed('KeyW') || input.isPressed('ArrowUp')) -
            Number(input.isPressed('KeyS') || input.isPressed('ArrowDown'));
        const strafe = Number(input.isPressed('KeyD') || input.isPressed('ArrowRight')) -
            Number(input.isPressed('KeyA') || input.isPressed('ArrowLeft'));
        const magnitude = Math.hypot(forward, strafe);
        if (magnitude > 0) {
            const yaw = this.camera.yaw;
            const speed = input.isPressed('Space') ? this.runSpeed : this.walkSpeed;
            const distance = speed * dt / magnitude;
            const displacement = {
                x: (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * distance,
                y: 0,
                z: (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * distance,
            };
            const center = moveAABB({ ...this.position, y: this.position.y + this.halfSize.y },
                this.halfSize, displacement, colliders);
            this.position.x = center.x;
            this.position.z = center.z;
        }
        this.syncCamera();
    }

    syncCamera() {
        this.camera.position = { ...this.position, y: this.position.y + this.eyeHeight };
    }

    draw(programInfo) {
        this.mesh.modelMatrix = Matrix4.multiply(
            Matrix4.translation(this.position.x, this.position.y + this.bodyHeight, this.position.z),
            Matrix4.multiply(Matrix4.rotationY(this.camera.yaw), Matrix4.scaling(this.bodySize, this.bodySize, this.bodySize)));
        this.mesh.draw(programInfo);
    }
}
