import { Mesh } from '../engine/mesh.js';
import { Matrix4 } from '../engine/matrix.js';
import { createAABB } from '../engine/collision.js';

export class Level {
    static async load(gl, url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Falha ao carregar mapa: HTTP ${response.status}.`);
        return new Level(gl, await response.json());
    }

    constructor(gl, data) {
        this.spawn = data.spawn;
        const { width, depth, wallHeight: height, wallThickness: thickness } = data;
        // As faces internas das paredes coincidem com os limites do chão.
        this.boxes = [
            { center: { x: 0, y: height / 2, z: -(depth + thickness) / 2 }, size: { x: width + 2 * thickness, y: height, z: thickness } },
            { center: { x: 0, y: height / 2, z: (depth + thickness) / 2 }, size: { x: width + 2 * thickness, y: height, z: thickness } },
            { center: { x: -(width + thickness) / 2, y: height / 2, z: 0 }, size: { x: thickness, y: height, z: depth } },
            { center: { x: (width + thickness) / 2, y: height / 2, z: 0 }, size: { x: thickness, y: height, z: depth } },
            ...data.obstacles,
        ].map(box => ({ ...box, color: box.color ?? data.wallColor }));
        this.colliders = this.boxes.map(({ center, size }) => createAABB(center,
            { x: size.x / 2, y: size.y / 2, z: size.z / 2 }));
        this.floorMesh = Mesh.plane(gl);
        this.floorMesh.modelMatrix = Matrix4.scaling(width, 1, depth);
        this.floorMesh.color = data.floorColor;
        this.boxMesh = Mesh.box(gl);
        for (const box of this.boxes) {
            box.matrix = Matrix4.multiply(Matrix4.translation(box.center.x, box.center.y, box.center.z),
                Matrix4.scaling(box.size.x, box.size.y, box.size.z));
        }
        this.gridMesh = this.createGrid(gl, width, depth);
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
        this.gridMesh.draw(programInfo);
        for (const box of this.boxes) {
            this.boxMesh.modelMatrix = box.matrix;
            this.boxMesh.color = box.color;
            this.boxMesh.draw(programInfo);
        }
    }

    dispose() {
        this.floorMesh.dispose();
        this.gridMesh.dispose();
        this.boxMesh.dispose();
    }
}
