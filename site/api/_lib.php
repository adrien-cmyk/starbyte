<?php
// Outils communs au chat et au formulaire de contact de starbyte.online.
// _config.php n'est pas dans le repo : il est écrit sur le serveur par la publication GitHub
// à partir des secrets ANTHROPIC_API_KEY (et optionnellement STARBYTE_CHAT_MODEL).

error_reporting(0);
ini_set('display_errors', '0');

const SB_DATA = __DIR__ . '/_data';
const SB_ORIGINS = ['https://starbyte.online', 'https://www.starbyte.online', 'https://play.starbyte.online'];
const SB_SUPPORT_EMAIL = 'empire@starbyte.online';

function sb_config(): array {
    $f = __DIR__ . '/_config.php';
    $c = is_file($f) ? (include $f) : [];
    return is_array($c) ? $c : [];
}

function sb_json(int $code, array $body): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sb_cors(): void {
    $o = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($o !== '') {
        if (!in_array($o, SB_ORIGINS, true)) sb_json(403, ['error' => 'origin']);
        header('Access-Control-Allow-Origin: ' . $o);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') sb_json(405, ['error' => 'method']);
}

function sb_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? 'x';
}

/** Compteur à fenêtre glissante, stocké dans _data/ (protégé par .htaccess). Renvoie false si la limite est atteinte. */
function sb_rate(string $bucket, int $max, int $window): bool {
    if (!is_dir(SB_DATA)) @mkdir(SB_DATA, 0750, true);
    $f = SB_DATA . '/rl_' . $bucket . '.json';
    $h = @fopen($f, 'c+');
    if (!$h) return true; // en cas de souci disque, on ne bloque pas le joueur
    flock($h, LOCK_EX);
    $raw = stream_get_contents($h);
    $d = json_decode($raw ?: '{}', true) ?: [];
    $now = time();
    $d = array_values(array_filter($d['t'] ?? [], fn($t) => $t > $now - $window));
    $ok = count($d) < $max;
    if ($ok) $d[] = $now;
    ftruncate($h, 0); rewind($h);
    fwrite($h, json_encode(['t' => $d]));
    flock($h, LOCK_UN); fclose($h);
    return $ok;
}

function sb_log(string $what): void {
    if (!is_dir(SB_DATA)) @mkdir(SB_DATA, 0750, true);
    $f = SB_DATA . '/journal.log';
    if (is_file($f) && filesize($f) > 512 * 1024) @rename($f, $f . '.1');
    @file_put_contents($f, date('c') . ' ' . $what . "\n", FILE_APPEND | LOCK_EX);
}

function sb_body(int $maxBytes = 20000): array {
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) sb_json(413, ['error' => 'too_large']);
    $in = json_decode($raw, true);
    if (!is_array($in)) sb_json(400, ['error' => 'bad_json']);
    return $in;
}

function sb_clean(string $s, int $max): string {
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    return trim(mb_substr($s, 0, $max));
}
