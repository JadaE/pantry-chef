#!/usr/bin/env node
// v0.0.6: make expo-camera's Android preview use a TextureView (CameraX PreviewView COMPATIBLE mode) instead of the default
// SurfaceView (PERFORMANCE mode). A SurfaceView is a separate window layer that does not follow normal view clipping and
// z-order, and can leave a stale black rectangle on screen after the camera screen closes. A TextureView draws inside the
// normal view tree, so it disappears with its parent. Idempotent; fails loudly if expo-camera's source changed.
// Runs from app/package.json "postinstall" and again from build-apk.sh.
const fs = require('fs'); const path = require('path');
const DIR = path.resolve(__dirname, '..', 'app');
const f = path.join(DIR, 'node_modules/expo-camera/android/src/main/java/expo/modules/camera/ExpoCameraView.kt');
if (!fs.existsSync(f)) { console.log('patch-expo-camera: expo-camera not installed yet, skipping'); process.exit(0); }
let s = fs.readFileSync(f, 'utf8');
const MARK = 'PANTRYCHEF_TEXTUREVIEW';
if (s.includes(MARK)) { console.log('patch-expo-camera: already patched'); process.exit(0); }
const from = 'private var previewView = PreviewView(context).apply {\n    elevation = 0f\n  }';
if (!s.includes(from)) { console.error('patch-expo-camera: expected PreviewView block not found in ExpoCameraView.kt (expo-camera changed?)'); process.exit(1); }
s = s.replace(from, 'private var previewView = PreviewView(context).apply {\n    elevation = 0f\n    implementationMode = PreviewView.ImplementationMode.COMPATIBLE // ' + MARK + '\n  }');
fs.writeFileSync(f, s);
console.log('patch-expo-camera: PreviewView set to COMPATIBLE (TextureView)');
