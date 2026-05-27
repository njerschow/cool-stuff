type PaneDrop = {
  destroyed: boolean;
  density: number;
  grid?: CollisionCell;
  gridIndex: number;
  lastTrailX: number;
  lastTrailY: number;
  mass: number;
  nextMotionTime: number;
  nextTrailDistance: number;
  parent?: PaneDrop;
  previousX: number;
  previousY: number;
  resistance: number;
  shifting: number;
  sizeX: number;
  sizeY: number;
  spreadX: number;
  spreadY: number;
  velocityX: number;
  velocityY: number;
  x: number;
  y: number;
};

type PaneSimulationOptions = {
  colliderSize: number;
  evaporate: number;
  gravity: number;
  initialFillRatio: number;
  initialSpread: number;
  motionInterval: [number, number];
  shrinkRate: number;
  slipRate: number;
  spawnInterval: [number, number];
  spawnLimit: number;
  spawnSize: [number, number];
  trailDistance: [number, number];
  trailDropDensity: number;
  trailDropSize: [number, number];
  trailSpread: number;
  velocitySpread: number;
  xShifting: [number, number];
};

export type RenderDrop = {
  size: number;
  sizeX: number;
  sizeY: number;
  x: number;
  y: number;
};

export type RenderTrail = {
  angle: number;
  length: number;
  strength: number;
  width: number;
  x: number;
  y: number;
};

type PaneTrail = RenderTrail & {
  age: number;
  lifespan: number;
};

