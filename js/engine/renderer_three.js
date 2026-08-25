import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class RendererThreeJS {
  constructor(containerElement) {
    if (!containerElement) {
      throw new Error("RendererThreeJS: 'containerElement' DOM element is required.");
    }

    this.container = containerElement;
    this.tileSize = 2;
    this.aspectRatio = 4 / 3;
    this.animatingDoors = [];
    this.animatingChests = [];
    this.dyingMonsters = [];
    this.mixers = []; // Active AnimationMixers for skeletal GLB animations
    this.clock = new THREE.Clock(); // Delta timer for animation playback
    this.loadedAssets = {};
    this.campfireMesh = null;
    this.campLight = null;

    // 1. Scene & Fog Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1018);
    this.scene.fog = new THREE.FogExp2(0x0a1018, 0.10);

    // 2. Camera & Viewport
    // Fit the largest 4:3 box inside the container instead of stretching to
    // its full (possibly ultrawide) proportions. Whichever container
    // dimension is the constraint, the other gets scaled down to match.
    const { width, height } = this.#getConstrainedSize();
    this.camera = new THREE.PerspectiveCamera(75, this.aspectRatio, 0.1, 100);

    // 3. WebGL Renderer
    // Enabled antialias and proper pixelRatio to ensure rock-solid temporal stability
    // without sub-pixel crawling, flickering or polygon edge shimmer.
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      powerPreference: 'high-performance' 
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));

    // updateStyle = true: the canvas gets a real w x h pixel size in its
    // inline style (the 4:3 box), and the flex-centered #three-container
    // provides the letterbox bars on either side.
    this.renderer.setSize(width, height, true);
    this.container.appendChild(this.renderer.domElement);

    // 4. Dynamic Lighting
    this.ambientLight = new THREE.AmbientLight(0xddeeff, 0.7);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffeedd, 0.8);
    this.dirLight.position.set(10, 25, 10);
    this.scene.add(this.dirLight);

    // Party Handheld Light Source (Torch or Arcane Light spell)
    this.partyLight = new THREE.PointLight(0xff8833, 0, 10, 1.8);
    this.scene.add(this.partyLight);

    // 5. Scene Groups
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.monsterGroup = new THREE.Group();
    this.scene.add(this.monsterGroup);

    // 6. Unified GLTF Loader
    this.gltfLoader = new GLTFLoader();

    window.addEventListener('resize', () => this.onResize());
  }

  /** Largest box matching this.aspectRatio that fits inside the container. */
  #getConstrainedSize() {
    const containerW = this.container.clientWidth || 640;
    const containerH = this.container.clientHeight || 480;

    let width = containerW;
    let height = width / this.aspectRatio;

    if (height > containerH) {
      height = containerH;
      width = height * this.aspectRatio;
    }

    return { width: Math.round(width), height: Math.round(height) };
  }

  onResize() {
    if (!this.container) return;

    const { width, height } = this.#getConstrainedSize();
    if (!width || !height) return;

    // camera.aspect stays fixed at this.aspectRatio regardless of container
    // shape — only the pixel size of the 4:3 box changes on resize.
    this.camera.updateProjectionMatrix();

    // updateStyle = true keeps the canvas at its real 4:3 pixel size;
    // the flex-centered container supplies the letterbox bars.
    this.renderer.setSize(width, height, true);
  }

  #disposeObject(obj) {
    if (!obj) return;
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const disposeMat = (mat) => {
        ['map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap', 'roughnessMap', 'metalnessMap', 'alphaMap']
          .forEach(mapProp => {
            if (mat[mapProp]) mat[mapProp].dispose();
          });
        mat.dispose();
      };

      if (Array.isArray(obj.material)) {
        obj.material.forEach(disposeMat);
      } else {
        disposeMat(obj.material);
      }
    }
  }

  clearWorld() {
    while (this.worldGroup.children.length > 0) {
      const obj = this.worldGroup.children[0];
      this.worldGroup.remove(obj);
      obj.traverse(child => this.#disposeObject(child));
    }
    this.animatingDoors = [];
    this.animatingChests = [];
  }

  clearEncounterMonsters() {
    this.mixers.forEach(item => {
      if (item.mixer) item.mixer.stopAllAction();
    });
    this.mixers = [];

    this.dyingMonsters.forEach(anim => {
      this.scene.remove(anim.mesh);
      this.#disposeObject(anim.mesh);
    });
    this.dyingMonsters = [];

    while (this.monsterGroup.children.length > 0) {
      const obj = this.monsterGroup.children[0];
      this.monsterGroup.remove(obj);
      obj.traverse(child => this.#disposeObject(child));
    }
  }

  // ---------------------------------------------------------------------------
  // Combat 3D Monster Spawning & Universal Animation Engine
  // (3D HP bars removed — enemy HP is shown via 2D #enemy-hp-overlay)
  // ---------------------------------------------------------------------------

  renderEncounterMonsters(enemies, playerState) {
    if (!enemies || !playerState) return;

    const ts = this.tileSize;
    const aliveEnemies = enemies.filter(e => e.hp > 0);
    const aliveInstanceIds = new Set(aliveEnemies.map(e => e.instanceId));

    // 1. Process Slain Monsters
    for (let i = this.monsterGroup.children.length - 1; i >= 0; i--) {
      const child = this.monsterGroup.children[i];
      const instId = child.userData ? child.userData.instanceId : null;

      if (instId && !aliveInstanceIds.has(instId)) {
        this.mixers = this.mixers.filter(m => m.instanceId !== instId);

        this.dyingMonsters.push({
          mesh: child,
          progress: 0,
          startRotX: child.rotation.x,
          startPosY: child.position.y
        });
        this.monsterGroup.remove(child);
        this.scene.add(child);
      }
    }

    // 2. Position Active Monsters
    let gridDx = 0, gridDz = 0;
    if (playerState.facing === 'NORTH') gridDz = -0.9;
    else if (playerState.facing === 'SOUTH') gridDz = 0.9;
    else if (playerState.facing === 'EAST') gridDx = 0.9;
    else if (playerState.facing === 'WEST') gridDx = -0.9;

    const targetWorldX = (playerState.x + gridDx) * ts;
    const targetWorldZ = (playerState.y + gridDz) * ts;

    const spacing = 0.8;
    const totalWidth = (aliveEnemies.length - 1) * spacing;
    const startOffset = -totalWidth / 2;

    aliveEnemies.forEach((mob, idx) => {
      const existingMesh = this.monsterGroup.children.find(
        c => c.userData && c.userData.instanceId === mob.instanceId
      );

      if (existingMesh) {
        return;
      }

      const modelPath = mob.glbModel || 'assets/glb/kobold.glb';
      const lateralOffset = startOffset + (idx * spacing);

      let offsetX = 0, offsetZ = 0;
      if (playerState.facing === 'NORTH' || playerState.facing === 'SOUTH') {
        offsetX = lateralOffset;
      } else {
        offsetZ = lateralOffset;
      }

      const customPosOffset = Array.isArray(mob.positionOffset) ? mob.positionOffset : [0, 0, 0];
      const posX = targetWorldX + offsetX + (customPosOffset[0] || 0);
      const posZ = targetWorldZ + offsetZ + (customPosOffset[2] || 0);
      const floorY = -ts / 2 + 0.15 + (customPosOffset[1] || 0);

      this.gltfLoader.load(
        modelPath,
        (gltf) => {
          const model = gltf.scene;
          const outerPivot = new THREE.Group();

          outerPivot.position.set(posX, floorY, posZ);

          // Always face the party regardless of approach direction.
          // Three.js lookAt aims the object's local -Z toward the target.
          // Our GLBs appear to already be -Z-forward, so we do NOT add an extra
          // 180° yaw (that was causing persistent backs-to-camera).
          const playerWorldX = playerState.x * ts;
          const playerWorldZ = playerState.y * ts;
          outerPivot.lookAt(playerWorldX, floorY, playerWorldZ);

          const toRad = (angle) => Math.abs(angle) > 6.28 ? (angle * Math.PI) / 180 : angle;
          const rawOffset = Array.isArray(mob.rotationOffset) ? mob.rotationOffset : [0, 0, 0];
          const rotOffset = rawOffset.map(toRad);

          // Apply pitch/roll only; yaw is fully handled by lookAt.
          model.rotation.set(rotOffset[0] || 0, 0, rotOffset[2] || 0);

          const rawScale = mob.scale !== undefined ? mob.scale : 0.75;
          const scaleVec = Array.isArray(rawScale) ? rawScale : [rawScale, rawScale, rawScale];
          model.scale.set(scaleVec[0], scaleVec[1], scaleVec[2]);

          outerPivot.add(model);

          outerPivot.userData = {
            instanceId: mob.instanceId,
            baseY: floorY,
            seed: idx * 1.5,
            hasSkeletalAnim: false
          };

          if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            const idleClip = gltf.animations.find(a => a.name.toLowerCase().includes('idle')) || gltf.animations[0];
            const action = mixer.clipAction(idleClip);
            action.play();

            this.mixers.push({ instanceId: mob.instanceId, mixer: mixer });
            outerPivot.userData.hasSkeletalAnim = true;
          }

          this.monsterGroup.add(outerPivot);
        },
        undefined,
        (error) => {
          console.warn(`[Renderer] Fallback placeholder for ${modelPath}:`, error);
          const geo = new THREE.BoxGeometry(0.5, 1.0, 0.5);
          const mat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(posX, floorY + 0.5, posZ);

          mesh.userData = { instanceId: mob.instanceId, baseY: floorY + 0.5, seed: idx * 1.5, hasSkeletalAnim: false };
          this.monsterGroup.add(mesh);
        }
      );
    });
  }

  shakeMonsterModel(instanceId) {
    const targetMesh = this.monsterGroup.children.find(
      c => c.userData && c.userData.instanceId === instanceId
    );
    if (!targetMesh) return;

    const basePositionX = targetMesh.position.x;
    let elapsedFrames = 0;

    const shakeInterval = setInterval(() => {
      targetMesh.position.x = basePositionX + (Math.random() - 0.5) * 0.18;
      elapsedFrames++;

      if (elapsedFrames >= 8) {
        clearInterval(shakeInterval);
        targetMesh.position.x = basePositionX;
      }
    }, 35);
  }

  // ---------------------------------------------------------------------------
  // World Building & Asset Loaders
  // ---------------------------------------------------------------------------

  loadExternalModel(path, x, y, scale = 1.0, rotationY = 0) {
    this.gltfLoader.load(path, (gltf) => {
      const model = gltf.scene;

      model.position.set(x * this.tileSize, -this.tileSize / 2, y * this.tileSize);
      model.scale.set(scale, scale, scale);
      model.rotation.y = rotationY;

      this.worldGroup.add(model);
    }, undefined, (error) => {
      console.error(`Asset not found: ${path}`, error);
    });
  }

  #findChestLid(modelScene) {
    return modelScene.getObjectByName('chest_lid');
  }

  loadChestModel(path, x, y, isOpened) {
    this.gltfLoader.load(path, (gltf) => {
      const chest = gltf.scene;
      chest.position.set(x * this.tileSize, -this.tileSize / 2, y * this.tileSize);

      const lid = this.#findChestLid(chest);
      if (isOpened && lid) {
        lid.rotation.x = -Math.PI / 1.5;
      }

      chest.userData = { gridX: x, gridY: y, lid: lid };
      this.worldGroup.add(chest);
    }, undefined, (error) => {
      console.error(`Chest asset not found: ${path}`, error);
    });
  }

  buildWorld(spec, gameState) {
    this.clearWorld();
    this.spec = spec;
    this.gameState = gameState;

    if (spec.assets && spec.assets.campfire) {
      this.gltfLoader.load(spec.assets.campfire, (gltf) => {
        this.loadedAssets['campfire'] = gltf.scene;
      });
    }

    const wallTexture = this.createStoneTexture();
    const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.8 });

    const floorTexture = this.createFloorTexture();
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.9 });

    const doorTexture = this.createDungeonDoorTexture();
    const doorMaterial = new THREE.MeshStandardMaterial({ map: doorTexture, roughness: 0.6 });

    const runicDoorTexture = this.createRunicDoorTexture();
    const runicDoorMaterial = new THREE.MeshStandardMaterial({ 
      map: runicDoorTexture, 
      roughness: 0.5,
      emissive: 0x112244,
      emissiveIntensity: 0.4
    });

    const grassTexture = this.createGrassTexture();
    const grassMaterial = new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 0.9 });

    const map = spec.map;
    const rows = map.length;
    const cols = map[0].length;
    const ts = this.tileSize;

    // Pre-rotate base geometries so matrix transformations align correctly to grid coordinates
    const floorGeo = new THREE.PlaneGeometry(ts, ts);
    floorGeo.rotateX(-Math.PI / 2);

    const ceilingGeo = new THREE.PlaneGeometry(ts, ts);
    ceilingGeo.rotateX(Math.PI / 2);

    const wallGeo = new THREE.BoxGeometry(ts, ts, ts);

    // Helper: Determine if a specific tile is outdoors / wilderness
    const isWildernessTileAt = (x, y) => {
      if (gameState && typeof gameState.isWildernessTile === 'function') {
        return gameState.isWildernessTile(x, y);
      }
      const tid = map[y][x];
      if (tid === 4 || tid === 5) return true;
      if (spec.surface_y_min !== undefined && y >= spec.surface_y_min) return true;
      if (spec.dungeon_y_max !== undefined && y > spec.dungeon_y_max) return true;
      return false;
    };

    // 1. Pass 1: Count map elements to size the InstancedMeshes accurately
    let floorCount = 0;
    let grassCount = 0;
    let ceilingCount = 0;
    let wallCount = 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tileId = map[y][x];
        const isWild = isWildernessTileAt(x, y);

        if (tileId === 1) {
          // Solid Wall box (does not get redundant coplanar floor or ceiling planes)
          wallCount++;
        } else {
          // Ground floor plane
          if (isWild || tileId === 4 || tileId === 5) {
            grassCount++;
          } else {
            floorCount++;
            ceilingCount++; // Only enclosed dungeon corridors receive ceilings
          }
        }
      }
    }

    // 2. Allocate InstancedMeshes
    const floorInstanced = floorCount > 0 ? new THREE.InstancedMesh(floorGeo, floorMaterial, floorCount) : null;
    const grassInstanced = grassCount > 0 ? new THREE.InstancedMesh(floorGeo, grassMaterial, grassCount) : null;
    const ceilingInstanced = ceilingCount > 0 ? new THREE.InstancedMesh(ceilingGeo, floorMaterial, ceilingCount) : null;
    const wallInstanced = wallCount > 0 ? new THREE.InstancedMesh(wallGeo, wallMaterial, wallCount) : null;

    let floorIdx = 0;
    let grassIdx = 0;
    let ceilingIdx = 0;
    let wallIdx = 0;

    const dummy = new THREE.Object3D();

    // 3. Pass 2: Populate instance matrices and retain unique objects (doors, chests, trees)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const wx = x * ts;
        const wz = y * ts;
        const tileId = map[y][x];
        const isWild = isWildernessTileAt(x, y);

        // Assign Floor / Grass / Ceiling matrices
        if (tileId === 1) {
          if (wallInstanced) {
            dummy.position.set(wx, 0, wz);
            dummy.updateMatrix();
            wallInstanced.setMatrixAt(wallIdx++, dummy.matrix);
          }
        } else {
          if (isWild || tileId === 4 || tileId === 5) {
            if (grassInstanced) {
              dummy.position.set(wx, -ts / 2, wz);
              dummy.updateMatrix();
              grassInstanced.setMatrixAt(grassIdx++, dummy.matrix);
            }
          } else {
            if (floorInstanced) {
              dummy.position.set(wx, -ts / 2, wz);
              dummy.updateMatrix();
              floorInstanced.setMatrixAt(floorIdx++, dummy.matrix);
            }
            if (ceilingInstanced) {
              dummy.position.set(wx, ts / 2, wz);
              dummy.updateMatrix();
              ceilingInstanced.setMatrixAt(ceilingIdx++, dummy.matrix);
            }
          }
        }

        // Assign Interactive Features & Foliage
        if (tileId === 5) {
          // Pine tree with double-sided materials and scaled cones to prevent coplanar collision
          const treeGroup = new THREE.Group();
          treeGroup.position.set(wx, -ts / 2, wz);

          const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, ts, 8);
          const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3319, roughness: 0.9 });
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.position.y = ts / 2;
          treeGroup.add(trunk);

          const leavesMat = new THREE.MeshStandardMaterial({ 
            color: 0x1e3f20, 
            roughness: 0.8,
            side: THREE.DoubleSide
          });
          const leaves1 = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.1, 8), leavesMat);
          leaves1.position.y = ts * 0.9;
          treeGroup.add(leaves1);

          const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 8), leavesMat);
          leaves2.position.y = ts * 1.45;
          treeGroup.add(leaves2);

          this.worldGroup.add(treeGroup);
        } else if (tileId === 2 || tileId === 8) {
          const isRunic = (tileId === 8);
          const activeMat = isRunic ? runicDoorMaterial : doorMaterial;
          const pivot = new THREE.Group();
          pivot.position.set(wx, 0, wz);

          const hasTop = (y > 0 && map[y - 1][x] === 1);
          const hasBottom = (y < map.length - 1 && map[y + 1][x] === 1);

          const thickness = ts * 0.15;
          let doorGeo;

          if (hasTop && hasBottom) {
            doorGeo = new THREE.BoxGeometry(thickness, ts, ts);
            doorGeo.translate(0, 0, ts / 2);
            pivot.position.set(wx, 0, wz - ts / 2);
            if (gameState && gameState.openedDoors && gameState.openedDoors.has(`${x},${y}`)) {
              pivot.rotation.y = Math.PI / 2;
            }
          } else {
            doorGeo = new THREE.BoxGeometry(ts, ts, thickness);
            doorGeo.translate(ts / 2, 0, 0);
            pivot.position.set(wx - ts / 2, 0, wz);
            if (gameState && gameState.openedDoors && gameState.openedDoors.has(`${x},${y}`)) {
              pivot.rotation.y = -Math.PI / 2;
            }
          }

          const doorMesh = new THREE.Mesh(doorGeo, activeMat);
          pivot.add(doorMesh);
          pivot.userData = { gridX: x, gridY: y };
          this.worldGroup.add(pivot);
        } else if (tileId === 3) {
          const chestPath = spec.assets && spec.assets.chest ? spec.assets.chest : 'assets/glb/chest.gltf';
          const isOpened = gameState && gameState.openedChests && gameState.openedChests.has(`${x},${y}`);
          this.loadChestModel(chestPath, x, y, isOpened);
        }
      }
    }

    // 4. Update and append instanced batches to the world group (disable frustum culling on whole-world instances)
    if (floorInstanced) {
      floorInstanced.instanceMatrix.needsUpdate = true;
      floorInstanced.frustumCulled = false;
      this.worldGroup.add(floorInstanced);
    }
    if (grassInstanced) {
      grassInstanced.instanceMatrix.needsUpdate = true;
      grassInstanced.frustumCulled = false;
      this.worldGroup.add(grassInstanced);
    }
    if (ceilingInstanced) {
      ceilingInstanced.instanceMatrix.needsUpdate = true;
      ceilingInstanced.frustumCulled = false;
      this.worldGroup.add(ceilingInstanced);
    }
    if (wallInstanced) {
      wallInstanced.instanceMatrix.needsUpdate = true;
      wallInstanced.frustumCulled = false;
      this.worldGroup.add(wallInstanced);
    }

    if (spec.entities) {
      spec.entities.forEach(ent => {
        const modelPath = spec.assets[ent.model];
        if (modelPath) {
          this.loadExternalModel(modelPath, ent.x, ent.y, 1.0, ent.rotation || 0);
        }
      });
    }
  }

  animateOpenDoor(x, y, onComplete) {
    let targetPivot = null;
    this.worldGroup.traverse((child) => {
      if (child.userData && child.userData.gridX === x && child.userData.gridY === y) {
        targetPivot = child;
      }
    });

    if (targetPivot) {
      this.animatingDoors.push({
        pivot: targetPivot,
        progress: 0,
        startRot: targetPivot.rotation.y,
        targetRot: targetPivot.rotation.y - Math.PI / 2,
        onComplete: onComplete
      });
    } else {
      if (onComplete) onComplete();
    }
  }

  animateOpenChest(x, y, onComplete) {
    let targetChest = null;
    this.worldGroup.traverse((child) => {
      if (child.userData && child.userData.gridX === x && child.userData.gridY === y) {
        targetChest = child;
      }
    });

    if (targetChest && targetChest.userData.lid) {
      this.animatingChests.push({
        lid: targetChest.userData.lid,
        progress: 0,
        startRot: targetChest.userData.lid.rotation.x,
        targetRot: -Math.PI / 1.5,
        onComplete: onComplete
      });
    } else {
      if (onComplete) onComplete();
    }
  }

  spawnCampfireModel(x, y) {
    if (this.loadedAssets && this.loadedAssets['campfire']) {
      this.campfireMesh = this.loadedAssets['campfire'].clone();
    } else {
      const group = new THREE.Group();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
      const fireMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff3300, roughness: 0.3 });
      for (let i = 0; i < 3; i++) {
        const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5), woodMat);
        wood.rotation.z = Math.PI / 3;
        wood.rotation.y = (i * Math.PI) / 3;
        wood.position.y = 0.15;
        group.add(wood);
      }
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 5), fireMat);
      fire.position.y = 0.2;
      group.add(fire);
      this.campfireMesh = group;
    }

    this.campfireMesh.position.set(x * this.tileSize, -this.tileSize / 2, y * this.tileSize);
    this.scene.add(this.campfireMesh);
  }

  removeCampfireModel() {
    if (this.campfireMesh) {
      this.scene.remove(this.campfireMesh);
      this.campfireMesh = null;
    }
  }

  enableCampfireFlicker(enable, x, y) {
    if (enable) {
      if (!this.campLight) {
        this.campLight = new THREE.PointLight(0xff7700, 2.5, 6);
        this.campLight.position.set(x * this.tileSize, 0.5, y * this.tileSize);
        this.scene.add(this.campLight);
      }
    } else if (this.campLight) {
      this.scene.remove(this.campLight);
      this.campLight = null;
    }
  }

  createStoneTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a3d40';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#1e2022';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 128, 64);
    ctx.strokeRect(0, 64, 128, 64);
    ctx.beginPath();
    ctx.moveTo(64, 0); ctx.lineTo(64, 64);
    ctx.moveTo(32, 64); ctx.lineTo(32, 128);
    ctx.moveTo(96, 64); ctx.lineTo(96, 128);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#222428';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#111215';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2d4c1e';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#385c26';
    for (let i = 0; i < 30; i++) {
      let rx = (i * 17) % 64;
      let ry = (i * 23) % 64;
      ctx.fillRect(rx, ry, 4, 4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  createDungeonDoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2b1d11';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#140c06';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 0); ctx.lineTo(32, 128);
    ctx.moveTo(64, 0); ctx.lineTo(64, 128);
    ctx.moveTo(96, 0); ctx.lineTo(96, 128);
    ctx.stroke();
    ctx.fillStyle = '#1e2024';
    ctx.fillRect(0, 16, 128, 20);
    ctx.fillRect(0, 92, 128, 20);
    ctx.fillStyle = '#4a4e52';
    [16, 64, 112].forEach(yPos => {
      [16, 64, 112].forEach(xPos => {
        ctx.beginPath();
        ctx.arc(xPos, yPos, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.strokeStyle = '#8c9298';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(100, 64, 10, 0, Math.PI * 2);
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createRunicDoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#10141f';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#388bfd';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 112, 112);
    ctx.beginPath();
    ctx.arc(64, 64, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#79c0ff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ᚱᛏ', 64, 72);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // ---------------------------------------------------------------------------
  // Master Frame Render Loop & Billboard Orientations
  // ---------------------------------------------------------------------------

  render(cameraState, gameState = this.gameState) {
    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();
    const state = gameState || this.gameState;

    // 1. Advance Skeletal Animations only if mixers exist
    if (this.mixers.length > 0) {
      this.mixers.forEach(item => {
        if (item.mixer) item.mixer.update(delta);
      });
    }

    // 2. Procedural Breathing Motion (only when monsters present, no skeletal anim)
    if (this.monsterGroup.children.length > 0) {
      this.monsterGroup.children.forEach(obj => {
        if (obj.userData && obj.userData.baseY !== undefined && !obj.userData.hasSkeletalAnim) {
          const seed = obj.userData.seed || 0;
          obj.position.y = obj.userData.baseY + Math.sin(elapsedTime * 3.5 + seed) * 0.035;
        }
      });
    }

    // 3. Process Door Animations (delta-time — ~0.21s open at 60fps)
    if (this.animatingDoors.length > 0) {
      const doorRate = 4.8;
      for (let i = this.animatingDoors.length - 1; i >= 0; i--) {
        const anim = this.animatingDoors[i];
        anim.progress = Math.min(1.0, anim.progress + doorRate * delta);
        anim.pivot.rotation.y = THREE.MathUtils.lerp(anim.startRot, anim.targetRot, anim.progress);

        if (anim.progress >= 1.0) {
          anim.pivot.rotation.y = anim.targetRot;
          if (anim.onComplete) anim.onComplete();
          this.animatingDoors.splice(i, 1);
        }
      }
    }

    // 4. Process Chest Animations (delta-time — same timing as doors)
    if (this.animatingChests.length > 0) {
      const chestRate = 4.8;
      for (let i = this.animatingChests.length - 1; i >= 0; i--) {
        const anim = this.animatingChests[i];
        anim.progress = Math.min(1.0, anim.progress + chestRate * delta);
        anim.lid.rotation.x = THREE.MathUtils.lerp(anim.startRot, anim.targetRot, anim.progress);

        if (anim.progress >= 1.0) {
          anim.lid.rotation.x = anim.targetRot;
          if (anim.onComplete) anim.onComplete();
          this.animatingChests.splice(i, 1);
        }
      }
    }

    // 5. Process Death Animations (delta-time)
    if (this.dyingMonsters.length > 0) {
      const deathRate = 2.4;
      const sinkSpeed = 1.5;
      for (let i = this.dyingMonsters.length - 1; i >= 0; i--) {
        const anim = this.dyingMonsters[i];
        anim.progress = Math.min(1.0, anim.progress + deathRate * delta);

        anim.mesh.rotation.x = THREE.MathUtils.lerp(anim.startRotX, anim.startRotX - Math.PI / 2, anim.progress);
        anim.mesh.position.y -= sinkSpeed * delta;
        anim.mesh.scale.multiplyScalar(Math.pow(0.95, delta * 60));

        if (anim.progress >= 1.0) {
          this.scene.remove(anim.mesh);
          this.#disposeObject(anim.mesh);
          this.dyingMonsters.splice(i, 1);
        }
      }
    }

    // 6. Atmosphere & Illumination System
    if (state) {
      const isWilderness = state.isWildernessTile ? state.isWildernessTile() : false;
      const isDarkDungeon = state.isDarknessActive ? state.isDarknessActive() : false;
      const lightSource = state.getActiveLightSource ? state.getActiveLightSource() : { active: false, type: null };

      if (isWilderness) {
        // Open wilderness: clear twilight atmosphere, gentle ambient light
        this.scene.fog.density = 0.045;
        this.scene.fog.color.setHex(0x0c1520);
        this.scene.background.setHex(0x0c1520);
        if (this.ambientLight) this.ambientLight.intensity = 0.75;
        if (this.dirLight) this.dirLight.intensity = 0.75;
        if (this.partyLight) this.partyLight.intensity = 0;
      } else if (!isDarkDungeon) {
        // Optional lighter dungeon mode (specified by adventure module)
        this.scene.fog.density = 0.08;
        this.scene.fog.color.setHex(0x0a1018);
        this.scene.background.setHex(0x0a1018);
        if (this.ambientLight) this.ambientLight.intensity = 0.60;
        if (this.dirLight) this.dirLight.intensity = 0.50;
        if (this.partyLight) this.partyLight.intensity = 0;
      } else {
        // Dark Dungeon / Ruins / Cave mode: requires torch or Arcane Light spell
        if (cameraState) {
          const ts = this.tileSize;
          this.partyLight.position.set(cameraState.x * ts, 0.1, cameraState.y * ts);
        }

        if (lightSource.active && lightSource.type === 'arcane_light') {
          // Arcane Light: eerie azure/cyan mystical glow with pulsing hum
          const pulse = Math.sin(elapsedTime * 2.5) * 0.35 + Math.sin(elapsedTime * 5.2) * 0.15;
          this.partyLight.color.setHex(0x5ce1e6);
          this.partyLight.intensity = 2.6 + pulse;
          this.partyLight.distance = 11.0;
          this.partyLight.decay = 1.6;

          this.scene.fog.density = 0.10;
          this.scene.fog.color.setHex(0x03080e);
          this.scene.background.setHex(0x03080e);
          if (this.ambientLight) this.ambientLight.intensity = 0.15;
          if (this.dirLight) this.dirLight.intensity = 0.05;
        } else if (lightSource.active && lightSource.type === 'torch') {
          // Torchlight: warm organic flame flicker & slight jitter
          const flicker = Math.sin(elapsedTime * 14.0) * 0.30 + Math.sin(elapsedTime * 28.0) * 0.18 + (Math.random() * 0.12);
          this.partyLight.color.setHex(0xff8a33);
          this.partyLight.intensity = 2.4 + flicker;
          this.partyLight.distance = 9.5;
          this.partyLight.decay = 1.8;
          // Slight handheld sway
          this.partyLight.position.x += Math.sin(elapsedTime * 7) * 0.04;
          this.partyLight.position.z += Math.cos(elapsedTime * 8) * 0.04;

          this.scene.fog.density = 0.11;
          this.scene.fog.color.setHex(0x050403);
          this.scene.background.setHex(0x050403);
          if (this.ambientLight) this.ambientLight.intensity = 0.12;
          if (this.dirLight) this.dirLight.intensity = 0.04;
        } else {
          // Pitch darkness: heavy thick fog, faint silhouettes only
          this.partyLight.intensity = 0;
          this.scene.fog.density = 0.28;
          this.scene.fog.color.setHex(0x010204);
          this.scene.background.setHex(0x010204);
          if (this.ambientLight) this.ambientLight.intensity = 0.04;
          if (this.dirLight) this.dirLight.intensity = 0.0;
        }
      }
    }

    // 7. Campfire Light Flicker
    if (this.campLight) {
      this.campLight.intensity = 2.2 + Math.sin(elapsedTime * 12) * 0.4 + (Math.random() * 0.15);
    }

    // 8. Update First-Person Camera
    if (cameraState) {
      const ts = this.tileSize;
      this.camera.position.set(cameraState.x * ts, 0, cameraState.y * ts);

      const lookDist = 1;
      const lookX = (cameraState.x + Math.cos(cameraState.angle) * lookDist) * ts;
      const lookZ = (cameraState.y + Math.sin(cameraState.angle) * lookDist) * ts;
      this.camera.lookAt(lookX, 0, lookZ);
    }

    // 9. Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}