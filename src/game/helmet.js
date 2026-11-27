import { Matrix4 } from '../engine/matrix.js';
import { Mesh } from '../engine/mesh.js';
import { OMNI_INNER_COS, OMNI_OUTER_COS, lerp, lerpVector, normalize, transformDirection, transformPoint } from '../engine/lighting.js';

// Capacete com lanterna embutida. Começa jogado no chão (a luz dele é uma lâmpada fraca e instável
// que ilumina a sala). Ao ser pego (E), voa até a cabeça do jogador e a luz passa a ser uma
// lanterna (spot) acima da cabeça, apontada para onde ele olha.

const rad = degrees => degrees * Math.PI / 180;
const smooth = t => t * t * (3 - 2 * t);

export const ATTENUATION = [1, 0.07, 0.025];
const REACH = 1.4;               // distância para pegar o capacete
const FLIGHT_TIME = 0.55;        // s do chão até a cabeça
const REST_HEIGHT = 0.165;       // altura do centro da cúpula com o capacete de lado
const REST_TILT = 1.2;           // rad: capacete tombado de lado
const LAMP_LOCAL = [0, 0.055, 0.23];   // lâmpada na frente da cúpula (espaço do capacete)
const HEAD_OFFSET = [0, 0.17, -0.04];  // lanterna sobre a cabeça (espaço da câmera)

const FLOOR_LIGHT = { color: [0.8, 0.72, 0.52], innerCos: OMNI_INNER_COS, outerCos: OMNI_OUTER_COS };
const WORN_LIGHT = { color: [2.0, 1.9, 1.6], innerCos: Math.cos(rad(13)), outerCos: Math.cos(rad(36)) };

export class Helmet {
    constructor(gl, { x, z, yaw = 0 }, floorY = 0) {
        this.position = { x, y: floorY, z };
        this.yaw = yaw;
        this.state = 'floor';   // 'floor' → 'flying' → 'worn'
        this.t = 0;             // progresso do voo (0..1)
        this.nearby = false;
        this.sincePickup = Infinity;
        this.onPickup = () => {};

        this.meshes = {
            dome: Mesh.sphere(gl, 10, 20, true),
            box: Mesh.box(gl),
            disc: Mesh.cylinder(gl, 24),
            lens: Mesh.sphere(gl, 6, 10),
        };
        const yellow = [0.93, 0.72, 0.07, 1];
        const dark = [0.1, 0.11, 0.12, 1];
        const T = (x, y, z) => Matrix4.translation(x, y, z), S = (x, y, z) => Matrix4.scaling(x, y, z);
        // Espaço do capacete: origem no centro da cúpula, +Y = topo, +Z = frente.
        this.parts = [
            { mesh: this.meshes.dome, matrix: S(0.17, 0.12, 0.2), color: yellow, specular: 0.7, shininess: 60 },
            { mesh: this.meshes.disc, matrix: Matrix4.multiply(T(0, -0.002, 0), Matrix4.multiply(Matrix4.rotationX(Math.PI), S(0.168, 0.004, 0.198))), color: dark, specular: 0 },
            { mesh: this.meshes.box, matrix: Matrix4.multiply(T(0, 0.004, 0.215), S(0.2, 0.012, 0.12)), color: [0.82, 0.62, 0.05, 1], specular: 0.5, shininess: 40 },
            { mesh: this.meshes.box, matrix: Matrix4.multiply(T(0, 0.055, 0.185), S(0.075, 0.05, 0.05)), color: dark, specular: 0.5, shininess: 40 },
            { mesh: this.meshes.lens, matrix: Matrix4.multiply(T(0, 0.055, 0.213), S(0.026, 0.026, 0.012)), color: [1, 1, 0.9, 1], emissive: [1, 0.95, 0.7], specular: 0 },
        ];
    }

    // ---------- lógica ----------

