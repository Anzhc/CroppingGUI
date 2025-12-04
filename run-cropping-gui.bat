@echo off
setlocal

REM Always run from this script's directory
pushd "%~dp0"

REM Ensure Node.js tooling is available
where npm >nul 2>&1
if errorlevel 1 (
  echo npm is not available on PATH. Please install Node.js from https://nodejs.org/ and retry.
  pause
  goto :end
)

REM Install dependencies if they are missing
if not exist "node_modules" (
  echo Installing dependencies...
  npm install
  if errorlevel 1 (
    echo Dependency installation failed. Fix errors above and retry.
    pause
    goto :end
  )
)

REM Start the Electron app
echo Launching Cropping GUI...
npm start

:end
popd
endlocal
