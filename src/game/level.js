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
        this.helmet = data.helmet ?? { x: data.spawn.x, z: data.spawn.z - 2, yaw: 0 };
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
        for (const building of data.buildings ?? []) this.addBuilding(building);
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
        const material = data.material ? this.material(data.material) : {};
        const height = data.height ?? material.height;
        const base = data.base ?? material.base ?? 0;  // laje: a caixa vai de "base" até "height"
        const color = data.color ?? material.color;
        const decal = data.decal ?? material.decal ?? false;
        let surface;
        if (data.rect) {
            const r = Level.normalizeRect(data.rect);
            surface = { height, contains: (x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 };
            this.addBox((r.x0 + r.x1) / 2, base, (r.z0 + r.z1) / 2, r.x1 - r.x0, height - base, r.z1 - r.z0, color);
        } else if (data.circle) {
            const [cx, cz, radius] = data.circle;
            surface = { height, contains: (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= radius * radius };
            this.items.push({
                mesh: this.cylinderMesh, color,
                matrix: Matrix4.multiply(Matrix4.translation(cx, base, cz), Matrix4.scaling(radius, height - base, radius)),
            });
        } else {
            throw new Error(`Superfície "${data._name ?? data.material}" precisa de "rect" ou "circle".`);
        }
        // Faixas pintadas e telhados não contam como chão onde se anda.
        if (!decal) this.surfaces.push(surface);
    }

    // collide: false → só aparece (ex.: folha de porta aberta); visible: false → só colide.
    addObstacle(data) {
        const r = Level.normalizeRect(data.rect);
        const base = data.base ?? 0;
        const sx = r.x1 - r.x0, sz = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        if (data.visible !== false) this.addBox(cx, base, cz, sx, data.height, sz, data.color);
        if (data.collide !== false) {
            this.colliders.push(createAABB({ x: cx, y: base + data.height / 2, z: cz },
                { x: sx / 2, y: data.height / 2, z: sz / 2 }));
        }
    }

    // ---------- prédios com interior ----------
    // Gera, a partir do JSON: piso térreo, lajes dos andares (com vão opcional para a escada),
    // cobertura e paredes (externas e internas) com portas. Todos os andares repetem a mesma planta.
    addBuilding(b) {
        const r = Level.normalizeRect(b.rect);
        const floors = b.floors ?? 1, floorHeight = b.floorHeight ?? 3.4;
        const slab = b.slab ?? 0.3, floorTop = b.floorTop ?? 0.15;
        const levelOf = floor => floorTop + (floor - 1) * floorHeight;   // altura do piso do andar (1 = térreo)
        const roofTop = levelOf(floors) + floorHeight;
        const wallHeight = floorHeight - slab;                            // pé-direito livre
        const footprint = [r.x0, r.z0, r.x1, r.z1];
        const woodColor = b.doorColor ?? [0.45, 0.3, 0.18, 1];

        this.addSurface({ rect: footprint, height: floorTop, color: b.floorColor });
        for (let floor = 2; floor <= floors; floor++) {
            const pieces = b.slabHole ? Level.subtractRect(footprint, b.slabHole) : [footprint];
            for (const rect of pieces) {
                this.addSurface({ rect, base: levelOf(floor) - slab, height: levelOf(floor), color: b.slabColor });
            }
        }
        this.addSurface({ rect: footprint, base: roofTop - slab, height: roofTop, color: b.roofColor, decal: true });

        for (const wall of b.walls ?? []) {
            const doorsOn = floor => (wall.doors ?? []).filter(d => (d.floors ?? [...Array(floors)].map((_, i) => i + 1)).includes(floor));
            if (wall.span) {
                // Parede externa: uma peça só, do chão ao teto; as portas ficam no térreo.
                this.addWall(wall, 0, roofTop - slab, floorTop, doorsOn(1), b.color, woodColor);
            } else {
                for (const floor of wall.floors ?? [...Array(floors)].map((_, i) => i + 1)) {
                    this.addWall(wall, levelOf(floor), wallHeight, levelOf(floor), doorsOn(floor), b.interiorColor, woodColor);
                }
            }
        }
    }

    // wall.line = [x0, z0, x1, z1] (paralela a um eixo); portas: { at, width, height, state, swing, leaf }
    addWall(wall, base, height, doorBase, doors, color, woodColor) {
        const [ax, az, bx, bz] = wall.line;
        const alongX = az === bz;
        const thickness = wall.thickness ?? 0.2;
        const fixed = alongX ? az : ax;
        const start = alongX ? Math.min(ax, bx) : Math.min(az, bz);
        const end = alongX ? Math.max(ax, bx) : Math.max(az, bz);
        const piece = (s0, s1, y0, h, pieceColor, collide = true, t = thickness, offset = 0) => {
            if (s1 - s0 < 1e-6 || h < 1e-6) return;
            const rect = alongX
                ? [s0, fixed + offset - t / 2, s1, fixed + offset + t / 2]
                : [fixed + offset - t / 2, s0, fixed + offset + t / 2, s1];
            this.addObstacle({ rect, base: y0, height: h, color: pieceColor, collide });
        };
        let cursor = start;
        for (const door of [...doors].sort((p, q) => p.at - q.at)) {
            const width = door.width ?? 1.5, doorHeight = door.height ?? 2.1;
            const s0 = door.at - width / 2, s1 = door.at + width / 2;
            piece(cursor, s0, base, height, color);                                       // parede até a porta
            piece(s0, s1, doorBase + doorHeight, base + height - doorBase - doorHeight, color); // verga
            if (door.state === 'closed') {
                piece(s0, s1, doorBase, doorHeight, woodColor, true, thickness * 0.6);    // folha fechada
            } else if (door.leaf !== false) {
                // Folha aberta a 90°, só visual, junto ao batente, virada para dentro da sala.
                const swing = door.swing ?? 1, leafLength = width - 0.1;
                const leafRect = alongX
                    ? [s0 - 0.025, fixed, s0 + 0.025, fixed + swing * leafLength]
                    : [fixed, s0 - 0.025, fixed + swing * leafLength, s0 + 0.025];
                this.addObstacle({ rect: leafRect, base: doorBase, height: doorHeight - 0.05, color: woodColor, collide: false });
            }
            cursor = s1;
        }
        piece(cursor, end, base, height, color);
    }

    // Retângulo menos um retângulo interno: devolve até 4 peças.
    static subtractRect(outer, hole) {
        const o = Level.normalizeRect(outer), h = Level.normalizeRect(hole);
        return [
            [o.x0, o.z0, h.x0, o.z1], [h.x1, o.z0, o.x1, o.z1],
            [h.x0, o.z0, h.x1, h.z0], [h.x0, h.z1, h.x1, o.z1],
        ].filter(([x0, z0, x1, z1]) => x1 - x0 > 1e-6 && z1 - z0 > 1e-6);
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

    // Altura do chão em (x, z) para quem está na altura y: a mais alta entre as superfícies que contêm
    // o ponto e que estão ao alcance do degrau (até y + reach). Assim a laje do 2º andar só vale para quem
    // está nela, e o térreo continua sendo o chão de quem está embaixo. Sem y: a mais alta de todas.
    groundHeight(x, z, y = Infinity, reach = 0.5) {
        let height = 0;
        for (const surface of this.surfaces) {
            if (surface.height > height && surface.height <= y + reach && surface.contains(x, z)) height = surface.height;
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