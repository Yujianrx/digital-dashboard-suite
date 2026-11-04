param(
  [int]$Port = 8765,
  [switch]$LoopbackOnly = $true
)

$ErrorActionPreference = "Stop"
$AppRoot = Split-Path -Parent $PSScriptRoot
$WebRoot = Join-Path $AppRoot "app\offline-package"
$DataRoot = Join-Path $AppRoot "data"
$BackupRoot = Join-Path $AppRoot "backups"
$LogRoot = Join-Path $AppRoot "logs"
$DataFile = Join-Path $DataRoot "dashboard.db"
$PreviousFile = Join-Path $BackupRoot "dashboard_previous.db"
$LogFile = Join-Path $LogRoot "server.log"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force -Path $DataRoot, $BackupRoot, $LogRoot | Out-Null

function Write-Log([string]$Message) {
  $Line = (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " " + $Message
  [System.IO.File]::AppendAllText($LogFile, $Line + [Environment]::NewLine, $Utf8NoBom)
}

$SqliteSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public sealed class DashboardSqlite : IDisposable
{
    private const string Dll = "winsqlite3.dll";
    private const int SQLITE_OK = 0;
    private const int SQLITE_ROW = 100;
    private const int SQLITE_DONE = 101;
    private static readonly IntPtr SQLITE_TRANSIENT = new IntPtr(-1);
    private IntPtr db;

    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern int sqlite3_open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern int sqlite3_close_v2(IntPtr db);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern int sqlite3_prepare_v2(IntPtr db, byte[] sql, int bytes, out IntPtr statement, IntPtr tail);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern int sqlite3_step(IntPtr statement);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern int sqlite3_finalize(IntPtr statement);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern int sqlite3_bind_text(IntPtr statement, int index, byte[] value, int bytes, IntPtr destructor);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr sqlite3_column_text(IntPtr statement, int column);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern int sqlite3_column_bytes(IntPtr statement, int column);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr sqlite3_errmsg(IntPtr db);

    private static byte[] Utf8(string value)
    {
        byte[] raw = Encoding.UTF8.GetBytes(value ?? "");
        byte[] terminated = new byte[raw.Length + 1];
        Buffer.BlockCopy(raw, 0, terminated, 0, raw.Length);
        return terminated;
    }

    private static string ReadUtf8(IntPtr pointer, int length)
    {
        if (pointer == IntPtr.Zero || length <= 0) return "";
        byte[] bytes = new byte[length];
        Marshal.Copy(pointer, bytes, 0, length);
        return Encoding.UTF8.GetString(bytes);
    }

    private string ErrorMessage()
    {
        IntPtr pointer = sqlite3_errmsg(db);
        if (pointer == IntPtr.Zero) return "SQLite error";
        int length = 0;
        while (Marshal.ReadByte(pointer, length) != 0) length++;
        return ReadUtf8(pointer, length);
    }

    private void Check(int result)
    {
        if (result != SQLITE_OK) throw new InvalidOperationException(ErrorMessage());
    }

    public DashboardSqlite(string path)
    {
        int flags = 2 | 4 | 0x10000;
        int result = sqlite3_open_v2(Utf8(path), out db, flags, IntPtr.Zero);
        if (result != SQLITE_OK) throw new InvalidOperationException("SQLite open failed: " + result);
        Execute("PRAGMA journal_mode=DELETE;");
        Execute("PRAGMA synchronous=FULL;");
        Execute("PRAGMA busy_timeout=5000;");
        Execute("CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);");
        Execute("CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);");
        ExecutePrepared("INSERT OR IGNORE INTO meta(name,value) VALUES(?,?)", new string[] { "revision", "0" });
        ExecutePrepared("INSERT OR IGNORE INTO meta(name,value) VALUES(?,?)", new string[] { "updatedAt", DateTime.UtcNow.ToString("o") });
    }

    private IntPtr Prepare(string sql)
    {
        IntPtr statement;
        byte[] bytes = Utf8(sql);
        Check(sqlite3_prepare_v2(db, bytes, bytes.Length, out statement, IntPtr.Zero));
        return statement;
    }

    private void Bind(IntPtr statement, string[] values)
    {
        for (int i = 0; i < values.Length; i++) {
            byte[] bytes = Utf8(values[i]);
            Check(sqlite3_bind_text(statement, i + 1, bytes, bytes.Length - 1, SQLITE_TRANSIENT));
        }
    }

    public void Execute(string sql)
    {
        IntPtr statement = Prepare(sql);
        try {
            int result = sqlite3_step(statement);
            if (result != SQLITE_DONE && result != SQLITE_ROW) throw new InvalidOperationException(ErrorMessage());
        }
        finally { sqlite3_finalize(statement); }
    }

    public void ExecutePrepared(string sql, string[] values)
    {
        IntPtr statement = Prepare(sql);
        try {
            Bind(statement, values);
            int result = sqlite3_step(statement);
            if (result != SQLITE_DONE) throw new InvalidOperationException(ErrorMessage());
        }
        finally { sqlite3_finalize(statement); }
    }

    public string GetMeta(string name)
    {
        IntPtr statement = Prepare("SELECT value FROM meta WHERE name=?");
        try {
            Bind(statement, new string[] { name });
            int result = sqlite3_step(statement);
            if (result == SQLITE_DONE) return "";
            if (result != SQLITE_ROW) throw new InvalidOperationException(ErrorMessage());
            return ReadUtf8(sqlite3_column_text(statement, 0), sqlite3_column_bytes(statement, 0));
        }
        finally { sqlite3_finalize(statement); }
    }

    public Dictionary<string, string> GetValues()
    {
        Dictionary<string, string> values = new Dictionary<string, string>();
        IntPtr statement = Prepare("SELECT key,value FROM storage ORDER BY key");
        try {
            while (true) {
                int result = sqlite3_step(statement);
                if (result == SQLITE_DONE) break;
                if (result != SQLITE_ROW) throw new InvalidOperationException(ErrorMessage());
                string key = ReadUtf8(sqlite3_column_text(statement, 0), sqlite3_column_bytes(statement, 0));
                string value = ReadUtf8(sqlite3_column_text(statement, 1), sqlite3_column_bytes(statement, 1));
                values[key] = value;
            }
            return values;
        }
        finally { sqlite3_finalize(statement); }
    }

    public void Set(string key, string value)
    {
        ExecutePrepared("INSERT OR REPLACE INTO storage(key,value) VALUES(?,?)", new string[] { key, value });
    }

    public void Remove(string key)
    {
        ExecutePrepared("DELETE FROM storage WHERE key=?", new string[] { key });
    }

    public void Clear() { Execute("DELETE FROM storage;"); }

    public void SetMeta(string name, string value)
    {
        ExecutePrepared("INSERT OR REPLACE INTO meta(name,value) VALUES(?,?)", new string[] { name, value });
    }

    public void Begin() { Execute("BEGIN IMMEDIATE;"); }
    public void Commit() { Execute("COMMIT;"); }
    public void Rollback() { try { Execute("ROLLBACK;"); } catch { } }

    public void Dispose()
    {
        if (db != IntPtr.Zero) {
            sqlite3_close_v2(db);
            db = IntPtr.Zero;
        }
    }
}
'@

try {
  Add-Type -TypeDefinition $SqliteSource -Language CSharp
  $Db = [DashboardSqlite]::new($DataFile)
  if ($Db.GetValues().Count -eq 0) {
    $Seed = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'initial-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $Db.Begin()
    try {
      foreach ($Property in $Seed.PSObject.Properties) { $Db.Set($Property.Name, [string]$Property.Value) }
      $Db.SetMeta('revision', '1')
      $Db.SetMeta('updatedAt', [DateTime]::UtcNow.ToString('o'))
      $Db.Commit()
    } catch { $Db.Rollback(); throw }
  }
} catch {
  Write-Log ("SQLite 数据库初始化失败：" + $_.Exception.ToString())
  throw
}

function Get-StateSnapshot {
  $Values = @{}
  foreach ($Pair in $Db.GetValues().GetEnumerator()) { $Values[[string]$Pair.Key] = [string]$Pair.Value }
  $RevisionText = $Db.GetMeta("revision")
  return @{
    revision = if ($RevisionText) { [int64]$RevisionText } else { 0 }
    updatedAt = [string]$Db.GetMeta("updatedAt")
    values = $Values
  }
}

function Backup-Database {
  if (-not (Test-Path -LiteralPath $DataFile)) { return }
  Copy-Item -LiteralPath $DataFile -Destination $PreviousFile -Force
  $DailyFile = Join-Path $BackupRoot ("dashboard_" + (Get-Date -Format "yyyy-MM-dd") + ".db")
  if (-not (Test-Path -LiteralPath $DailyFile)) {
    Copy-Item -LiteralPath $DataFile -Destination $DailyFile -Force
  }
  $Cutoff = (Get-Date).AddDays(-30)
  Get-ChildItem -LiteralPath $BackupRoot -Filter "dashboard_????-??-??.db" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $Cutoff } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

function Get-JsonMember($Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  if ($Object -is [System.Collections.IDictionary]) {
    # JavaScriptSerializer 在不同 Windows PowerShell/.NET 版本下可能返回
    # Hashtable 或 Dictionary<string,object>。后者的 Contains 重载无法被
    # 部分 PowerShell 5.1 正确绑定，因此只遍历 Keys，避免调用 Contains。
    foreach ($CandidateKey in $Object.Keys) {
      if ([string]::Equals([string]$CandidateKey, $Name, [System.StringComparison]::Ordinal)) {
        return $Object[$CandidateKey]
      }
    }
    return $null
  }
  $Property = $Object.PSObject.Properties[$Name]
  if ($null -eq $Property) { return $null }
  return $Property.Value
}

function Apply-Operation($Operation) {
  $Action = [string](Get-JsonMember $Operation "action")
  if ($Action -eq "clear") { $Db.Clear(); return }
  $Key = [string](Get-JsonMember $Operation "key")
  if ([string]::IsNullOrWhiteSpace($Key)) { throw "数据键不能为空" }
  if ($Action -eq "set") { $Db.Set($Key, [string](Get-JsonMember $Operation "value")); return }
  if ($Action -eq "remove") { $Db.Remove($Key); return }
  throw "不支持的数据操作：$Action"
}

function Write-JsonResponse($Context, [int]$StatusCode, $Body) {
  $Json = $Body | ConvertTo-Json -Depth 20 -Compress
  $Bytes = $Utf8NoBom.GetBytes($Json)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = "application/json; charset=utf-8"
  $Context.Response.Headers["Cache-Control"] = "no-store"
  $Context.Response.ContentLength64 = $Bytes.Length
  $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  $Context.Response.OutputStream.Close()
}

function Write-TextResponse($Context, [int]$StatusCode, [string]$Text) {
  $Bytes = $Utf8NoBom.GetBytes($Text)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = "text/plain; charset=utf-8"
  $Context.Response.ContentLength64 = $Bytes.Length
  $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  $Context.Response.OutputStream.Close()
}

try {
  Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
  $RequestJsonSerializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $RequestJsonSerializer.MaxJsonLength = 104857600
  $RequestJsonSerializer.RecursionLimit = 256
} catch {
  Write-Log ("JSON 解析器初始化失败：" + $_.Exception.ToString())
  throw
}

function Read-RequestJson($Request) {
  if ($Request.ContentLength64 -le 0 -or $Request.ContentLength64 -gt 104857600) { throw "请求大小不正确" }
  $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8, $true)
  try { $Text = $Reader.ReadToEnd() } finally { $Reader.Dispose() }
  try {
    return $RequestJsonSerializer.DeserializeObject($Text)
  } catch {
    throw ("JSON 请求解析失败（UTF-8，长度 " + $Text.Length + "）：" + $_.Exception.Message)
  }
}

