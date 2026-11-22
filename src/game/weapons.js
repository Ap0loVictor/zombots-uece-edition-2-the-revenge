import { Matrix4 } from '../engine/matrix.js';
import { OBJLoader } from '../engine/obj_loader.js';
import { MeleeSystem } from './melee.js';
import { MeleeView } from './melee_view.js';

// O asset aponta para +X. Rotacionamos para -Z e encaixamos os braços no HUD.
export const WEAPON_DEFINITIONS = [
    { name: 'Pistola', file: 'armapistola.obj', key: 'Digit1', sound: 'pistola',
        offset: [0.12, -0.30, -0.88], scale: 0.085, yaw: Math.PI / 2,
        muzzle: [6.624849, 1.65, 1.487161] },
    { name: 'AKM', file: 'arma.obj', key: 'Digit2', sound: 'akm', automatic: true, shotInterval: 8 / 60,
        offset: [0.12, -0.34, -1.08], scale: 0.065, yaw: Math.PI / 2,
        muzzle: [12.403117, 1.596228, 1.723988] },
    { name: 'Escopeta', file: 'armaescopeta.obj', key: 'Digit3', sound: 'escopeta',
        offset: [0.12, -0.34, -1.08], scale: 0.065, yaw: Math.PI / 2,
        muzzle: [13.861917, 1.788772, 1.764079] },
    { name: 'Sniper', file: 'armasniper.obj', key: 'Digit4', sound: 'sniper',
        offset: [0.18, -0.34, -1.02], scale: 0.055, yaw: Math.PI / 2,
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
                meshes.push(await OBJLoader.load(gl, new URL(`../../assets/weapons/${definition.file}`, import.meta.url)));
            }
            bullet = await OBJLoader.load(gl, new URL('../../assets/weapons/esfera.obj', import.meta.url));
            return new WeaponSystem(meshes, bullet, WEAPON_DEFINITIONS, new MeleeSystem(new MeleeView(gl)));
        } catch (error) {
            meshes.forEach(mesh => mesh.dispose());
            bullet?.dispose();
            throw error;
        }
    }

    constructor(meshes, bulletMesh, definitions = WEAPON_DEFINITIONS, melee = new MeleeSystem()) {
        this.melee = melee;
        this.meleeEquipped = false;
        this.weapons = definitions.map((definition, index) => ({
            ...definition, mesh: meshes[index],
            localMatrix: Matrix4.multiply(Matrix4.translation(...definition.offset),
                Matrix4.multiply(Matrix4.rotationY(definition.yaw),
                    Matrix4.scaling(definition.scale, definition.scale, definition.scale))),
        }));
        this.selected = 0;
        this.onShoot = () => {};
        this.shotCooldown = 0;
        this.bulletMesh = bulletMesh;
        this.projectiles = [];
        this.speed = 24;
        this.lifetime = 3;
        this.maxDistance = 60;
        this.maxProjectiles = 64;
    }

    get equipped() { return this.weapons[this.selected]; }
    get showingMelee() { return this.meleeEquipped || this.melee.attacking; }

    select(index) {
        if (Number.isInteger(index) && index >= 0 && index < this.weapons.length) {
            this.selected = index;
            this.meleeEquipped = false;
        }
    }

    shoot(camera) {
        const { x, y, z } = camera.position;
        const pose = Matrix4.multiply(Matrix4.translation(x, y, z),
            Matrix4.multiply(Matrix4.rotationY(camera.yaw), Matrix4.rotationX(camera.pitch)));
        const position = transformPoint(Matrix4.multiply(pose, this.equipped.localMatrix), this.equipped.muzzle);
        // Convergência no centro da mira a 40 unidades, partindo da boca real do cano.
        const target = transformPoint(pose, [0, 0, -40]);
        const delta = target.map((value, axis) => value - position[axis]);
        const length = Math.hypot(...delta);
        if (this.projectiles.length >= this.maxProjectiles) this.projectiles.shift();
        this.projectiles.push({ position, direction: delta.map(value => value / length), age: 0, distance: 0 });
        this.onShoot(this.equipped);
    }

    update(dt, input, camera) {
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
            this.melee.cycle();
            this.meleeEquipped = true;
        }
        if (input.consumePress('KeyF')) this.melee.swing();
        const clicked = input.consumePress('MouseLeft');
        if (this.shotCooldown > 0) this.shotCooldown -= dt;
        // Consome o clique mesmo durante o melee para não dispará-lo ao terminar.
        if (this.showingMelee) return;
        const held = input.isPressed?.('MouseLeft') ?? false;
        if (this.equipped.automatic) {
            if ((clicked || held) && this.shotCooldown <= 1e-9) {
                this.shoot(camera);
                this.shotCooldown += this.equipped.shotInterval;
            }
        } else if (clicked) this.shoot(camera);
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
        this.equipped.mesh.modelMatrix = this.equipped.localMatrix;
        this.equipped.mesh.draw(programInfo);
    }

    dispose() {
        this.weapons.forEach(weapon => weapon.mesh.dispose());
        this.bulletMesh.dispose();
        this.melee.dispose();
        this.projectiles.length = 0;
    }
}
