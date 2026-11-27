# Pulseboard collector for Windows.
#
# READ-ONLY. It reads system information (CIM, performance counters, the list of installed programs) and prints
# one JSON document. It changes nothing and runs nothing else.
#
# Install (run PowerShell as Administrator):
#   New-Item -ItemType Directory -Force C:\ProgramData\Pulseboard | Out-Null
#   Copy-Item .\collect.ps1 C:\ProgramData\Pulseboard\collect.ps1
#   # The SSH user may read this script but not change it:
#   icacls C:\ProgramData\Pulseboard /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" "<ssh user>:(OI)(CI)RX"
#
# Pulseboard runs it over SSH through a forced command, sending the word "metrics" or "inventory".
# Anything else is treated as "metrics".
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false   # UTF-8 without a byte-order mark
$mode = if ($env:SSH_ORIGINAL_COMMAND -eq 'inventory') { 'inventory' } else { 'metrics' }

function Txt($v, [int]$max = 200) {
  if ($null -eq $v) { return $null }
  $t = ([string]$v).Trim()
  if ($t.Length -gt $max) { $t = $t.Substring(0, $max) }
  if ($t) { return $t } else { return $null }
}
function Num($v, [int]$digits = 1) { if ($null -eq $v) { return $null } else { return [math]::Round([double]$v, $digits) } }
function Emit($obj) { $obj | ConvertTo-Json -Depth 8 -Compress }

$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1

if ($mode -eq 'metrics') {
  # CPU use per core, and network rates, from two samples one second apart. Process CPU from the change in CPU time.
  $before = @{}
  Get-Process | ForEach-Object { $before[$_.Id] = $_.CPU }
  $t0 = Get-Date
  $samples = Get-Counter -Counter '\Processor(*)\% Processor Time', '\Network Interface(*)\Bytes Received/sec', '\Network Interface(*)\Bytes Sent/sec' -SampleInterval 1 -MaxSamples 2
  $secs = [math]::Max(0.5, ((Get-Date) - $t0).TotalSeconds)
  $last = $samples[-1].CounterSamples

  $cores = @($last | Where-Object { $_.Path -like '*\processor(*)\% processor time' -and $_.InstanceName -match '^\d+$' } |
    Sort-Object { [int]$_.InstanceName } | ForEach-Object { Num $_.CookedValue 1 })
  $totalSample = $last | Where-Object { $_.Path -like '*\processor(_total)\% processor time' } | Select-Object -First 1

  $rx = @{}; $tx = @{}
  foreach ($s in $last) {
    if ($s.Path -like '*bytes received/sec') { $rx[$s.InstanceName] = $s.CookedValue }
    elseif ($s.Path -like '*bytes sent/sec') { $tx[$s.InstanceName] = $s.CookedValue }
  }
  # Performance counters name adapters with a few characters replaced
  function CounterName($d) { return ((([string]$d) -replace '\(', '[' -replace '\)', ']' -replace '#', '_' -replace '/', '_' -replace '\\', '_').ToLower()) }
  $net = @(Get-NetAdapter -Physical | ForEach-Object {
    $k = CounterName $_.InterfaceDescription
    @{
      name = (Txt $_.Name 80); mac = (Txt $_.MacAddress 40); up = ($_.Status -eq 'Up')
      speedMbps = $(if ($_.ReceiveLinkSpeed) { [math]::Round($_.ReceiveLinkSpeed / 1e6) } else { $null })
      inBps = (Num $rx[$k] 0); outBps = (Num $tx[$k] 0)
    }
  })

  $vols = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
    @{ mount = (Txt $_.DeviceID 80); label = (Txt $_.VolumeName 80); fs = (Txt $_.FileSystem 30); sizeBytes = [double]$_.Size; freeBytes = [double]$_.FreeSpace }
  })

  $ncpu = [Environment]::ProcessorCount
  $procs = @(Get-Process | Where-Object { $_.Id -ne 0 } | ForEach-Object {
    $d = 0
    if ($null -ne $_.CPU -and $before.ContainsKey($_.Id) -and $null -ne $before[$_.Id]) { $d = [math]::Max(0, $_.CPU - $before[$_.Id]) }
    @{ pid = $_.Id; name = (Txt $_.ProcessName 80); cpuPct = (Num (100 * $d / $secs / $ncpu) 1); memBytes = [double]$_.WorkingSet64 }
  } | Sort-Object { $_.cpuPct }, { $_.memBytes } -Descending | Select-Object -First 30)

  # A service counts as Failed when it is set to start automatically, is stopped, and its last exit code was an error
  # (1077 means "never started", which is not a failure). Other stopped services are simply Stopped.
  $svcs = @(Get-CimInstance Win32_Service | ForEach-Object {
    $state = 'Stopped'
    if ($_.State -eq 'Running' -or $_.State -like '*Pending') { $state = 'Running' }
    elseif ($_.StartMode -eq 'Auto' -and $_.ExitCode -ne 0 -and $_.ExitCode -ne 1077) { $state = 'Failed' }
    @{ name = (Txt $_.Name 120); display = (Txt $_.DisplayName 200); state = $state; startType = (Txt $_.StartMode 30) }
  } | Select-Object -First 1500)

  $totalKb = [double]$os.TotalVisibleMemorySize
  Emit @{
    schema = 1; hostname = (Txt $env:COMPUTERNAME 80); os = (Txt $os.Caption 120)
    uptimeS = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalSeconds)
    cpu = @{ model = (Txt $cpu.Name 120); loadPct = (Num $totalSample.CookedValue 1); perCore = $cores }
    memory = @{ totalBytes = ($totalKb * 1024); usedBytes = (($totalKb - [double]$os.FreePhysicalMemory) * 1024) }
    volumes = $vols; network = $net; processes = $procs; services = $svcs
  }
  exit 0
}