    update(dt, player, input) {
        const pressed = input.consumePress?.('KeyE') ?? false;   // sempre consome: não acumula pressionamentos
        if (this.state === 'floor') {
            const dx = player.position.x - this.position.x, dz = player.position.z - this.position.z;
            this.nearby = Math.hypot(dx, dz) < REACH && Math.abs(player.position.y - this.position.y) < 1.5;
            if (this.nearby && pressed) {
                this.state = 'flying';
                this.t = 0;
                this.nearby = false;
                this.sincePickup = 0;
                this.onPickup();
            }
            return;
        }
        this.sincePickup += dt;
        if (this.state === 'flying') {
            this.t = Math.min(1, this.t + dt / FLIGHT_TIME);
            if (this.t >= 1) this.state = 'worn';
        }
    }

    // ---------- pose e desenho ----------

    // Posição da lanterna acima da cabeça e direção da mira, em espaço de mundo.
    headLight(camera) {
        const rotation = camera.getRotationMatrix();
        const p = camera.position;
        const offset = transformDirection(rotation, HEAD_OFFSET);
        return {
            position: [p.x + offset[0], p.y + offset[1], p.z + offset[2]],
            direction: normalize(transformDirection(rotation, [0, 0, -1])),
        };
    }

    // Matriz do capacete; e = 0 no chão, 1 na cabeça.
    matrix(camera, e = smooth(this.t)) {
        const rest = [this.position.x, this.position.y + REST_HEIGHT, this.position.z];
        let center = rest;
        if (e > 0) {
            const head = this.headLight(camera).position;
            center = lerpVector(rest, head, e);
            center[1] += Math.sin(Math.PI * e) * 0.35;   // arco no ar
        }
        return Matrix4.multiply(Matrix4.translation(...center),
            Matrix4.multiply(Matrix4.rotationY(this.yaw),
                Matrix4.multiply(Matrix4.rotationZ(REST_TILT * (1 - e)), Matrix4.scaling(1 - 0.5 * e, 1 - 0.5 * e, 1 - 0.5 * e))));
    }

    // Luz atual em espaço de mundo.
    light(camera, elapsed) {
        const e = this.state === 'floor' ? 0 : this.state === 'worn' ? 1 : smooth(this.t);
        const head = this.headLight(camera);
        // Lâmpada com defeito enquanto está no chão.
        const unstable = 0.18 + 0.18 * Math.sin(elapsed * 23) * Math.sin(elapsed * 7.1)
            + (Math.sin(elapsed * 3.3) > 0.93 ? 0.35 : 0);
        const flicker = 1 - (1 - e) * unstable;
        if (e >= 1) {
            return { ...head, color: WORN_LIGHT.color, attenuation: ATTENUATION, innerCos: WORN_LIGHT.innerCos, outerCos: WORN_LIGHT.outerCos };
        }
        const lamp = transformPoint(this.matrix(camera, e), LAMP_LOCAL);
        return {
            position: lerpVector(lamp, head.position, e),
            direction: normalize(lerpVector([0, 1, 0], head.direction, e)),
            color: lerpVector(FLOOR_LIGHT.color, WORN_LIGHT.color, e).map(value => value * flicker),
            attenuation: ATTENUATION,
            innerCos: lerp(FLOOR_LIGHT.innerCos, WORN_LIGHT.innerCos, e),
            outerCos: lerp(FLOOR_LIGHT.outerCos, WORN_LIGHT.outerCos, e),
        };
    }

    draw(programInfo, camera) {
        if (this.state === 'worn') return;   // em primeira pessoa o capacete está na cabeça
        const model = this.matrix(camera);
        for (const part of this.parts) {
            part.mesh.modelMatrix = Matrix4.multiply(model, part.matrix);
            part.mesh.color = part.color;
            part.mesh.specular = part.specular ?? 0.15;
            part.mesh.shininess = part.shininess ?? 24;
            part.mesh.emissive = part.emissive ?? [0, 0, 0];
            part.mesh.draw(programInfo);
        }
    }

    dispose() {
        Object.values(this.meshes).forEach(mesh => mesh.dispose());
    }
}
