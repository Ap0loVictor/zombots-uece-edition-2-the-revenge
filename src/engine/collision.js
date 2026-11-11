const AXES = ['x', 'y', 'z'];

export function createAABB(center, halfSize) {
    const min = {}, max = {};
    for (const axis of AXES) {
        min[axis] = center[axis] - halfSize[axis];
        max[axis] = center[axis] + halfSize[axis];
    }
    return { min, max };
}

export function intersectsAABB(a, b) {
    return AXES.every(axis => a.min[axis] < b.max[axis] && a.max[axis] > b.min[axis]);
}

// Pressupõe uma posição inicial livre. Varre cada eixo e desliza nos demais.
// Subpassos limitam o viés da resolução por eixo; a varredura também captura paredes finas.
export function moveAABB(center, halfSize, displacement, obstacles) {
    const position = { ...center };
    const maxStep = Math.min(halfSize.x, halfSize.y, halfSize.z) * 0.5;
    const steps = Math.max(1, Math.ceil(Math.hypot(displacement.x, displacement.y, displacement.z) / maxStep));
    for (let step = 0; step < steps; step++) {
        for (const axis of AXES) {
            const amount = displacement[axis] / steps;
            if (amount === 0) continue;
            const body = createAABB(position, halfSize);
            let destination = position[axis] + amount;
            for (const obstacle of obstacles) {
                const overlapsOtherAxes = AXES.every(other => other === axis ||
                    (body.min[other] < obstacle.max[other] && body.max[other] > obstacle.min[other]));
                if (!overlapsOtherAxes) continue;
                if (amount > 0 && body.max[axis] <= obstacle.min[axis]) {
                    destination = Math.min(destination, obstacle.min[axis] - halfSize[axis]);
                } else if (amount < 0 && body.min[axis] >= obstacle.max[axis]) {
                    destination = Math.max(destination, obstacle.max[axis] + halfSize[axis]);
                }
            }
            position[axis] = destination;
        }
    }
    return position;
}