# ---- inventory: hardware details, read once an hour ----
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$board = Get-CimInstance Win32_BaseBoard

$memTypes = @{ 20 = 'DDR'; 21 = 'DDR2'; 24 = 'DDR3'; 26 = 'DDR4'; 34 = 'DDR5'; 35 = 'LPDDR5' }
$mods = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  $speed = $_.ConfiguredClockSpeed
  if (-not $speed) { $speed = $_.Speed }
  $type = $null
  if ($null -ne $_.SMBIOSMemoryType -and $memTypes.ContainsKey([int]$_.SMBIOSMemoryType)) { $type = $memTypes[[int]$_.SMBIOSMemoryType] }
  @{ slot = (Txt $_.DeviceLocator 60); sizeBytes = [double]$_.Capacity; speedMhz = $speed; type = $type; manufacturer = (Txt $_.Manufacturer 60); partNumber = (Txt $_.PartNumber 60); serial = (Txt $_.SerialNumber 60) }
})

# Drive type and health come from the storage module where it is readable; they are left empty when it is not
$phys = @{}
Get-PhysicalDisk | ForEach-Object { $phys[([string]$_.SerialNumber).Trim()] = $_ }
$disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
  $pd = $phys[([string]$_.SerialNumber).Trim()]
  @{ model = (Txt $_.Model 120); serial = (Txt $_.SerialNumber 80); sizeBytes = [double]$_.Size; mediaType = (Txt $pd.MediaType 30); health = (Txt $pd.HealthStatus 40); tempC = $null }
})

$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
  @{ name = (Txt $_.Name 120); driver = (Txt $_.DriverVersion 60); vramBytes = $(if ($_.AdapterRAM) { [double]$_.AdapterRAM } else { $null }) }
})

$apps = @(foreach ($path in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') {
  Get-ItemProperty $path | Where-Object { $_.DisplayName -and -not $_.SystemComponent } | ForEach-Object {
    @{ name = (Txt $_.DisplayName 150); version = (Txt $_.DisplayVersion 60) }
  }
})
$apps = @($apps | Sort-Object { $_.name } -Unique | Select-Object -First 800)

$biosDate = $null
if ($bios.ReleaseDate) { $biosDate = $bios.ReleaseDate.ToString('yyyy-MM-dd') }

Emit @{
  schema = 1; hostname = (Txt $env:COMPUTERNAME 80); osName = (Txt $os.Caption 120); osBuild = (Txt "$($os.Version) (build $($os.BuildNumber))" 80)
  system = @{
    manufacturer = (Txt $cs.Manufacturer 80); model = (Txt $cs.Model 80); serial = (Txt $bios.SerialNumber 80)
    biosVersion = (Txt $bios.SMBIOSBIOSVersion 80); biosDate = $biosDate
    boardManufacturer = (Txt $board.Manufacturer 80); boardModel = (Txt $board.Product 80); boardSerial = (Txt $board.SerialNumber 80)
  }
  cpu = @{ model = (Txt $cpu.Name 120); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors }
  memory = @{ totalBytes = [double]$cs.TotalPhysicalMemory }
  ramModules = $mods; disks = $disks; gpus = $gpus; apps = $apps
}
