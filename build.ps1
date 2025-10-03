Write-Host "Building HTML Preview Extension..." -ForegroundColor Green

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install --ignore-scripts

# Set Node options to fix OpenSSL error
$env:NODE_OPTIONS = "--openssl-legacy-provider"

Write-Host "Building extension..." -ForegroundColor Yellow
& "./node_modules/.bin/tsc" -p "./tsconfig.json"

if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compilation failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Building preview..." -ForegroundColor Yellow
& "./node_modules/.bin/webpack-cli"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Webpack build failed!" -ForegroundColor Red
    exit 1
}

# Clear Node options
$env:NODE_OPTIONS = ""

Write-Host "Build complete!" -ForegroundColor Green