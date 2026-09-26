#!/usr/bin/env bash
# Run from the repo root: bash infra/scripts/bundle-lambda.sh
set -e

BUNDLE="infra/lambda-bundle"
BACKEND="backend"
PLATFORM="x86_64-unknown-linux-gnu"

echo "==> Cleaning bundle directory..."
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/models_ml"

echo "==> Installing all packages for Linux/x86_64..."
uv pip install \
  --python 3.11 \
  --target "$BUNDLE" \
  --python-platform "$PLATFORM" \
  "numpy>=1.26.0" \
  "pandas>=2.2.2" \
  "scikit-learn>=1.5.1" \
  "reportlab>=4.5.1" \
  "mangum>=0.17.0" \
  "fastapi>=0.115.0" \
  "uvicorn>=0.30.0" \
  "pydantic>=2.8.0" \
  "pydantic-settings>=2.3.0" \
  "python-dotenv>=1.0.1" \
  "anthropic>=0.34.0" \
  "python-docx>=1.2.0"

# Scipy é dependência transitiva do scikit-learn mas não é necessária para
# inferência com RandomForest/Dummy. Remove para caber no limite de 250 MB.
echo "==> Removing scipy (not needed for inference)..."
rm -rf "$BUNDLE/scipy" "$BUNDLE/scipy.libs" "$BUNDLE/"scipy-*.dist-info 2>/dev/null || true

echo "==> Copying app code..."
cp -r "$BACKEND/app" "$BUNDLE/"
mkdir -p "$BUNDLE/data"
cp -r "$BACKEND/data/samples" "$BUNDLE/data/"
cp -r "$BACKEND/data/operation_demo_run" "$BUNDLE/data/" 2>/dev/null || true
cp -r "$BACKEND/data/operation_demo_study" "$BUNDLE/data/" 2>/dev/null || true
cp "$BACKEND/models_ml/curtailment_model.pkl" "$BUNDLE/models_ml/"
cp "$BACKEND/lambda_handler.py" "$BUNDLE/"

echo "==> Cleaning up __pycache__ and .pyc..."
find "$BUNDLE" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$BUNDLE" -name "*.pyc" -delete 2>/dev/null || true

echo "==> Bundle size:"
du -sh "$BUNDLE"
echo "Done."
