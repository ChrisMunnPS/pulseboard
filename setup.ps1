# Creates .env with generated secrets. Safe to re-run: never overwrites an existing .env.
# Works in Windows PowerShell 5.1 and PowerShell 7+.
$ErrorActionPreference = 'Stop'
if (Test-Path .env) { Write-Host '.env already exists - leaving it alone.'; return }

$chars = (48..57) + (65..90) + (97..122) | ForEach-Object { [char]$_ }   # 62 characters
function New-Secret([int]$Length) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $byte = New-Object byte[] 1
  $secret = ''
  while ($secret.Length -lt $Length) {
    $rng.GetBytes($byte)
    if ($byte[0] -lt 248) { $secret += $chars[$byte[0] % 62] }   # 248 = 4 x 62, avoids modulo bias
  }
  $rng.Dispose()
  return $secret
}

$email = Read-Host 'Admin email [admin@example.com]'
if (-not $email) { $email = 'admin@example.com' }
$dbPassword = New-Secret 24
$jwtSecret  = New-Secret 48
$adminPassword = New-Secret 16
if (-not ($dbPassword -and $jwtSecret -and $adminPassword)) { throw 'Could not generate secrets. No .env was written.' }

(Get-Content .env.example) `
  -replace '^DB_PASSWORD=.*', "DB_PASSWORD=$dbPassword" `
  -replace '^JWT_SECRET=.*', "JWT_SECRET=$jwtSecret" `
  -replace '^ADMIN_EMAIL=.*', "ADMIN_EMAIL=$email" `
  -replace '^ADMIN_PASSWORD=.*', "ADMIN_PASSWORD=$adminPassword" | Set-Content .env -Encoding ascii

Write-Host 'Created .env'
Write-Host "Admin sign-in: $email / $adminPassword"
Write-Host 'Next: docker compose up -d, then open http://localhost:3000'
