<#
.SYNOPSIS
    Brings the Windows Mobile Hotspot up, so the ESP32 board can reach the API.

.DESCRIPTION
    The board is configured for the PC's mobile hotspot (see
    firmware\myturn_desk\secrets.h) and the API is reached at 192.168.137.1.
    If the hotspot is switched off, the board cannot associate and the log
    shows "wifi down" and "retrying Wi-Fi" every ten seconds, while the server
    shows the device as offline.

    This adapter does not support the legacy hosted network, so
    "netsh wlan start hostednetwork" cannot work. Only the Mobile Hotspot API
    can start it, which is what this script calls.

    It reads the SSID and the passphrase from the sketch's secrets.h, so the
    board keeps working without being re-flashed. The passphrase is never
    printed.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\start-hotspot.ps1
#>
$ErrorActionPreference = "Stop"

$sketch = Join-Path (Split-Path $PSScriptRoot -Parent) "firmware\myturn_desk\secrets.h"
if (-not (Test-Path $sketch)) {
    Write-Output "no secrets.h at $sketch - the board's Wi-Fi details are unknown"
    exit 1
}
$secrets = Get-Content $sketch
$ssid = ($secrets | Select-String 'WIFI_SSID\s+"([^"]+)"').Matches[0].Groups[1].Value
$pass = ($secrets | Select-String 'WIFI_PASS\s+"([^"]+)"').Matches[0].Groups[1].Value
if (-not $ssid) { Write-Output "no WIFI_SSID in secrets.h"; exit 1 }

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
[Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime] | Out-Null
[Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime] | Out-Null
[Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime] | Out-Null

function Await($op, $type) {
    # The PowerShell projection sometimes hands back the result already
    # unwrapped, and sometimes the IAsyncOperation. Take whichever it is.
    if ($op -is $type) { return $op }
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}

$profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
if ($null -eq $profile) {
    Write-Output "the PC has no internet connection, so there is no profile to share"
    exit 1
}

$manager = Await ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager])
Write-Output ("hotspot state before : " + $manager.TetheringOperationalState)

if ($manager.TetheringOperationalState -ne 'On') {
    $result = Await ($manager.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
    Write-Output ("start result         : " + $result.Status + " " + $result.AdditionalErrorMessage)
    if ($result.Status -ne 'Success') { exit 1 }
} else {
    Write-Output "the hotspot is already on - nothing to do"
}

Start-Sleep -Seconds 5
$address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like "192.168.137.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
Write-Output ""
Write-Output ("hotspot SSID         : " + $ssid)
Write-Output ("gateway the board uses: " + $(if ($address) { $address } else { "not found - is the API_BASE in secrets.h still right?" }))
Write-Output "the board retries the Wi-Fi every 10 s, so it should be back within half a minute"
