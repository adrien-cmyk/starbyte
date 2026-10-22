<?php
// Outils communs au chat et au formulaire de contact de starbyte.online.
// _config.php n'est pas dans le repo : il est écrit sur le serveur par la publication GitHub
// à partir des secrets ANTHROPIC_API_KEY (et optionnellement STARBYTE_CHAT_MODEL).

error_reporting(0);
ini_set('display_errors', '0');
date_default_timezone_set('Europe/Zurich');

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
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'OPTIONS') sb_json(405, ['error' => 'method']);
    // Les navigateurs envoient toujours l'origine d'une requête POST : sans origine du site, la requête ne vient pas de nos pages.
    $o = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($o === '') {
        $ref = $_SERVER['HTTP_REFERER'] ?? '';
        $p = $ref !== '' ? parse_url($ref) : null;
        if ($p && !empty($p['scheme']) && !empty($p['host'])) $o = $p['scheme'] . '://' . $p['host'];
    }
    if (!in_array($o, SB_ORIGINS, true)) sb_json(403, ['error' => 'origin']);
    header('Access-Control-Allow-Origin: ' . $o);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
    $ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (strpos($ct, 'application/json') !== 0) sb_json(415, ['error' => 'content_type']);
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

/**
 * Envoi authentifié par SMTP (recommandé par Infomaniak : mail() y est désactivé par défaut et non authentifié).
 * Renvoie true si le serveur a accepté le message, sinon un texte d'erreur (jamais le mot de passe).
 */
function sb_smtp_send(array $cfg, string $to, string $subject, string $body, array $headers) {
    $host = $cfg['smtp_host'] ?? 'mail.infomaniak.com';
    $port = (int)($cfg['smtp_port'] ?? 465);
    $user = $cfg['smtp_user'] ?? SB_SUPPORT_EMAIL;
    $pass = base64_decode($cfg['smtp_pass_b64'] ?? '', true);
    if ($pass === false || $pass === '') return 'no_password';
    $scheme = $port === 465 ? 'ssl://' : 'tcp://';
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host]]);
    $fp = @stream_socket_client($scheme . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) return 'connect: ' . $errstr;
    stream_set_timeout($fp, 20);
    $read = function () use ($fp) {
        $out = '';
        while (($line = fgets($fp, 1024)) !== false) { $out .= $line; if (strlen($line) < 4 || $line[3] === ' ') break; }
        return $out;
    };
    $cmd = function (string $c, array $ok) use ($fp, $read) {
        if ($c !== '') fwrite($fp, $c . "\r\n");
        $r = $read();
        return in_array((int)substr($r, 0, 3), $ok, true) ? true : trim(substr($r, 0, 120));
    };
    $ehlo = 'EHLO starbyte.online';
    foreach ([['', [220]], [$ehlo, [250]]] as [$c, $ok]) { $r = $cmd($c, $ok); if ($r !== true) { fclose($fp); return 'hello: ' . $r; } }
    if ($port === 587) {
        $r = $cmd('STARTTLS', [220]);
        if ($r !== true || !stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { fclose($fp); return 'starttls'; }
        $r = $cmd($ehlo, [250]); if ($r !== true) { fclose($fp); return 'hello2: ' . $r; }
    }
    $steps = [
        ['AUTH LOGIN', [334]], [base64_encode($user), [334]], [base64_encode($pass), [235]],
        ['MAIL FROM:<' . $user . '>', [250]], ['RCPT TO:<' . $to . '>', [250, 251]], ['DATA', [354]],
    ];
    foreach ($steps as $i => [$c, $ok]) {
        $r = $cmd($c, $ok);
        if ($r !== true) { fclose($fp); return ($i <= 2 ? 'auth' : 'envelope') . ': ' . $r; }
    }
    $msgId = '<' . bin2hex(random_bytes(12)) . '@starbyte.online>';
    $all = array_merge(['Date: ' . date('r'), 'To: <' . $to . '>', 'Subject: ' . $subject, 'Message-ID: ' . $msgId], $headers);
    $data = implode("\r\n", $all) . "\r\n\r\n" . preg_replace('/^\./m', '..', str_replace(["\r\n", "\n"], ["\n", "\r\n"], $body));
    $r = $cmd($data . "\r\n.", [250]);
    @$cmd('QUIT', [221]);
    fclose($fp);
    return $r === true ? true : 'data: ' . $r;
}
