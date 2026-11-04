param([Parameter(Mandatory=$true)][string]$Archive)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$targetRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../data/jobs/0.7.0'))
$zip=[IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Archive).Path)
$prefix='Service_agents/respondent/personas/jobs/'
try {
  $entries=@($zip.Entries | Where-Object {$_.FullName.StartsWith($prefix)})
  $manifest=$entries | Where-Object {$_.FullName -eq ($prefix+'manifest.json')}
  if(!$manifest){throw '缺少 Jobs manifest'}
  $reader=[IO.StreamReader]::new($manifest.Open())
  try {$version=($reader.ReadToEnd() | ConvertFrom-Json).version} finally {$reader.Dispose()}
  if($version -ne '0.7.0'){throw '只支持 Jobs v0.7.0'}
  $count=0
  foreach($entry in $entries){
    $relative=$entry.FullName.Substring($prefix.Length)
    if($relative -notin @('system.md','personas.json','manifest.json') -and $relative -notmatch '^(knowledge|raw|local-books)/.+\.md$'){continue}
    $destination=[IO.Path]::GetFullPath((Join-Path $targetRoot $relative))
    if(!$destination.StartsWith($targetRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw '资料路径越界'}
    if(Test-Path -LiteralPath $destination){throw "已有资料未覆盖：$destination"}
  }
  foreach($entry in $entries){
    $relative=$entry.FullName.Substring($prefix.Length)
    if($relative -notin @('system.md','personas.json','manifest.json') -and $relative -notmatch '^(knowledge|raw|local-books)/.+\.md$'){continue}
    $destination=[IO.Path]::GetFullPath((Join-Path $targetRoot $relative))
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$false)
    $count++
  }
  Write-Output "已导入 $count 份私有资料；重启 npm start 后可选择 Jobs。"
} finally {$zip.Dispose()}
