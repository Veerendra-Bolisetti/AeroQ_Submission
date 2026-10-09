#!/usr/bin/env bash
# Build script for Render deployment
# Installs Python backend deps + builds the React frontend

set -o errexit

echo "=== Installing Python dependencies ==="
pip install --upgrade pip
pip install -r requirements.txt

echo "=== Installing Node.js and building frontend ==="
# Render provides Node.js in its Python environment
cd frontend
npm install
VITE_API_URL="/api" npm run build
cd ..

echo "=== Build complete ==="
