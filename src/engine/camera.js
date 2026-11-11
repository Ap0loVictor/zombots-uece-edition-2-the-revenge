import { Matrix4 } from './matrix.js';

export class FPSCamera {
    constructor() {
        this.position = { x: 0, y: 0, z: 0 };
        this.yaw = 0;
        this.pitch = 0;
        this.lookSpeed = 0.0025;
        this.fov = 70 * Math.PI / 180;
    }

    look({ x, y }) {
        this.yaw = (this.yaw - x * this.lookSpeed) % (2 * Math.PI);
        const limit = 89 * Math.PI / 180;
        this.pitch = Math.max(-limit, Math.min(limit, this.pitch - y * this.lookSpeed));
    }

    getViewMatrix() {
        const { x, y, z } = this.position;
        return Matrix4.multiply(
            Matrix4.multiply(Matrix4.rotationX(-this.pitch), Matrix4.rotationY(-this.yaw)),
            Matrix4.translation(-x, -y, -z));
    }

    getProjectionMatrix(aspect) {
        return Matrix4.perspective(this.fov, aspect, 0.05, 100);
    }
}
