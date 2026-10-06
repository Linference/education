param([string]$ProjectRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$videoOutput = Join-Path $ProjectRoot (([string][char]0x4ea7)+([char]0x51fa)+'/demo-video-20261002')
$audioOutput = Join-Path $videoOutput 'audio'
New-Item -ItemType Directory -Path $audioOutput -Force | Out-Null
$narrationItems = Get-Content -LiteralPath (Join-Path $ProjectRoot 'scripts/video/narration.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$narrator = New-Object System.Speech.Synthesis.SpeechSynthesizer
$narrator.SelectVoice('Microsoft Zira Desktop')
$narrator.Rate = 0
$narrator.Volume = 100
foreach ($narrationItem in $narrationItems) {
  $narrationPath = Join-Path $audioOutput ($narrationItem.id + '.wav')
  $narrator.SetOutputToWaveFile($narrationPath)
  $narrationText = [System.Security.SecurityElement]::Escape($narrationItem.text)
  $narrationText = $narrationText.Replace('Gezhi', '<sub alias="Guh jee">Gezhi</sub>').Replace('. ', '.<break time="220ms"/> ')
  $narrator.SpeakSsml('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><prosody rate="-3%">' + $narrationText + '</prosody></speak>')
  $narrator.SetOutputToNull()
  Write-Output ('Narrated ' + $narrationItem.id)
}
$narrator.Dispose()