function Get-ContentType([string]$Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".js" { "application/javascript; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".webp" { "image/webp" }
    ".svg" { "image/svg+xml" }
    ".ico" { "image/x-icon" }
    ".txt" { "text/plain; charset=utf-8" }
    default { "application/octet-stream" }
  }
}

function Serve-StaticFile($Context) {
  $Relative = [System.Uri]::UnescapeDataString($Context.Request.Url.AbsolutePath.TrimStart('/'))
  if ([string]::IsNullOrWhiteSpace($Relative)) { $Relative = "index.html" }
  $Relative = $Relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $RootFull = [System.IO.Path]::GetFullPath($WebRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  $FullPath = [System.IO.Path]::GetFullPath((Join-Path $WebRoot $Relative))
  if (-not $FullPath.StartsWith($RootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-TextResponse $Context 403 "Forbidden"; return
  }
  if (Test-Path -LiteralPath $FullPath -PathType Container) { $FullPath = Join-Path $FullPath "index.html" }
  if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
    Write-TextResponse $Context 404 "Not Found"; return
  }
  $Bytes = [System.IO.File]::ReadAllBytes($FullPath)
  $Context.Response.StatusCode = 200
  $Context.Response.ContentType = Get-ContentType $FullPath
  $Context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
  $Context.Response.ContentLength64 = $Bytes.Length
  $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  $Context.Response.OutputStream.Close()
}

. (Join-Path $PSScriptRoot 'operations-proxy.ps1')
try { Ensure-OperationsBackend } catch { Write-Log ('Operations startup: ' + $_.Exception.Message) }

if (-not (Test-Path -LiteralPath (Join-Path $WebRoot "index.html"))) { throw "找不到看板文件：$WebRoot" }

$Listener = New-Object System.Net.HttpListener
if ($LoopbackOnly) { $Listener.Prefixes.Add("http://127.0.0.1:$Port/") } else { $Listener.Prefixes.Add("http://+:$Port/") }

try {
  $Listener.Start()
  Write-Log "数字看板主机服务已启动，端口 $Port"
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    try {
      $Path = $Context.Request.Url.AbsolutePath
      $Method = $Context.Request.HttpMethod.ToUpperInvariant()
      if ($Method -eq "GET" -and $Path -eq "/api/storage") { Write-JsonResponse $Context 200 (Get-StateSnapshot); continue }
      if ($Method -eq "GET" -and $Path -eq "/api/revision") {
        $Snapshot = Get-StateSnapshot
        Write-JsonResponse $Context 200 @{ revision = $Snapshot.revision; updatedAt = $Snapshot.updatedAt }; continue
      }
      if ($Method -eq "POST" -and $Path -eq "/api/storage") {
        $Body = Read-RequestJson $Context.Request
        $CurrentRevision = [int64]$Db.GetMeta("revision")
        $BaseRevision = Get-JsonMember $Body "baseRevision"
        if ($null -ne $BaseRevision -and [int64]$BaseRevision -ne $CurrentRevision) {
          Write-JsonResponse $Context 409 @{ revision = $CurrentRevision; message = "共享数据已由其他用户更新" }; continue
        }
        Backup-Database
        $Db.Begin()
        try {
          $Action = [string](Get-JsonMember $Body "action")
          if ($Action -eq "batch") {
            foreach ($Operation in (Get-JsonMember $Body "operations")) { Apply-Operation $Operation }
          } elseif ($Action -eq "import") {
            if ([string](Get-JsonMember $Body "mode") -eq "replace") { $Db.Clear() }
            $ImportValues = Get-JsonMember $Body "values"
            if ($ImportValues -is [System.Collections.IDictionary]) {
              foreach ($Entry in $ImportValues.GetEnumerator()) {
                if ($null -ne $Entry.Value) { $Db.Set([string]$Entry.Key, [string]$Entry.Value) }
              }
            } else {
              foreach ($Property in $ImportValues.PSObject.Properties) {
                if ($null -ne $Property.Value) { $Db.Set([string]$Property.Name, [string]$Property.Value) }
              }
            }
          } else { Apply-Operation $Body }
          $NewRevision = $CurrentRevision + 1
          $UpdatedAt = (Get-Date).ToUniversalTime().ToString("o")
          $Db.SetMeta("revision", [string]$NewRevision)
          $Db.SetMeta("updatedAt", $UpdatedAt)
          $Db.Commit()
        } catch { $Db.Rollback(); throw }
        Write-Log ("已保存共享数据，版本 " + $NewRevision)
        Write-JsonResponse $Context 200 @{ revision = $NewRevision; updatedAt = $UpdatedAt }; continue
      }
      if ($Path.StartsWith("/api/")) { Write-JsonResponse $Context 404 @{ message = "API Not Found" }; continue }
      if ($Path.StartsWith('/operations/api/')) { Write-OperationsResponse $Context; continue }
      Serve-StaticFile $Context
    } catch {
      Write-Log ("请求处理失败：" + $_.Exception.Message)
      try { Write-JsonResponse $Context 500 @{ message = $_.Exception.Message } } catch {}
    }
  }
} catch {
  Write-Log ("主机服务停止：" + $_.Exception.ToString())
  throw
} finally {
  if ($Listener.IsListening) { $Listener.Stop() }
  $Listener.Close()
  $Db.Dispose()
}
