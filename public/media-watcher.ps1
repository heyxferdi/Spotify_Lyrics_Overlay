# Reads "now playing" info from Windows (System Media Transport Controls) and
# prints one JSON line every 500 ms. No Spotify API, no token.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($winRtTask, $resultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
    $netTask = $asTask.Invoke($null, @($winRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
    ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

while ($true) {
    try {
        # Prefer the Spotify app; otherwise fall back to whatever Windows says is current
        # (e.g. Spotify playing in Edge/Chrome).
        $session = $null
        foreach ($s in $mgr.GetSessions()) {
            if ($s.SourceAppUserModelId -like '*Spotify*') { $session = $s; break }
        }
        if ($null -eq $session) { $session = $mgr.GetCurrentSession() }

        if ($null -eq $session) {
            Write-Output 'null'
        } else {
            $props = Await ($session.TryGetMediaPropertiesAsync()) `
                ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            $tl = $session.GetTimelineProperties()
            $pb = $session.GetPlaybackInfo()
            $playing = ($pb.PlaybackStatus.ToString() -eq 'Playing')

            $pos = $tl.Position.TotalMilliseconds
            if ($playing) {
                $pos += ([DateTimeOffset]::UtcNow - $tl.LastUpdatedTime).TotalMilliseconds
            }
            $end = $tl.EndTime.TotalMilliseconds
            if ($end -gt 0 -and $pos -gt $end) { $pos = $end }
            if ($pos -lt 0) { $pos = 0 }

            $obj = [ordered]@{
                source     = $session.SourceAppUserModelId
                title      = $props.Title
                artist     = $props.Artist
                album      = $props.AlbumTitle
                durationMs = [math]::Round($end)
                positionMs = [math]::Round($pos)
                playing    = $playing
            }
            Write-Output ($obj | ConvertTo-Json -Compress)
        }
    } catch {
        [Console]::Error.WriteLine("media-watcher: " + $_.Exception.Message)
    }
    Start-Sleep -Milliseconds 500
}
