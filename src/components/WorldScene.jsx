import React, { useEffect, useState, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls, OrthographicCamera, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import * as THREE from 'three';
import { textureManager } from '../core/TextureManager';
import { testWorldGenerator } from '../world/TestWorldGenerator';
import { chunkMesher } from '../core/ChunkMesher';
import { getBlockById, BLOCKS } from '../core/BlockRegistry';

const RTSInputHandler = () => {
  const { camera, controls } = useThree();
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false });
  const mousePos = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        setKeys(prev => ({ ...prev, [key]: true }));
      }
    };
    
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        setKeys(prev => ({ ...prev, [key]: false }));
      }
    };

    const handleMouseMove = (e) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useFrame((state, delta) => {
    const speed = 15 * delta; // Reduced speed (was 20)
    const edgeThreshold = 15; // Reduced threshold (was 20)
    const { innerWidth, innerHeight } = window;
    
    // Direction vector accumulation
    // WASD Movement
    // Edge Scrolling
    
    let inputX = 0;
    let inputZ = 0;
    
    if (keys.w) inputZ -= 1;
    if (keys.s) inputZ += 1;
    if (keys.a) inputX -= 1;
    if (keys.d) inputX += 1;
    
    const mx = mousePos.current.x;
    const my = mousePos.current.y;

    if (my < edgeThreshold) inputZ -= 1;
    if (my > innerHeight - edgeThreshold) inputZ += 1;
    if (mx < edgeThreshold) inputX -= 1;
    if (mx > innerWidth - edgeThreshold) inputX += 1;
    
    if (inputX !== 0 || inputZ !== 0) {
      const moveVec = new THREE.Vector3();
      
      // Get camera's forward vector projected on XZ plane
      const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      camForward.y = 0;
      camForward.normalize();
      
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      camRight.y = 0;
      camRight.normalize();
      
      // Standardize speed
      const inputDir = new THREE.Vector3(inputX, 0, inputZ).normalize();
      
      moveVec
          .addScaledVector(camForward, -inputDir.z) // Input Z is -1 for forward (W)
          .addScaledVector(camRight, inputDir.x)
          .multiplyScalar(speed);
          
      camera.position.add(moveVec);
      if (controls) {
        controls.target.add(moveVec);
      }
    }
  });
  return null;
};

const ChunkRenderer = ({ setHoverInfo }) => {
  const meshRef = useRef();
  const [geometry, setGeometry] = useState(null);
  const [material, setMaterial] = useState(null);
  const { camera, raycaster, pointer, scene } = useThree();

  useEffect(() => {
    const init = async () => {
      await textureManager.loadTextures();
      const atlas = textureManager.getTexture();
      
      const mat = new THREE.MeshStandardMaterial({
        map: atlas,
        vertexColors: true,
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
      });
      setMaterial(mat);

      const { ids, metadata } = testWorldGenerator.generateTestChunk();
      const geo = chunkMesher.generateGeometry({ ids, metadata });
      setGeometry(geo);
    };
    init();
  }, []);

  useFrame(() => {
    if (!meshRef.current || !geometry) return;
    
    if (!meshRef.current.userData.chunkData) {
        meshRef.current.userData.chunkData = testWorldGenerator.generateTestChunk();
    }

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(meshRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0];
      
      // Improve precision: use face normal to push 'in' slightly
      const x = Math.floor(hit.point.x - hit.face.normal.x * 0.001);
      const y = Math.floor(hit.point.y - hit.face.normal.y * 0.001);
      const z = Math.floor(hit.point.z - hit.face.normal.z * 0.001);

      const { ids } = meshRef.current.userData.chunkData;
      const CHUNK_SIZE = 16;
      
      if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
          const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          const blockId = ids[index];
          const block = getBlockById(blockId);
          
          // Filter out AIR hits (shouldn't happen with raycaster unless geometry exists for air, which it doesn't)
          // But sometimes boundary hits might resolve to a neighbor air block?
          if (block.id !== BLOCKS.AIR.id) {
              setHoverInfo({
                  name: block.name,
                  id: block.id,
                  x, y, z
              });
          } else {
              setHoverInfo(null);
          }
      } else {
          setHoverInfo(null);
      }
    } else {
      setHoverInfo(null);
    }
  });

  if (!geometry || !material) return null;

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
  );
};

export const WorldScene = () => {
  const [hoverInfo, setHoverInfo] = useState(null);


  const isoPosition = [20, 20, 20]; // Isometric angle
  
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Canvas>
        <OrthographicCamera makeDefault position={isoPosition} zoom={40} near={-50} far={200} />
        <MapControls 
            makeDefault
            enableRotate={true} 
            enableZoom={true} 
            enablePan={true}
            enableDamping={true} 
            dampingFactor={0.05}
            zoomSpeed={0.5}
            screenSpacePanning={false}
            minZoom={10}
            maxZoom={100}
            mouseButtons={{
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: null
            }}
        />
        <RTSInputHandler />
        
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 20, 10]} intensity={1.0} castShadow />

        <ChunkRenderer setHoverInfo={setHoverInfo} />

        <GizmoHelper 
            alignment="top-right" 
            margin={[80, 80]} 
            onUpdate={() => {
                // When gizmo is interacting, it updates the camera.
                // We might need to ensure controls don't override this if they were active.
                // But MapControls (OrbitControls) usually respects external camera updates unless it's actively dragging.
            }}
        >
            <GizmoViewcube 
                faces={['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back']}
                opacity={1}
                color="#f0f0f0"
                strokeColor="#888"
                textColor="black"
                hoverColor="#67b5e6"
            />
        </GizmoHelper>
      </Canvas>
      
      {hoverInfo && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          pointerEvents: 'none',
          fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '4px' }}>{hoverInfo.name}</div>
          <div style={{ fontSize: '0.9em', color: '#aaa' }}>ID: {hoverInfo.id}</div>
          <div style={{ fontSize: '0.8em', fontFamily: 'monospace', marginTop: '4px', color: '#888' }}>
            X: {hoverInfo.x}, Y: {hoverInfo.y}, Z: {hoverInfo.z}
          </div>
        </div>
      )}
    </div>
  );
};
