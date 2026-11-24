import { Matrix4 } from '../engine/matrix.js';
import { OBJLoader } from '../engine/obj_loader.js';
import { MeleeSystem } from './melee.js';
import { MeleeView } from './melee_view.js';
import { FirstPersonArms } from './character_model.js';

// Os assets apontam para +X; pegadas ficam em coordenadas locais da arma.
export const WEAPON_DEFINITIONS = [
    { name: 'Pistola', file: 'armapistola.obj', key: 'Digit1', sound: 'pistola',
        magazineSize: 12, reloadDuration: 1.4, shotInterval: 0.22,
        offset: [0.10, -0.27, -0.64], scale: 0.075, yaw: Math.PI / 2,
        grips: [{ side: 1, point: [2.25, -.10, 1.75], pitch: -.18 },
            { side: -1, point: [2.40, -.25, .40], roll: -.2, pitch: -.18 }],
        muzzle: [6.624849, 1.65, 1.487161] },
    { name: 'AKM', file: 'arma.obj', key: 'Digit2', sound: 'akm', automatic: true, shotInterval: 8 / 60,
        magazineSize: 30, reloadDuration: 2.2,
        offset: [0.12, -0.31, -0.85], scale: 0.055, yaw: Math.PI / 2,
        grips: [{ side: 1, point: [-3.15, -.40, 1.85], pitch: -.25 },
            { side: -1, point: [2.55, .65, 1.45], roll: -1.25 }],
        muzzle: [12.403117, 1.596228, 1.723988] },
    { name: 'Escopeta', file: 'armaescopeta.obj', key: 'Digit3', sound: 'escopeta',
        magazineSize: 8, reloadDuration: 2.6, shotInterval: 0.85, pellets: 8, spread: Math.PI / 30,
        offset: [0.12, -0.31, -0.85], scale: 0.055, yaw: Math.PI / 2,
        grips: [{ side: 1, point: [-3.15, -.40, 1.85], pitch: -.25 },
            { side: -1, point: [2.60, .65, 1.45], roll: -1.25 }],
        muzzle: [13.861917, 1.788772, 1.764079] },
    { name: 'Sniper', file: 'armasniper.obj', key: 'Digit4', sound: 'sniper',
        magazineSize: 5, reloadDuration: 2.8, shotInterval: 1.2,
        offset: [0.16, -0.32, -0.82], scale: 0.05, yaw: Math.PI / 2,
        grips: [{ side: 1, point: [-3.15, -.10, 1.85], pitch: -.25 },
            { side: -1, point: [2.65, .45, 1.45], roll: -1.25 }],
        muzzle: [18.201145, 2.138749, 0.767044] },
];

export function transformPoint(matrix, point) {
    return [0, 1, 2].map(row => matrix[12 + row] +
        point.reduce((sum, value, column) => sum + matrix[column * 4 + row] * value, 0));
}

export class WeaponSystem {
    static async load(gl) {
        const meshes = [];
        let bullet;
        try {
            for (const definition of WEAPON_DEFINITIONS) {
                meshes.push(await OBJLoader.load(gl, new URL(`../../assets/weapons/${definition.file}`, import.meta.url),
                    { excludeObjects: ['ArmModel', 'ArmModel.001'] }));
            }
            bullet = await OBJLoader.load(gl, new URL('../../assets/weapons/esfera.obj', import.meta.url));
            return new WeaponSystem(meshes, bullet, WEAPON_DEFINITIONS, new MeleeSystem(new MeleeView(gl)), new FirstPersonArms(gl));
        } catch (error) {
            meshes.forEach(mesh => mesh.dispose());
            bullet?.dispose();
            throw error;
        }
    }

    constructor(meshes, bulletMesh, definitions = WEAPON_DEFINITIONS, melee = new MeleeSystem(), arms = null) {
        this.arms = arms;
        this.melee = melee;
        this.meleeEquipped = false;
        this.weapons = definitions.map((definition, index) => ({
            ...definition, mesh: meshes[index],
            ammo: definition.magazineSize, cooldown: 0,
            localMatrix: Matrix4.multiply(Matrix4.translation(...definition.offset),
                Matrix4.multiply(Matrix4.rotationY(definition.yaw),
                    Matrix4.scaling(definition.scale, definition.scale, definition.scale))),
        }));
        this.selected = 0;
        this.onShoot = () => {};
        this.reloadRemaining = 0;
        this.frameDelta = 0;
        this.bulletMesh = bulletMesh;
        this.projectiles = [];
        this.speed = 24;
        this.lifetime = 3;
        this.maxDistance = 60;
        this.maxProjectiles = 64;
    }

    get equipped() { return this.weapons[this.selected]; }
    get showingMelee() { return this.meleeEquipped || this.melee.attacking; }
    get reloading() { return this.reloadRemaining > 0; }
    get reloadProgress() {
        return this.reloading ? 1 - this.reloadRemaining / this.equipped.reloadDuration : 0;
    }

    get reloadPose() {
        if (!this.reloading) return Matrix4.identity();
        const elapsed = this.equipped.reloadDuration - this.reloadRemaining;
        const smooth = value => {
            const t = Math.max(0, Math.min(1, value));
            return t * t * (3 - 2 * t);
        };
        // Baixa, mantém e retorna antes de liberar o próximo tiro. Usa o relógio da
        // recarga, então pausar congela a pose e cancelar não deixa inclinação residual.
        const amount = smooth(elapsed / 0.22) * smooth(this.reloadRemaining / 0.28);
        return Matrix4.multiply(Matrix4.translation(0, -0.40 - 0.035 * amount, 0.20),
            Matrix4.multiply(Matrix4.rotationX(-0.24 * amount), Matrix4.translation(0, 0.40, -0.20)));
    }

