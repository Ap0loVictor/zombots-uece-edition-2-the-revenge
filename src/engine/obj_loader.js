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
    static async load(gl, url, options = {}) {
        const absoluteURL = new URL(url, document.baseURI);
        const text = await readText(absoluteURL);
        const materials = new Map();
        const textures = new Map();
        for (const line of lines(text)) {
            if (!line.startsWith('mtllib ')) continue;
            const materialURL = new URL(line.slice(7).trim(), absoluteURL);
            for (const [name, color] of this.parseMTL(await readText(materialURL))) {
                materials.set(name, color);
                if (color.texture) textures.set(name, new URL(color.texture, materialURL));
            }
        }
        const data = this.parse(text, materials, options);
        const mesh = new Mesh(gl, data.positions, data.normals, data.colors, data.uvs);
        mesh.minY = data.minY;
        mesh.maxY = data.maxY;
        mesh.centerX = (data.minX + data.maxX) / 2;
        mesh.centerZ = (data.minZ + data.maxZ) / 2;
        if (data.material && textures.has(data.material)) mesh.texture = await this.loadTexture(gl, textures.get(data.material));
        return mesh;
    }

    static parseMTL(text) {
        const materials = new Map();
        let name = null;
        for (const line of lines(text)) {
            const [keyword, ...parts] = line.split(/\s+/);
            if (keyword === 'newmtl') {
                name = parts.join(' ');
                const color = [1, 1, 1, 1];
                color.texture = null;
                materials.set(name, color);
            } else if (keyword === 'Kd' && name !== null) {
                materials.get(name).splice(0, 4, ...vector(parts, 3), 1);
            } else if (keyword === 'map_Kd' && name !== null) {
                materials.get(name).texture = parts.at(-1);
            }
        }
        return materials;
    }

    // OBJ com faces convexas, normais opcionais e material difuso Kd.
    // UVs são aceitos nos índices, mas texturas não fazem parte deste protótipo.
    static parse(text, materials = new Map(), { excludeObjects = [] } = {}) {
        const vertices = [], sourceNormals = [], sourceUVs = [];
        const positions = [], normals = [], colors = [], uvs = [];
        let color = [1, 1, 1, 1];
        let excluded = false;
        let material = null;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const line of lines(text)) {
            const [keyword, ...parts] = line.split(/\s+/);
            if (keyword === 'o') excluded = excludeObjects.includes(parts.join(' '));
            else if (keyword === 'v') {
                const vertex = vector(parts, 3);
                vertices.push(vertex);
                minX = Math.min(minX, vertex[0]); maxX = Math.max(maxX, vertex[0]);
                minY = Math.min(minY, vertex[1]); maxY = Math.max(maxY, vertex[1]);
                minZ = Math.min(minZ, vertex[2]); maxZ = Math.max(maxZ, vertex[2]);
            }
            else if (keyword === 'vn') sourceNormals.push(vector(parts, 3));
            else if (keyword === 'vt') sourceUVs.push(vector(parts, 2));
            else if (keyword === 'usemtl') {
                material = parts.join(' ');
                color = materials.get(material) ?? [1, 1, 1, 1];
            }
            else if (keyword === 'f' && !excluded) {
                if (parts.length < 3) throw new Error('Face OBJ com menos de três vértices.');
                for (let i = 1; i < parts.length - 1; i++) {
                    const face = [parts[0], parts[i], parts[i + 1]].map(part => part.split('/'));
                    const triangle = face.map(indices => indexed(vertices, indices[0]));
                    const [a, b, c] = triangle;
                    const u = b.map((value, axis) => value - a[axis]);
                    const v = c.map((value, axis) => value - a[axis]);
                    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
                    const length = Math.hypot(...normal);
                    // Exportações reais podem conter faces sem área; elas não contribuem para a imagem.
                    if (length < 1e-10) continue;
                    for (let corner = 0; corner < 3; corner++) {
                        positions.push(...triangle[corner]);
                        normals.push(...(face[corner][2] ? indexed(sourceNormals, face[corner][2]) : normal.map(value => value / length)));
                        colors.push(...color);
                        uvs.push(...(face[corner][1] ? indexed(sourceUVs, face[corner][1]) : [0, 0]));
                    }
                }
            }
        }
        if (!positions.length) throw new Error('O modelo OBJ não contém faces.');
        return { positions, normals, colors, uvs, material, minX, maxX, minY, maxY, minZ, maxZ };
    }

    static async loadTexture(gl, url) {
        const image = new Image();
        const loaded = new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', () => reject(new Error(`Falha ao carregar textura ${url}.`)), { once: true });
        });
        image.src = url.href;
        if (!image.complete) {
            let timeoutId;
            try {
                await Promise.race([loaded, new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`Tempo esgotado ao carregar textura ${url}.`)), 10000);
                })]);
            } finally { clearTimeout(timeoutId); }
        }
        if (image.naturalWidth === 0) throw new Error(`Falha ao carregar textura ${url}.`);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return texture;
    }
}
