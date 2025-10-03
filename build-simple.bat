@echo off
echo Building HTML Preview Extension (Simple)...

echo Installing dependencies...
call npm install --ignore-scripts

echo Creating out directory...
if not exist out mkdir out

echo Ensuring VS Code types exist
if not exist out\vscode mkdir out\vscode
if not exist out\vscode\index.d.ts (
    echo Creating VS Code types...
    echo declare module 'vscode'; > out\vscode\index.d.ts
)

echo Building extension...
set NODE_OPTIONS=--openssl-legacy-provider
call npx tsc -p ./tsconfig.json

echo Building preview...
call npx webpack-cli

echo Build complete!
pause