    select(index) {
        if (Number.isInteger(index) && index >= 0 && index < this.weapons.length) {
            if (index !== this.selected) this.reloadRemaining = 0;
            this.selected = index;
            this.meleeEquipped = false;
        }
    }

    reload() {
        if (this.showingMelee || this.reloading || this.equipped.ammo === this.equipped.magazineSize) return;
        this.reloadRemaining = this.equipped.reloadDuration;
    }

    shoot(camera) {
        const weapon = this.equipped;
        if (this.showingMelee || this.reloading || weapon.cooldown > 1e-9) return false;
        if (weapon.ammo === 0) {
            this.reload();
            return false;
        }
        const { x, y, z } = camera.position;
        const pose = Matrix4.multiply(Matrix4.translation(x, y, z),
            Matrix4.multiply(Matrix4.rotationY(camera.yaw), Matrix4.rotationX(camera.pitch)));
        const position = transformPoint(Matrix4.multiply(pose, this.equipped.localMatrix), this.equipped.muzzle);
        // Convergência no centro da mira a 40 unidades, partindo da boca real do cano.
        const target = transformPoint(pose, [0, 0, -40]);
        const delta = target.map((value, axis) => value - position[axis]);
        const length = Math.hypot(...delta);
        const forward = delta.map(value => value / length);
        // Base perpendicular ao tiro: o cone acompanha a mira, inclusive ao olhar para cima.
        const reference = Math.abs(forward[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const side = cross(forward, reference);
        const right = side.map(value => value / Math.hypot(...side));
        const up = cross(right, forward);
        const count = weapon.pellets ?? 1;
        const phase = count > 1 ? Math.random() * Math.PI * 2 : 0;
        for (let i = 0; i < count; i++) {
            const radius = Math.tan(weapon.spread ?? 0) * Math.sqrt(i / Math.max(1, count - 1));
            const angle = phase + i * Math.PI * (3 - Math.sqrt(5));
            const direction = forward.map((value, axis) => value + radius *
                (Math.cos(angle) * right[axis] + Math.sin(angle) * up[axis]));
            const magnitude = Math.hypot(...direction);
            if (this.projectiles.length >= this.maxProjectiles) this.projectiles.shift();
            this.projectiles.push({ position: [...position], direction: direction.map(value => value / magnitude), age: 0, distance: 0 });
        }
        weapon.ammo--;
        // Preserva a fração do intervalo para manter a cadência em diferentes FPS.
        weapon.cooldown = Math.max(weapon.cooldown, -this.frameDelta) + weapon.shotInterval;
        this.onShoot(weapon);
        if (weapon.ammo === 0) this.reload();
        return true;
    }

    update(dt, input, camera) {
        this.frameDelta = dt;
        for (const weapon of this.weapons) {
            weapon.cooldown = weapon.cooldown > 0 ? weapon.cooldown - dt : 0;
        }
        if (this.reloading) {
            this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
            if (this.reloadRemaining <= 1e-9) {
                this.reloadRemaining = 0;
                this.equipped.ammo = this.equipped.magazineSize;
            }
        }
        this.melee.update(dt);
        for (const projectile of this.projectiles) {
            projectile.age += dt;
            projectile.distance += this.speed * dt;
            projectile.position = projectile.position.map((value, axis) => value + projectile.direction[axis] * this.speed * dt);
        }
        this.projectiles = this.projectiles.filter(p => p.age < this.lifetime && p.distance < this.maxDistance);
        this.weapons.forEach((weapon, index) => {
            if (input.consumePress(weapon.key)) this.select(index);
        });
        if (input.consumePress('KeyQ')) {
            this.reloadRemaining = 0;
            this.melee.cycle();
            this.meleeEquipped = true;
        }
        if (input.consumePress('KeyF')) {
            this.reloadRemaining = 0;
            this.melee.swing();
        }
        const clicked = input.consumePress('MouseLeft');
        if (clicked && this.meleeEquipped) this.melee.swing();
        if (input.consumePress('KeyR')) this.reload();
        // Consome o clique mesmo durante o melee para não dispará-lo ao terminar.
        if (this.showingMelee) return;
        const held = input.isPressed?.('MouseLeft') ?? false;
        if (clicked || (this.equipped.automatic && held)) this.shoot(camera);
    }

    drawProjectiles(programInfo) {
        for (const projectile of this.projectiles) {
            this.bulletMesh.modelMatrix = Matrix4.multiply(Matrix4.translation(...projectile.position), Matrix4.scaling(0.055, 0.055, 0.055));
            this.bulletMesh.draw(programInfo);
        }
    }

    drawWeapon(gl, programInfo) {
        // Passagem FPS: evita que paredes e o corpo ocultem a arma junto à câmera.
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(programInfo.uniforms.u_view, false, Matrix4.identity());
        if (this.showingMelee) {
            this.melee.draw(programInfo);
            return;
        }
        const reloadPose = this.reloadPose;
        this.equipped.mesh.modelMatrix = Matrix4.multiply(reloadPose, this.equipped.localMatrix);
        this.equipped.mesh.draw(programInfo);
        this.arms?.drawFirearm(programInfo, this.equipped, reloadPose);
    }

    dispose() {
        this.weapons.forEach(weapon => weapon.mesh.dispose());
        this.bulletMesh.dispose();
        this.melee.dispose();
        this.arms?.dispose();
        this.projectiles.length = 0;
    }
}
