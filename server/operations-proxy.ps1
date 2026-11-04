# No production service is contacted unless an operator explicitly configures a local API.
function Write-OperationsResponse($Context) {
  if ($Context.Request.HttpMethod -ne 'GET') { Write-JsonResponse $Context 405 @{error='Only readonly GET is supported'}; return }
  $Path = $Context.Request.Url.AbsolutePath
  if ($Path -notin @('/operations/api/snapshot','/operations/api/dashboard')) { Write-JsonResponse $Context 404 @{error='API not found'}; return }
  if (-not $env:DASHBOARD_OPERATIONS_API) { Write-JsonResponse $Context 503 @{error='尚未配置自己的经营数据接口；可使用空数据模板'}; return }
  $Base = $env:DASHBOARD_OPERATIONS_API.TrimEnd('/')
  if ($Base -notmatch '^http://(127\.0\.0\.1|localhost):\d+$') { Write-JsonResponse $Context 503 @{error='数据接口须为显式配置的本机地址'}; return }
  $Request = [Net.HttpWebRequest]::Create($Base + '/api/' + $Path.Substring('/operations/api/'.Length) + $Context.Request.Url.Query)
  $Request.Proxy=$null
  $Request.Method='GET'
  $Request.Timeout=15000
  try { $Reply=$Request.GetResponse() }
  catch [Net.WebException] {
    if (-not $_.Exception.Response) { Write-JsonResponse $Context 503 @{error='本机数据接口暂不可用'}; return }
    $Reply=$_.Exception.Response
  }
  try {
    $Buffer=New-Object IO.MemoryStream
    try { $Reply.GetResponseStream().CopyTo($Buffer); $Bytes=$Buffer.ToArray() } finally { $Buffer.Dispose() }
    $Context.Response.StatusCode=[int]$Reply.StatusCode
    $Context.Response.ContentType='application/json; charset=utf-8'
    $Context.Response.Headers['Cache-Control']='no-store'
    $Context.Response.ContentLength64=$Bytes.Length
    $Context.Response.OutputStream.Write($Bytes,0,$Bytes.Length)
    $Context.Response.OutputStream.Close()
  } finally { $Reply.Dispose() }
}
