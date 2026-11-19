import { Mesh } from '../engine/mesh.js';
import { Matrix4 } from '../engine/matrix.js';
import { createAABB } from '../engine/collision.js';

// Dois tipos de coisa no mapa:
//  - SUPERFÍCIES (surfaces): mato, asfalto, calçada, ilha da rotatória, faixas pintadas.
//    Não bloqueiam ninguém; só definem a ALTURA DO CHÃO naquele ponto (o jogador sobe o meio-fio).
//  - OBSTÁCULOS (obstacles/trees/paredes): geram colisores AABB que bloqueiam o movimento.
//
// Formatos no JSON (todos no plano XZ):
//   retângulo: "rect": [x0, z0, x1, z1]        círculo: "circle": [cx, cz, raio]

export class Level {
    static async load(gl, url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Falha ao carregar mapa: HTTP ${response.status}.`);
        return new Level(gl, await response.json());
    }

    constructor(gl, data) {
        this.spawn = data.spawn;
        this.materials = data.materials ?? {};
        const { width, depth, wallHeight: height, wallThickness: thickness } = data;

        this.boxMesh = Mesh.box(gl);
        this.cylinderMesh = Mesh.cylinder(gl);
        this.sphereMesh = Mesh.sphere(gl);
        this.floorMesh = Mesh.plane(gl);
        this.floorMesh.modelMatrix = Matrix4.scaling(width, 1, depth);
        this.floorMesh.color = data.floorColor;
        this.gridMesh = data.showGrid ? this.createGrid(gl, width, depth) : null;

        this.items = [];      // tudo que é desenhado: { mesh, matrix, color }
        this.surfaces = [];   // superfícies que contam para a altura do chão
        this.colliders = [];

        // As faces internas das paredes coincidem com os limites do chão.
        const walls = [
            { center: { x: 0, z: -(depth + thickness) / 2 }, size: { x: width + 2 * thickness, z: thickness } },
            { center: { x: 0, z: (depth + thickness) / 2 }, size: { x: width + 2 * thickness, z: thickness } },
            { center: { x: -(width + thickness) / 2, z: 0 }, size: { x: thickness, z: depth } },
            { center: { x: (width + thickness) / 2, z: 0 }, size: { x: thickness, z: depth } },
        ];
        for (const wall of walls) {
            this.addObstacle({
                rect: [wall.center.x - wall.size.x / 2, wall.center.z - wall.size.z / 2,
                    wall.center.x + wall.size.x / 2, wall.center.z + wall.size.z / 2],
                height, color: data.wallColor,
            });
        }

        // Superfícies primeiro: as árvores consultam a altura do chão onde nascem.
        for (const surface of data.surfaces ?? []) this.addSurface(surface);
        for (const obstacle of data.obstacles ?? []) this.addObstacle(obstacle);
        (data.trees ?? []).forEach((tree, index) => this.addTree(tree, index));
    }

    // ---------- construção ----------

    material(name) {
        const material = this.materials[name];
        if (!material) throw new Error(`Material desconhecido no mapa: "${name}".`);
        return material;
    }

    static normalizeRect([ax, az, bx, bz]) {
        return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
    }

    addBox(cx, base, cz, sx, height, sz, color) {
        this.items.push({
            mesh: this.boxMesh, color,
            matrix: Matrix4.multiply(Matrix4.translation(cx, base + height / 2, cz), Matrix4.scaling(sx, height, sz)),
        });
    }

    addSurface(data) {
        const material = this.material(data.material);
        const height = data.height ?? material.height;
        const color = data.color ?? material.color;
        const decal = data.decal ?? material.decal ?? false;
        let surface;
        if (data.rect) {
            const r = Level.normalizeRect(data.rect);
            surface = { height, contains: (x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 };
            this.addBox((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2, r.x1 - r.x0, height, r.z1 - r.z0, color);
        } else if (data.circle) {
            const [cx, cz, radius] = data.circle;
            surface = { height, contains: (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= radius * radius };
            this.items.push({
                mesh: this.cylinderMesh, color,
                matrix: Matrix4.multiply(Matrix4.translation(cx, 0, cz), Matrix4.scaling(radius, height, radius)),
            });
        } else {
            throw new Error(`Superfície "${data._name ?? data.material}" precisa de "rect" ou "circle".`);
        }
        // Faixas pintadas ficam só 1,5 cm acima do asfalto e não alteram a altura do chão.
        if (!decal) this.surfaces.push(surface);
    }

    addObstacle(data) {
        const r = Level.normalizeRect(data.rect);
        const base = data.base ?? 0;
        const sx = r.x1 - r.x0, sz = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        this.addBox(cx, base, cz, sx, data.height, sz, data.color);
        this.colliders.push(createAABB({ x: cx, y: base + data.height / 2, z: cz },
            { x: sx / 2, y: data.height / 2, z: sz / 2 }));
    }

    // Árvore: tronco (cilindro) + copa (esfera achatada). Só o tronco colide;
    // a copa fica acima da altura dos olhos (1,6), então dá para passar por baixo.
    addTree([x, z, scale = 1], index) {
        const base = this.groundHeight(x, z);
        const trunkHeight = 2.2 * scale, trunkRadius = 0.28 * scale;
        this.items.push({
            mesh: this.cylinderMesh, color: [0.36, 0.24, 0.14, 1],
            matrix: Matrix4.multiply(Matrix4.translation(x, base, z), Matrix4.scaling(trunkRadius, trunkHeight, trunkRadius)),
        });
        // Tonalidades alternadas, para o mato não parecer uma cópia só.
        const greens = [[0.12, 0.42, 0.14, 1], [0.18, 0.5, 0.18, 1], [0.1, 0.36, 0.16, 1]];
        this.items.push({
            mesh: this.sphereMesh, color: greens[index % greens.length],
            matrix: Matrix4.multiply(Matrix4.translation(x, base + 3.4 * scale, z),
                Matrix4.scaling(1.8 * scale, 1.4 * scale, 1.8 * scale)),
        });
        this.colliders.push(createAABB({ x, y: base + trunkHeight / 2, z },
            { x: trunkRadius + 0.1, y: trunkHeight / 2, z: trunkRadius + 0.1 }));
    }

    // ---------- consulta ----------

    // Altura do chão em (x, z): a mais alta entre as superfícies que contêm o ponto
    // (é o mesmo que o teste de profundidade mostra na tela). Fora de todas, é o mato: 0.
    groundHeight(x, z) {
        let height = 0;
        for (const surface of this.surfaces) {
            if (surface.height > height && surface.contains(x, z)) height = surface.height;
        }
        return height;
    }

    createGrid(gl, width, depth) {
        const positions = [], normals = [];
        const rectangle = (x0, z0, x1, z1) => {
            positions.push(x0, 0.003, z0, x0, 0.003, z1, x1, 0.003, z1,
                x0, 0.003, z0, x1, 0.003, z1, x1, 0.003, z0);
            for (let i = 0; i < 6; i++) normals.push(0, 1, 0);
        };
        for (let x = -width / 2 + 1; x < width / 2; x++) rectangle(x - 0.012, -depth / 2, x + 0.012, depth / 2);
        for (let z = -depth / 2 + 1; z < depth / 2; z++) rectangle(-width / 2, z - 0.012, width / 2, z + 0.012);
        const mesh = new Mesh(gl, positions, normals);
        mesh.color = [0.28, 0.36, 0.39, 1];
        return mesh;
    }

    draw(programInfo) {
        this.floorMesh.draw(programInfo);
        this.gridMesh?.draw(programInfo);
        for (const item of this.items) {
            item.mesh.modelMatrix = item.matrix;
            item.mesh.color = item.color;
            item.mesh.draw(programInfo);
        }
    }

    dispose() {
        this.floorMesh.dispose();
        this.gridMesh?.dispose();
        this.boxMesh.dispose();
        this.cylinderMesh.dispose();
        this.sphereMesh.dispose();
    }
}