const defaultOptions: PaneSimulationOptions = {
  colliderSize: 1,
  evaporate: 10,
  gravity: 2400,
  initialFillRatio: 0,
  initialSpread: 0.5,
  motionInterval: [0.1, 0.4],
  shrinkRate: 0.01,
  slipRate: 0,
  spawnInterval: [0.1, 0.1],
  spawnLimit: 2000,
  spawnSize: [60, 100],
  trailDistance: [20, 30],
  trailDropDensity: 0.2,
  trailDropSize: [0.3, 0.5],
  trailSpread: 0.6,
  velocitySpread: 0.3,
  xShifting: [0, 0.1],
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const distanceSquared = (a: PaneDrop, b: PaneDrop) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

class CollisionCell extends Array<PaneDrop> {
  add(drop: PaneDrop) {
    const length = super.push(drop);
    drop.gridIndex = length - 1;
    drop.grid = this;
  }

  delete(drop: PaneDrop) {
    const replacement = this[this.length - 1];
    this[drop.gridIndex] = replacement;
    if (replacement) {
      replacement.gridIndex = drop.gridIndex;
      replacement.grid = this;
    }
    this.length -= 1;
    drop.gridIndex = -1;
    drop.grid = undefined;
  }
}

export class RaindropPaneSimulation {
  private readonly drops: PaneDrop[] = [];

  private readonly grid: CollisionCell[] = [];

  private readonly options: PaneSimulationOptions;

  private readonly trails: PaneTrail[] = [];

  private nextSpawn = 0;

  private time = 0;

  private width = 1;

  private height = 1;

  constructor(options: Partial<PaneSimulationOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  get renderDrops(): RenderDrop[] {
    return this.drops
      .filter((drop) => !drop.destroyed)
      .map((drop) => ({
        size: drop.sizeX / 100,
        sizeX: drop.sizeX,
        sizeY: drop.sizeY,
        x: drop.x,
        y: drop.y,
      }));
  }

  get renderTrails(): RenderTrail[] {
    const residueTrails = this.trails.map((trail) => {
      const fade = 1 - clamp(trail.age / trail.lifespan, 0, 1);
      return {
        angle: trail.angle,
        length: trail.length,
        strength: trail.strength * Math.pow(fade, 0.65),
        width: trail.width,
        x: trail.x,
        y: trail.y,
      };
    });

    const movingTrails = this.drops
      .filter((drop) => !drop.destroyed)
      .flatMap((drop) => {
        const motionDx = drop.x - drop.previousX;
        const motionDy = drop.y - drop.previousY;
        const motionDistance = Math.hypot(motionDx, motionDy);
        const segmentDx = drop.x - drop.lastTrailX;
        const segmentDy = drop.y - drop.lastTrailY;
        const segmentDistance = Math.hypot(segmentDx, segmentDy);
        const distance = Math.max(motionDistance, segmentDistance);

        if (distance < 1.25 || Math.abs(drop.velocityY) < 4) {
          return [];
        }

        const useSegment = segmentDistance > motionDistance * 1.65;
        const dx = useSegment ? segmentDx : motionDx;
        const dy = useSegment ? segmentDy : motionDy;
        const fromX = useSegment ? drop.lastTrailX : drop.previousX;
        const fromY = useSegment ? drop.lastTrailY : drop.previousY;
        const width = clamp(drop.sizeX * 0.24, 8, 26);
        const length = distance + clamp(drop.sizeY * 0.58, 14, 50);
        const strength = clamp(drop.sizeX / 82 + Math.abs(drop.velocityY) * 0.0011, 0.62, 1);

        return [
          {
            angle: Math.atan2(dy, dx) - Math.PI / 2,
            length,
            strength,
            width,
            x: (fromX + drop.x) * 0.5,
            y: (fromY + drop.y) * 0.5,
          },
        ];
      });

    return residueTrails.concat(movingTrails);
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.rebuildGrid();

    if (this.drops.length === 0) {
      const initialDrops = Math.floor(
        this.options.spawnLimit * this.options.initialFillRatio
      );
      for (let index = 0; index < initialDrops; index += 1) {
        this.addDrop(this.spawnDrop());
      }
    }
  }

  update(delta: number) {
    this.time += delta;

    if (this.drops.length <= this.options.spawnLimit) {
      while (this.time >= this.nextSpawn) {
        this.addDrop(this.spawnDrop());
        this.nextSpawn += rand(...this.options.spawnInterval);
      }
    }

    this.updateDrops(delta);
    this.updateCollisions();
    this.updateTrails(delta);
    this.compactDrops();
  }

  private addTrailSegment(drop: PaneDrop) {
    const dx = drop.x - drop.lastTrailX;
    const dy = drop.y - drop.lastTrailY;
    const distance = Math.hypot(dx, dy);

    if (distance < 2) {
      return;
    }

    this.trails.push({
      age: 0,
      angle: Math.atan2(dy, dx) - Math.PI / 2,
      length: distance + clamp(drop.sizeY * 0.75, 20, 64),
      lifespan: rand(2, 4.2),
      strength: clamp(drop.sizeX / 66 + Math.abs(drop.velocityY) * 0.0014, 0.72, 1),
      width: clamp(drop.sizeX * 0.22, 8, 28),
      x: (drop.lastTrailX + drop.x) * 0.5,
      y: (drop.lastTrailY + drop.y) * 0.5,
    });

    if (this.trails.length > this.options.spawnLimit) {
      this.trails.splice(0, this.trails.length - this.options.spawnLimit);
    }
  }

  private addDrop(drop: PaneDrop) {
    this.drops.push(drop);
    this.gridAtWorld(drop.x, drop.y)?.add(drop);
  }

  private compactDrops() {
    for (let index = this.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.drops[index];
      if (!drop.destroyed) {
        continue;
      }

      drop.grid?.delete(drop);
      this.drops[index] = this.drops[this.drops.length - 1];
      this.drops.length -= 1;
    }
  }

  private createDrop(x: number, y: number, size: number, density = 1): PaneDrop {
    const drop: PaneDrop = {
      density,
      destroyed: false,
      gridIndex: -1,
      lastTrailX: x,
      lastTrailY: y,
      mass: 0,
      nextMotionTime: 0,
      nextTrailDistance: rand(...this.options.trailDistance),
      resistance: 0,
      previousX: x,
      previousY: y,
      shifting: 0,
      sizeX: size,
      sizeY: size,
      spreadX: this.options.initialSpread,
      spreadY: this.options.initialSpread,
      velocityX: 0,
      velocityY: 0,
      x,
      y,
    };

    this.setDropMass(drop, (size * density) ** 2);
    this.randomMotion(drop);
    return drop;
  }

  private gridAt(gridX: number, gridY: number) {
    if (gridX < 0 || gridY < 0) {
      return undefined;
    }

    const index = gridY * this.gridWidth + gridX;
    return this.grid[index];
  }

  private gridAtWorld(x: number, y: number) {
    return this.gridAt(...this.worldToGrid(x, y));
  }

  private get gridSize() {
    return this.options.spawnSize[1] * 0.3;
  }

  private get gridWidth() {
    return Math.max(1, Math.ceil(this.width / this.gridSize));
  }

  private mergeDrop(target: PaneDrop, source: PaneDrop) {
    const velocityX =
      (target.velocityX * target.mass + source.velocityX * source.mass) /
      (target.mass + source.mass);
    const velocityY =
      (target.velocityY * target.mass + source.velocityY * source.mass) /
      (target.mass + source.mass);

    this.setDropMass(target, target.mass + source.mass);
    target.velocityX = velocityX;
    target.velocityY = velocityY;
  }

  private randomMotion(drop: PaneDrop) {
    const maxResistance =
      lerp(...this.options.spawnSize, 1 - this.options.slipRate) ** 2 * 4;
    drop.resistance = rand(0, 1) * this.options.gravity * maxResistance;
    drop.shifting = (Math.random() * 2 - 1) * rand(...this.options.xShifting);
  }

  private rebuildGrid() {
    const gridLength =
      Math.max(1, Math.ceil(this.width / this.gridSize)) *
      Math.max(1, Math.ceil(this.height / this.gridSize));
    this.grid.length = gridLength;
    for (let index = 0; index < gridLength; index += 1) {
      this.grid[index] = new CollisionCell();
    }

    for (const drop of this.drops) {
      drop.grid = undefined;
      drop.gridIndex = -1;
      this.gridAtWorld(drop.x, drop.y)?.add(drop);
    }
  }

  private setDropMass(drop: PaneDrop, mass: number) {
    drop.mass = Math.max(0, mass);
    const rootMass = Math.sqrt(drop.mass) / drop.density;
    drop.sizeX = (drop.spreadX + 1) * rootMass;
    drop.sizeY = (drop.spreadY + 1) * rootMass;
  }

  private spawnDrop() {
    return this.createDrop(
      rand(0, this.width),
      rand(0, this.height),
      rand(...this.options.spawnSize)
    );
  }

  private splitDrop(drop: PaneDrop) {
    if (drop.mass < 1000) {
      return;
    }

    this.addTrailSegment(drop);

    const childSize = drop.sizeX * rand(...this.options.trailDropSize);
    const child = this.createDrop(
      drop.x + rand(-5, 5),
      drop.y + drop.sizeY * 0.25,
      childSize,
      this.options.trailDropDensity
    );
    child.spreadX = 0.1;
    child.spreadY = Math.abs(drop.velocityY) * 0.01 * this.options.trailSpread;
    child.parent = drop;
    this.setDropMass(child, child.mass);
    this.setDropMass(drop, drop.mass - child.mass);
    this.addDrop(child);

    drop.lastTrailX = drop.x;
    drop.lastTrailY = drop.y;
    drop.nextTrailDistance = rand(...this.options.trailDistance);
  }

  private updateCollisions() {
    for (const drop of this.drops) {
      if (drop.destroyed) {
        continue;
      }

      const [gridX, gridY] = this.worldToGrid(drop.x, drop.y);
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const grid = this.gridAt(gridX + offsetX, gridY + offsetY);
          if (!grid) {
            continue;
          }

          for (const other of grid) {
            if (
              other === drop ||
              other.destroyed ||
              other.parent === drop ||
              drop.parent === other ||
              (drop.parent && drop.parent === other.parent)
            ) {
              continue;
            }

            const mergeDistance =
              drop.sizeX * (1 + drop.spreadX) * 0.16 * this.options.colliderSize +
              other.sizeX * (1 + other.spreadX) * 0.16 * this.options.colliderSize;

            if (distanceSquared(drop, other) < mergeDistance * mergeDistance) {
              if (drop.mass >= other.mass) {
                this.mergeDrop(drop, other);
                other.destroyed = true;
              } else {
                this.mergeDrop(other, drop);
                drop.destroyed = true;
              }
            }
          }
        }
      }
    }
  }

  private updateDrops(delta: number) {
    for (const drop of this.drops) {
      if (drop.destroyed) {
        continue;
      }

      if (drop.nextMotionTime <= this.time) {
        drop.nextMotionTime = this.time + rand(...this.options.motionInterval);
        this.randomMotion(drop);
      }

      drop.previousX = drop.x;
      drop.previousY = drop.y;

      this.setDropMass(drop, drop.mass - this.options.evaporate * delta);
      if (drop.mass <= 0) {
        drop.destroyed = true;
        continue;
      }

      const force = this.options.gravity * drop.mass - drop.resistance;
      const acceleration = force / drop.mass;
      drop.velocityY -= acceleration * delta;
      if (drop.velocityY > 0) {
        drop.velocityY = 0;
      }
      drop.velocityX = Math.abs(drop.velocityY) * drop.shifting;
      drop.x += drop.velocityX * delta;
      drop.y += drop.velocityY * delta;

      const spreadByVelocity =
        (this.options.velocitySpread *
          2 *
          Math.atan(Math.abs(drop.velocityY * 0.005))) /
        Math.PI;
      drop.spreadY = Math.max(drop.spreadY, spreadByVelocity);
      drop.spreadX *= Math.pow(this.options.shrinkRate, delta);
      drop.spreadY *= Math.pow(this.options.shrinkRate, delta);
      this.setDropMass(drop, drop.mass);

      const [gridX, gridY] = this.worldToGrid(drop.x, drop.y);
      const nextGrid = this.gridAt(gridX, gridY);
      if (nextGrid !== drop.grid) {
        drop.grid?.delete(drop);
        nextGrid?.add(drop);
      }

      const trailDx = drop.x - drop.lastTrailX;
      const trailDy = drop.y - drop.lastTrailY;
      if (trailDx * trailDx + trailDy * trailDy > drop.nextTrailDistance ** 2) {
        this.splitDrop(drop);
      }

      if (
        drop.x < -100 ||
        drop.x > this.width + 100 ||
        drop.y < -100
      ) {
        drop.destroyed = true;
      }
    }
  }

  private updateTrails(delta: number) {
    for (let index = this.trails.length - 1; index >= 0; index -= 1) {
      const trail = this.trails[index];
      trail.age += delta;

      if (trail.age >= trail.lifespan) {
        this.trails[index] = this.trails[this.trails.length - 1];
        this.trails.length -= 1;
      }
    }
  }

  private worldToGrid(x: number, y: number): [number, number] {
    return [Math.floor(x / this.gridSize), Math.floor(y / this.gridSize)];
  }
}
