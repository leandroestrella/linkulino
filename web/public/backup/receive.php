<?php
/**
 * Linkulino — spreadsheet backup receiver.
 *
 * Accepts one POST per call: the whole spreadsheet, exported as XLSX, sent by
 * the Apps Script's daily trigger (see apps-script/Code.js's
 * runScheduledBackup). Writes it to a directory OUTSIDE this docroot — see
 * docs/deployment.md's "spreadsheet backups" setup — so the backups
 * themselves are never web-reachable, only this receiving endpoint is.
 *
 * Config (the shared secret, the backups directory, and retention counts)
 * lives in a file this script doesn't ship and git never sees — created once
 * by hand outside the deployed tree, the same way apps-script/.clasp.json
 * holds per-instance values that never get committed.
 */

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

// Two levels above web/public/backup/receive.php's deployed location
// (docroot/backup/receive.php) lands one level above the docroot itself —
// outside anything Apache serves for this subdomain.
$configPath = dirname(__DIR__, 2) . '/linkulino-backup-config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Backup not configured on this server']);
    exit;
}
$config = require $configPath;

$providedSecret = $_SERVER['HTTP_X_BACKUP_SECRET'] ?? '';
if (!hash_equals((string) $config['secret'], (string) $providedSecret)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Invalid secret']);
    exit;
}

$maxBytes = $config['maxBytes'] ?? 20 * 1024 * 1024; // a real household ledger is a few hundred KB
$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength <= 0 || $contentLength > $maxBytes) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'Payload missing or too large']);
    exit;
}

$body = file_get_contents('php://input');
if ($body === false || strlen($body) === 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Empty body']);
    exit;
}

$backupsDir = rtrim((string) $config['backupsDir'], '/');
if (!is_dir($backupsDir) && !mkdir($backupsDir, 0700, true) && !is_dir($backupsDir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Cannot create backups directory']);
    exit;
}

$filename = 'backup-' . gmdate('Y-m-d_His') . '.xlsx';
$path = $backupsDir . '/' . $filename;

// Write via a temp file + rename so a request that dies mid-upload never
// leaves a half-written file for the retention sweep below to count.
$tmpPath = $path . '.part';
if (file_put_contents($tmpPath, $body) === false || !rename($tmpPath, $path)) {
    @unlink($tmpPath);
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to write backup file']);
    exit;
}

$dailyKeep = (int) ($config['dailyKeep'] ?? 14);
$monthlyKeep = (int) ($config['monthlyKeep'] ?? 6);
$deleted = linkulino_apply_backup_retention($backupsDir, $dailyKeep, $monthlyKeep);

echo json_encode(['ok' => true, 'stored' => $filename, 'deleted' => $deleted]);

/**
 * Keeps the most recent $dailyKeep backups unconditionally, then one backup
 * per calendar month for up to $monthlyKeep further months back; deletes
 * everything else. Returns the deleted filenames.
 * @return string[]
 */
function linkulino_apply_backup_retention(string $dir, int $dailyKeep, int $monthlyKeep): array
{
    $files = glob($dir . '/backup-*.xlsx');
    if ($files === false) {
        return [];
    }
    // Filenames are backup-YYYY-MM-DD_HHMMSS.xlsx, so a plain string sort is
    // already newest-first once reversed.
    rsort($files);

    $keep = array_flip(array_slice($files, 0, $dailyKeep));
    $monthsSeen = [];
    foreach (array_slice($files, $dailyKeep) as $file) {
        if (!preg_match('/backup-(\d{4}-\d{2})-\d{2}_\d{6}\.xlsx$/', basename($file), $m)) {
            continue;
        }
        $month = $m[1];
        if (isset($monthsSeen[$month]) || count($monthsSeen) >= $monthlyKeep) {
            continue;
        }
        $monthsSeen[$month] = true;
        $keep[$file] = true;
    }

    $deleted = [];
    foreach ($files as $file) {
        if (!isset($keep[$file])) {
            @unlink($file);
            $deleted[] = basename($file);
        }
    }
    return $deleted;
}
