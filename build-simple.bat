@echo off
setlocal
echo Building HTML Preview Extension (Simple)...

echo Installing dependencies...
call npm install --ignore-scripts

echo Creating out directory...
if not exist out mkdir out

rem Prefer @types/vscode; only create minimal stub if types are missing
if not exist node_modules\@types\vscode (
  echo Ensuring minimal VS Code types exist
  if not exist out\vscode mkdir out\vscode
  if not exist out\vscode\index.d.ts (
    echo Creating VS Code types stub...
    echo declare module 'vscode'; > out\vscode\index.d.ts
  )
) else (
  echo Using @types/vscode from node_modules
)

echo Building extension...
set NODE_OPTIONS=--openssl-legacy-provider
call npx tsc -p ./tsconfig.json
if errorlevel 1 goto :error

echo Building preview...
set NODE_OPTIONS=--openssl-legacy-provider
call npx webpack-cli
if errorlevel 1 goto :error

echo Build complete!
goto :eof

:error
echo Build failed. See output above.
exit /b 1

endlocal
