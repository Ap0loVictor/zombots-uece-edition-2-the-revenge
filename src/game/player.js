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
        this.maxStep = 0.5;       // maior degrau que dá para subir (meio-fio ≈ 0,12; degrau de escada ≈ 0,28)
        this.stepSmoothing = 30;  // quão rápido o corpo acompanha o desnível (1/s)
        this.verticalVelocity = 0;
        this.jumpSpeed = 5.2;
        this.gravity = 14;
        // Mantém a margem de colisão do jogador, independente da roupa e da animação.
        this.halfSize = { x: 0.8 / Math.SQRT2, y: 0.9, z: 0.8 / Math.SQRT2 };
        this.syncCamera();
    }

    get collider() {
        return createAABB({ ...this.position, y: this.position.y + this.halfSize.y }, this.halfSize);
    }

    // groundHeightAt(x, z, y) devolve a altura do chão no ponto para quem está na altura y.
    update(input, dt, colliders, groundHeightAt = () => 0) {
        const previous = { ...this.position };
        this.camera.look(input.getMouseDelta());
        const forward = Number(input.isPressed('KeyW') || input.isPressed('ArrowUp')) -
            Number(input.isPressed('KeyS') || input.isPressed('ArrowDown'));
        const strafe = Number(input.isPressed('KeyD') || input.isPressed('ArrowRight')) -
            Number(input.isPressed('KeyA') || input.isPressed('ArrowLeft'));
        const magnitude = Math.hypot(forward, strafe);
        if (magnitude > 0) {
            const yaw = this.camera.yaw;
            const speed = input.isPressed('ShiftLeft') || input.isPressed('ShiftRight') ? this.runSpeed : this.walkSpeed;
            const distance = speed * dt / magnitude;
            const displacement = {
                x: (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * distance,
                y: 0,
                z: (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * distance,
            };
            const center = moveAABB({ ...this.position, y: this.position.y + this.halfSize.y },
                this.halfSize, displacement, colliders);
            // Desnível alto demais funciona como parede; tenta deslizar por um eixo de cada vez.
            const canStand = (x, z) => groundHeightAt(x, z, this.position.y) - this.position.y <= this.maxStep;
            if (canStand(center.x, center.z)) {
                this.position.x = center.x;
                this.position.z = center.z;
            } else if (canStand(center.x, this.position.z)) {
                this.position.x = center.x;
            } else if (canStand(this.position.x, center.z)) {
                this.position.z = center.z;
            }
        }
        this.updateVertical(input, dt, groundHeightAt);
        this.syncCamera();
        this.mesh?.update?.(Math.hypot(this.position.x - previous.x, this.position.z - previous.z), dt,
            this.verticalVelocity === 0);
    }

    // Vertical: no chão (ou num degrau pequeno) acompanha o desnível suavemente;
    // no ar vale a gravidade e o pouso encosta na altura do chão sob os pés.
    updateVertical(input, dt, groundHeightAt) {
        const ground = groundHeightAt(this.position.x, this.position.z, this.position.y);
        const grounded = this.verticalVelocity <= 0 && this.position.y - ground <= 0.05;
        if (input.consumePress?.('Space') && grounded) this.verticalVelocity = this.jumpSpeed;

        if (this.verticalVelocity <= 0 && this.position.y - ground <= this.maxStep) {
            // Degrau pequeno (meio-fio): sobe ou desce sem queda.
            this.verticalVelocity = 0;
            const difference = ground - this.position.y;
            if (Math.abs(difference) < 1e-4) this.position.y = ground;
            else this.position.y += difference * (1 - Math.exp(-this.stepSmoothing * dt));
        } else {
            this.verticalVelocity -= this.gravity * dt;
            this.position.y += this.verticalVelocity * dt;
            if (this.verticalVelocity <= 0 && this.position.y <= ground) {
                this.position.y = ground;
                this.verticalVelocity = 0;
            }
        }
    }

    syncCamera() {
        this.camera.position = { ...this.position, y: this.position.y + this.eyeHeight };
    }

    draw(programInfo) {
        this.mesh.modelMatrix = Matrix4.multiply(
            Matrix4.translation(this.position.x, this.position.y, this.position.z),
            Matrix4.rotationY(this.camera.yaw));
        this.mesh.draw(programInfo);
    }
}
