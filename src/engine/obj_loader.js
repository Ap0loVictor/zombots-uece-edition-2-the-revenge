import { Mesh } from './mesh.js';

async function readText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao carregar ${url}: HTTP ${response.status}.`);
    return response.text();
}

function lines(text) {
    return text.split(/\r?\n/).map(line => line.split('#')[0].trim()).filter(Boolean);
}

function vector(parts, size) {
    const values = parts.slice(0, size).map(Number);
    if (values.length !== size || !values.every(Number.isFinite)) {
        throw new Error('Vetor inválido no modelo OBJ/MTL.');
    }
    return values;
}

function indexed(values, token) {
    const index = Number(token);
    if (!Number.isInteger(index) || index === 0) throw new Error(`Índice OBJ inválido: ${token}`);
    const value = values[index > 0 ? index - 1 : values.length + index];
    if (!value) throw new Error(`Índice OBJ fora dos limites: ${token}`);
    return value;
}

export class OBJLoader {
    static async load(gl, url) {
        const absoluteURL = new URL(url, document.baseURI);
        const text = await readText(absoluteURL);
        const materials = new Map();
        for (const line of lines(text)) {
            if (!line.startsWith('mtllib ')) continue;
            const materialURL = new URL(line.slice(7).trim(), absoluteURL);
            for (const [name, color] of this.parseMTL(await readText(materialURL))) materials.set(name, color);
        }
        const data = this.parse(text, materials);
        return new Mesh(gl, data.positions, data.normals, data.colors);
    }

    static parseMTL(text) {
        const materials = new Map();
        let name = null;
        for (const line of lines(text)) {
            const [keyword, ...parts] = line.split(/\s+/);
            if (keyword === 'newmtl') {
                name = parts.join(' ');
                materials.set(name, [1, 1, 1, 1]);
            } else if (keyword === 'Kd' && name !== null) {
                materials.set(name, [...vector(parts, 3), 1]);
            }
        }
        return materials;
    }

    // OBJ com faces convexas, normais opcionais e material difuso Kd.
    // UVs são aceitos nos índices, mas texturas não fazem parte deste protótipo.
    static parse(text, materials = new Map()) {
        const vertices = [], sourceNormals = [];
        const positions = [], normals = [], colors = [];
        let color = [1, 1, 1, 1];
        for (const line of lines(text)) {
            const [keyword, ...parts] = line.split(/\s+/);
            if (keyword === 'v') vertices.push(vector(parts, 3));
            else if (keyword === 'vn') sourceNormals.push(vector(parts, 3));
            else if (keyword === 'usemtl') color = materials.get(parts.join(' ')) ?? [1, 1, 1, 1];
            else if (keyword === 'f') {
                if (parts.length < 3) throw new Error('Face OBJ com menos de três vértices.');
                for (let i = 1; i < parts.length - 1; i++) {
                    const face = [parts[0], parts[i], parts[i + 1]].map(part => part.split('/'));
                    const triangle = face.map(indices => indexed(vertices, indices[0]));
                    const [a, b, c] = triangle;
                    const u = b.map((value, axis) => value - a[axis]);
                    const v = c.map((value, axis) => value - a[axis]);
                    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
                    const length = Math.hypot(...normal);
                    if (length < 1e-10) throw new Error('Triângulo degenerado no modelo OBJ.');
                    for (let corner = 0; corner < 3; corner++) {
                        positions.push(...triangle[corner]);
                        normals.push(...(face[corner][2] ? indexed(sourceNormals, face[corner][2]) : normal.map(value => value / length)));
                        colors.push(...color);
                    }
                }
            }
        }
        if (!positions.length) throw new Error('O modelo OBJ não contém faces.');
        return { positions, normals, colors };
    }
}
